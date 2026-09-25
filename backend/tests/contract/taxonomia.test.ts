// T004/T007 (004-fix-taxonomia-endpoint): no existía cobertura para este
// endpoint desde su creación en 002-backend-api-carga-datos — causa raíz
// documentada de D11 (docs/decisiones-pendientes.md): la regresión de
// 003-taxonomia-parametrizable rompió GET/PUT sin que ningún test lo
// detectara. Cubre US1 (consulta agrupada) y US2 (reemplazo atómico).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, hacerAdmin, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-taxonomia'
const PREFIJO_PREGUNTA = 'prueba_test_taxonomia'
const pool = getPgPool()

async function limpiarPreguntasDePrueba() {
  await pool.query('DELETE FROM taxonomia_preguntas WHERE codigo LIKE $1', [`${PREFIJO_PREGUNTA}%`])
}

describe('Contrato: taxonomía de organismos (GET/PUT)', () => {
  let app: FastifyInstance
  let cookieAdmin: string
  let orgConTaxonomiaMigradaId: number
  let orgSinTaxonomiaId: number
  const codigoPreguntaMultiple = `${PREFIJO_PREGUNTA}_multiple`

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await limpiarPreguntasDePrueba()
    app = await buildApp()

    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-admin@example.observatorio.test`)
    await hacerAdmin(pool, admin.usuarioId)
    cookieAdmin = admin.cookie

    // Organismo real con las 9 respuestas migradas de 003 — solo lectura,
    // nunca se le hace PUT en este archivo (son datos reales, no de prueba).
    const { rows } = await pool.query<{ organismo_id: number }>(
      'SELECT organismo_id FROM evaluaciones_taxonomicas_v1_legacy LIMIT 1',
    )
    orgConTaxonomiaMigradaId = rows[0]!.organismo_id

    // Organismo nuevo, propiedad del admin, sin ninguna evaluación —
    // usado tanto para el caso "sin evaluación" (US1) como para los PUT
    // de reemplazo (US2), que si tocaran el organismo migrado de arriba
    // estarían mutando datos reales.
    const creado = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieAdmin },
      payload: { denominacion: `${PREFIJO} org`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 },
    })
    orgSinTaxonomiaId = creado.json().id

    // Pregunta opcion_multiple de prueba — ninguna de las 9 migradas lo es.
    // Desde la migración 0003 (Protección A, US4), una pregunta sin ninguna
    // fila en taxonomia_pregunta_tipos_oficina no aplica a NINGÚN tipo de
    // organismo — hay que vincularla explícitamente al tipo del organismo
    // de prueba (tipoOficinaId: 1, "oficina judicial") o toda escritura
    // quedaría rechazada por Protección A, no por lo que el test quiere
    // probar.
    await pool.query(
      `INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
       VALUES ($1, 'Pregunta de prueba (multiple)', 'gestion', 'opcion_multiple', 500)`,
      [codigoPreguntaMultiple],
    )
    await pool.query(
      `INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
       SELECT id, 'X', 'Opción X', 1 FROM taxonomia_preguntas WHERE codigo = $1
       UNION ALL
       SELECT id, 'Y', 'Opción Y', 2 FROM taxonomia_preguntas WHERE codigo = $1`,
      [codigoPreguntaMultiple],
    )
    await pool.query(
      `INSERT INTO taxonomia_pregunta_tipos_oficina (pregunta_id, tipo_oficina_id)
       SELECT id, 1 FROM taxonomia_preguntas WHERE codigo = $1`,
      [codigoPreguntaMultiple],
    )
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await limpiarPreguntasDePrueba()
    await app.close()
  })

  // ---------------------------------------------------------- US1 (GET) --

  it('GET de un organismo con las 9 respuestas migradas trae 9 entradas con código/texto/tipo/opción (FR-001/FR-002)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgConTaxonomiaMigradaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{
      pregunta: { codigo: string; texto: string; grupo: string; tipoRespuesta: string }
      opciones?: { codigo: string; etiqueta: string }[]
    }>
    expect(body).toHaveLength(9)
    for (const entrada of body) {
      expect(entrada.pregunta.codigo).toBeTruthy()
      expect(entrada.pregunta.texto).toBeTruthy()
      expect(entrada.pregunta.tipoRespuesta).toBe('opcion_unica')
      expect(entrada.opciones).toHaveLength(1)
      expect(entrada.opciones![0]!.codigo).toBeTruthy()
      expect(entrada.opciones![0]!.etiqueta).toBeTruthy()
    }
  })

  it('GET de un organismo real sin ninguna evaluación cargada da 200 con [] (FR-003)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('GET de un :orgId inexistente da 404 (FR-004)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/organismos/999999999/taxonomia',
      headers: { cookie: cookieAdmin },
    })
    expect(res.statusCode).toBe(404)
  })

  it('GET sin ser dueño/editor/admin da 403 (FR-012)', async () => {
    const otro = await crearUsuarioDePrueba(app, `${PREFIJO}-otro@example.observatorio.test`)
    const res = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: otro.cookie },
    })
    expect(res.statusCode).toBe(403)
  })

  // ---------------------------------------------------------- US2 (PUT) --

  it('PUT con un conjunto válido, incluida una pregunta opcion_multiple con 2 opciones — GET posterior exactamente igual (FR-005/FR-007)', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
      payload: {
        respuestas: [
          { preguntaCodigo: 'autonomia', opcionesCodigos: ['A'] },
          { preguntaCodigo: codigoPreguntaMultiple, opcionesCodigos: ['X', 'Y'] },
        ],
      },
    })
    expect(put.statusCode).toBe(200)

    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
    })
    const body = get.json() as Array<{ pregunta: { codigo: string }; opciones?: { codigo: string }[] }>
    expect(body).toHaveLength(2)
    const autonomia = body.find((e) => e.pregunta.codigo === 'autonomia')
    expect(autonomia?.opciones).toEqual([{ codigo: 'A', etiqueta: expect.any(String) }])
    const multiple = body.find((e) => e.pregunta.codigo === codigoPreguntaMultiple)
    expect(multiple?.opciones?.map((o) => o.codigo).sort()).toEqual(['X', 'Y'])
  })

  it('PUT que omite una pregunta que sí tenía respuesta la deja sin respuesta después (FR-007, reemplazo completo)', async () => {
    // el test anterior dejó 2 preguntas respondidas; este PUT solo reenvía 1
    const put = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
      payload: { respuestas: [{ preguntaCodigo: 'autonomia', opcionesCodigos: ['B'] }] },
    })
    expect(put.statusCode).toBe(200)

    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
    })
    const body = get.json() as Array<{ pregunta: { codigo: string } }>
    expect(body).toHaveLength(1)
    expect(body[0]!.pregunta.codigo).toBe('autonomia')
  })

  it('PUT con respuestas: [] deja al organismo sin ninguna respuesta (FR-008)', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
      payload: { respuestas: [] },
    })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toEqual([])

    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
    })
    expect(get.json()).toEqual([])
  })

  // ------------------------------------------------- US3 (error 400, no 500) --

  it('PUT con una opción que pertenece a otra pregunta — 400 identificable, taxonomía previa intacta (FR-007/FR-009/FR-010/FR-011)', async () => {
    // fixture: dejar al organismo con una respuesta válida conocida primero
    const setup = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
      payload: { respuestas: [{ preguntaCodigo: 'autonomia', opcionesCodigos: ['A'] }] },
    })
    expect(setup.statusCode).toBe(200)

    const put = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
      // 'B' es una opción real de 'jerarquia_normativa', no de 'autonomia'
      payload: { respuestas: [{ preguntaCodigo: 'autonomia', opcionesCodigos: ['ZZZ-inexistente'] }] },
    })
    expect(put.statusCode).toBe(400)
    expect(put.json().error).toBeTruthy()

    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
    })
    const body = get.json() as Array<{ pregunta: { codigo: string }; opciones?: { codigo: string }[] }>
    expect(body).toHaveLength(1)
    expect(body[0]!.opciones).toEqual([{ codigo: 'A', etiqueta: expect.any(String) }])
  })

  it('PUT con dos respuestas para una pregunta no-múltiple — 400 (FR-006)', async () => {
    const preguntaCodigo = `${PREFIJO_PREGUNTA}_no_multiple_duplicada`
    await pool.query(
      `INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
       VALUES ($1, 'Prueba duplicada', 'gestion', 'opcion_unica', 501)`,
      [preguntaCodigo],
    )
    await pool.query(
      `INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
       SELECT id, 'SI', 'Sí', 1 FROM taxonomia_preguntas WHERE codigo = $1
       UNION ALL
       SELECT id, 'NO', 'No', 2 FROM taxonomia_preguntas WHERE codigo = $1`,
      [preguntaCodigo],
    )
    // vinculada al tipo del organismo de prueba — si no, Protección A (0003)
    // la rechazaría por eso, no por FR-006, que es lo que este test prueba.
    await pool.query(
      `INSERT INTO taxonomia_pregunta_tipos_oficina (pregunta_id, tipo_oficina_id)
       SELECT id, 1 FROM taxonomia_preguntas WHERE codigo = $1`,
      [preguntaCodigo],
    )

    // El body no puede expresar 2 respuestas para la misma pregunta con
    // opcionesCodigos (se insertaría una fila por código) salvo mandando 2
    // códigos de opción para una pregunta que NO es multiple — exactamente
    // el caso que FR-006 debe rechazar.
    const put = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
      payload: { respuestas: [{ preguntaCodigo, opcionesCodigos: ['SI', 'NO'] }] },
    })
    expect(put.statusCode).toBe(400)
  })

  it('PUT con forma equivocada para el tipo de la pregunta (opción para numérica) — 400 (FR-004/FR-008)', async () => {
    const preguntaCodigo = `${PREFIJO_PREGUNTA}_numerica_forma`
    await pool.query(
      `INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
       VALUES ($1, 'Prueba numérica', 'gestion', 'numerica', 502)`,
      [preguntaCodigo],
    )
    // vinculada al tipo del organismo de prueba — si no, Protección A (0003)
    // la rechazaría por eso, no por FR-004/FR-008, que es lo que este test prueba.
    await pool.query(
      `INSERT INTO taxonomia_pregunta_tipos_oficina (pregunta_id, tipo_oficina_id)
       SELECT id, 1 FROM taxonomia_preguntas WHERE codigo = $1`,
      [preguntaCodigo],
    )

    const put = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
      // una pregunta numérica no tiene ninguna opción real -> el JOIN no
      // encuentra nada, opcion_id sale NULL, y como no hay valor_numero/
      // valor_texto tampoco, el CHECK "exactamente uno de tres" la rechaza
      // igual — sigue siendo un rechazo identificable, no un 500.
      payload: { respuestas: [{ preguntaCodigo, opcionesCodigos: ['NO-EXISTE'] }] },
    })
    expect(put.statusCode).toBe(400)
  })

  // ------------------------------------------- US4 (Protección A, endpoint) --

  it('PUT para un organismo de un tipo no aplicable a la pregunta — 400, reutiliza el mapeo de error de US3 (SC-006)', async () => {
    const conteoOrg311Antes = (
      await pool.query<{ count: string }>('SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = 311')
    ).rows[0]!.count

    const creado = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieAdmin },
      // unidad operativa — ninguna de las 9 preguntas migradas le aplica
      payload: { denominacion: `${PREFIJO} unidad operativa`, denominacionSimplificadaId: 1, tipoOficinaId: 4, provinciaId: 1 },
    })
    const orgUnidadOperativaId = creado.json().id

    const put = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgUnidadOperativaId}/taxonomia`,
      headers: { cookie: cookieAdmin },
      payload: { respuestas: [{ preguntaCodigo: 'autonomia', opcionesCodigos: ['A'] }] },
    })
    expect(put.statusCode).toBe(400)
    expect(put.json().error).toMatch(/no aplica al tipo de organismo actual/)

    // el caso que originó esta protección: el organismo histórico id=311
    // (OGA MEDIACIÓN) no se ve afectado por nada de lo anterior
    const conteoOrg311Despues = (
      await pool.query<{ count: string }>('SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = 311')
    ).rows[0]!.count
    expect(conteoOrg311Despues).toBe(conteoOrg311Antes)
    expect(conteoOrg311Despues).toBe('9')
  })

  // ------------------------- 007 US7: el rechazo identifica la pregunta (FR-026/FR-027, SC-010) --

  describe('007 — rechazos identificables por una persona', () => {
    // Nada de ids internos, nombres de tabla/columna ni referencias a requisitos.
    const TECNICO = /pregunta_id|opcion_id|tipo_oficina_id|organismo_id|evaluaciones_taxonomicas|\bFR-\d|Protección|\b\d+\b/
    const put = (orgId: number, respuestas: unknown[]) =>
      app.inject({ method: 'PUT', url: `/api/organismos/${orgId}/taxonomia`, headers: { cookie: cookieAdmin }, payload: { respuestas } })
    const identificado = (res: { statusCode: number; json: () => Record<string, string> }, codigo: string, texto: string, mensaje: string) => {
      expect(res.statusCode).toBe(400)
      const b = res.json()
      expect(b.error).toBe(mensaje)
      expect(b.preguntaCodigo).toBe(codigo)
      expect(b.preguntaTexto).toBe(texto)
      expect(b.error).not.toMatch(TECNICO)
    }

    it('pregunta que no aplica al tipo del organismo → mensaje con la pregunta + preguntaCodigo/preguntaTexto', async () => {
      const creado = await app.inject({
        method: 'POST', url: '/api/organismos', headers: { cookie: cookieAdmin },
        payload: { denominacion: `${PREFIJO} unidad operativa 007`, denominacionSimplificadaId: 1, tipoOficinaId: 4, provinciaId: 1 },
      })
      const res = await put(creado.json().id, [{ preguntaCodigo: 'autonomia', opcionesCodigos: ['A'] }])
      identificado(res, 'autonomia', 'autonomia', 'La pregunta «autonomia» no aplica al tipo de organismo actual.')
    })

    it('opción inexistente / ajena a la pregunta → nombra la opción y la pregunta, con el texto si difiere del código', async () => {
      const res = await put(orgSinTaxonomiaId, [{ preguntaCodigo: codigoPreguntaMultiple, opcionesCodigos: ['ZZZ'] }])
      identificado(
        res,
        codigoPreguntaMultiple,
        'Pregunta de prueba (multiple)',
        `La opción «ZZZ» no existe para la pregunta «${codigoPreguntaMultiple}» (Pregunta de prueba (multiple)).`,
      )
      // una opción REAL de otra pregunta ('X' es de la múltiple) tampoco pertenece a 'autonomia'
      const ajena = await put(orgSinTaxonomiaId, [{ preguntaCodigo: 'autonomia', opcionesCodigos: ['X'] }])
      identificado(ajena, 'autonomia', 'autonomia', 'La opción «X» no existe para la pregunta «autonomia».')
    })

    it('valor de un tipo que la pregunta no admite → identifica la pregunta y la regla', async () => {
      const codigoNum = `${PREFIJO_PREGUNTA}_num_007`
      await pool.query(`INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden) VALUES ($1, $1, 'gestion', 'numerica', 503)`, [codigoNum])
      await pool.query(`INSERT INTO taxonomia_pregunta_tipos_oficina (pregunta_id, tipo_oficina_id) SELECT id, 1 FROM taxonomia_preguntas WHERE codigo = $1`, [codigoNum])
      identificado(
        await put(orgSinTaxonomiaId, [{ preguntaCodigo: codigoNum, valorTexto: 'no es un número' }]),
        codigoNum, codigoNum, `La pregunta «${codigoNum}» admite un valor numérico; se recibió un valor de otro tipo.`,
      )
      identificado(
        await put(orgSinTaxonomiaId, [{ preguntaCodigo: 'autonomia', valorNumero: 5 }]),
        'autonomia', 'autonomia', 'La pregunta «autonomia» admite una opción; se recibió un valor de otro tipo.',
      )
    })

    it('dos respuestas a una pregunta de opción única → "admite una sola respuesta"', async () => {
      const res = await put(orgSinTaxonomiaId, [{ preguntaCodigo: 'autonomia', opcionesCodigos: ['A', 'B'] }])
      identificado(res, 'autonomia', 'autonomia', 'La pregunta «autonomia» admite una sola respuesta.')
    })

    it('varias respuestas inválidas en un mismo guardado: se identifica al menos la primera (US7-4) y no se guarda nada', async () => {
      const antes = await app.inject({ method: 'GET', url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`, headers: { cookie: cookieAdmin } })
      const res = await put(orgSinTaxonomiaId, [
        { preguntaCodigo: 'autonomia', opcionesCodigos: ['ZZZ'] },
        { preguntaCodigo: 'dependencia', opcionesCodigos: ['YYY'] },
      ])
      expect(res.statusCode).toBe(400)
      expect(['autonomia', 'dependencia']).toContain(res.json().preguntaCodigo)
      expect(res.json().error).not.toMatch(TECNICO)
      const despues = await app.inject({ method: 'GET', url: `/api/organismos/${orgSinTaxonomiaId}/taxonomia`, headers: { cookie: cookieAdmin } })
      expect(despues.json()).toEqual(antes.json())
    })

    it('una pregunta inexistente conserva el mensaje de 004 (sin preguntaCodigo)', async () => {
      const res = await put(orgSinTaxonomiaId, [{ preguntaCodigo: 'no_existe_007', opcionesCodigos: ['A'] }])
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('Pregunta(s) inexistente(s): no_existe_007')
    })
  })
})
