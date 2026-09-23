// T022 (US2): CRUD de organismos (FR-012, FR-013). T024: subrutas de UF y
// taxonomía, autorizadas SIEMPRE contra el organismo padre (FR-014) — nunca
// una regla propia.
//
// FR-013 / Principio II en código: el body de POST/PATCH nunca se vuelca
// entero al INSERT/UPDATE. Cada columna se lee explícitamente del body
// tipado (`body.denominacion`, etc.); `propietario_id` NUNCA se lee del
// body — se fuerza siempre a `identidad.usuarioId` de la sesión. Aunque el
// cliente mande `propietarioId` en el JSON, no existe ninguna línea de
// código que lo copie a la query — no es una validación que lo rechace, es
// que la ruta de datos para ese campo simplemente no existe desde el body.
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Type, type Static } from '@sinclair/typebox'
import type pg from 'pg'
import { getPgPool } from '../db/pool.js'
import { conTransaccion } from '../db/transaction.js'
import { esRechazoDeTrigger } from '../http/trigger-error.js'
import { buscarOrganismoParaAutorizar, puedeGestionarOrganismo } from '../authz/organismos.js'

const CrearOrganismoBody = Type.Object({
  denominacion: Type.String({ minLength: 1 }),
  denominacionSimplificadaId: Type.Integer(),
  tipoOficinaId: Type.Integer(),
  provinciaId: Type.Integer(),
})
type CrearOrganismoBody = Static<typeof CrearOrganismoBody>

// T015 (004-fix-taxonomia-endpoint, US5): confirmarPerdidaTaxonomia —
// Protección B. Campo opcional; solo importa cuando el body también trae
// tipoOficinaId distinto del actual (ver el handler de PATCH).
const ActualizarOrganismoBody = Type.Object({
  ...Type.Partial(CrearOrganismoBody).properties,
  confirmarPerdidaTaxonomia: Type.Optional(Type.Boolean()),
})
type ActualizarOrganismoBody = Static<typeof ActualizarOrganismoBody>

const CrearUFBody = Type.Object({
  denominacionUnidad: Type.String({ minLength: 1 }),
  localidadId: Type.Integer(),
  tipoUfId: Type.Integer(),
  anioImplementacion: Type.Optional(Type.Integer()),
  domicilio: Type.Optional(Type.String()),
  telefono: Type.Optional(Type.String()),
  mail: Type.Optional(Type.String()),
  responsable: Type.Optional(Type.String()),
  codigoPostal: Type.Optional(Type.String()),
})
type CrearUFBody = Static<typeof CrearUFBody>

const ActualizarUFBody = Type.Partial(CrearUFBody)

// T002 (004-fix-taxonomia-endpoint, Foundational): reemplaza el TaxonomiaBody
// viejo (9 columnas fijas, esquema de 001 — roto desde 003-taxonomia-parametrizable,
// ver docs/decisiones-pendientes.md D11). La forma nueva de una respuesta,
// direccionada por preguntaCodigo/opcionesCodigos — nunca por id interno
// (FR-005) — usada por el body de PUT (US2, T006).
const RespuestaTaxonomiaItem = Type.Object({
  preguntaCodigo: Type.String({ minLength: 1 }),
  opcionesCodigos: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  valorNumero: Type.Optional(Type.Number()),
  valorTexto: Type.Optional(Type.String()),
})
const ReemplazarTaxonomiaBody = Type.Object({
  respuestas: Type.Array(RespuestaTaxonomiaItem),
})
type ReemplazarTaxonomiaBody = Static<typeof ReemplazarTaxonomiaBody>

function idParam(request: { params: unknown }, campo = 'id'): number {
  return Number((request.params as Record<string, string>)[campo])
}

export async function registrarRutasOrganismos(app: FastifyInstance) {
  const pool = getPgPool()

  // --- Organismos (FR-012, FR-013) ---

  app.get('/api/organismos', async (request) => {
    const identidad = request.identidad!
    if (identidad.rol === 'admin') {
      const { rows } = await pool.query('SELECT id, denominacion, propietario_id FROM organismos ORDER BY id')
      return rows
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT o.id, o.denominacion, o.propietario_id
         FROM organismos o
         LEFT JOIN organismo_editores oe ON oe.organismo_id = o.id
        WHERE o.propietario_id = $1 OR oe.usuario_id = $1
        ORDER BY o.id`,
      [identidad.usuarioId],
    )
    return rows
  })

  app.post<{ Body: CrearOrganismoBody }>(
    '/api/organismos',
    { schema: { body: CrearOrganismoBody } },
    async (request, reply) => {
      const identidad = request.identidad!
      const { denominacion, denominacionSimplificadaId, tipoOficinaId, provinciaId } = request.body
      const firestoreIdSintetico = `api:${randomUUID()}`

      const { rows } = await pool.query(
        `INSERT INTO organismos
           (denominacion, denominacion_simplificada_id, tipo_oficina_id, provincia_id,
            propietario_id, estado_fueros, actualizado_a, firestore_id)
         VALUES ($1, $2, $3, $4, $5, 'sin_fueros_asignados', now(), $6)
         RETURNING id, denominacion, propietario_id`,
        [denominacion, denominacionSimplificadaId, tipoOficinaId, provinciaId, identidad.usuarioId, firestoreIdSintetico],
      )
      reply.code(201)
      return rows[0]
    },
  )

  app.get('/api/organismos/:id', async (request, reply) => {
    const id = idParam(request)
    const organismo = await buscarOrganismoParaAutorizar(pool, id)
    if (!organismo) return reply.code(404).send({ error: 'No encontrado' })
    if (!puedeGestionarOrganismo(request.identidad!, organismo)) {
      return reply.code(403).send({ error: 'No autorizado' })
    }
    const { rows } = await pool.query('SELECT * FROM organismos WHERE id = $1', [id])
    return rows[0]
  })

  app.patch<{ Body: ActualizarOrganismoBody }>(
    '/api/organismos/:id',
    { schema: { body: ActualizarOrganismoBody } },
    async (request, reply) => {
      const id = idParam(request)
      const organismo = await buscarOrganismoParaAutorizar(pool, id)
      if (!organismo) return reply.code(404).send({ error: 'No encontrado' })
      if (!puedeGestionarOrganismo(request.identidad!, organismo)) {
        return reply.code(403).send({ error: 'No autorizado' })
      }

      const { denominacion, denominacionSimplificadaId, tipoOficinaId, provinciaId, confirmarPerdidaTaxonomia } =
        request.body

      // T016 (US5, Protección B): solo aplica cuando el body cambia
      // tipoOficinaId a un valor distinto del actual.
      let huerfanas: { pregunta_id: number; codigo: string; texto: string }[] = []
      if (tipoOficinaId !== undefined) {
        const { rows: actual } = await pool.query<{ tipo_oficina_id: number }>(
          'SELECT tipo_oficina_id FROM organismos WHERE id = $1',
          [id],
        )
        if (actual[0]!.tipo_oficina_id !== tipoOficinaId) {
          const { rows } = await pool.query<{ pregunta_id: number; codigo: string; texto: string }>(
            `SELECT DISTINCT p.id AS pregunta_id, p.codigo, p.texto
               FROM evaluaciones_taxonomicas e
               JOIN taxonomia_preguntas p ON p.id = e.pregunta_id
              WHERE e.organismo_id = $1
                AND NOT taxonomia_pregunta_aplica_a_tipo(e.pregunta_id, $2)`,
            [id, tipoOficinaId],
          )
          huerfanas = rows
        }
      }

      if (huerfanas.length > 0 && confirmarPerdidaTaxonomia !== true) {
        return reply.code(400).send({
          error: `El cambio de tipo dejaría sin aplicar ${huerfanas.length} respuesta(s) de taxonomía`,
          preguntasQueSePerderian: huerfanas.map((h) => ({ codigo: h.codigo, texto: h.texto })),
        })
      }

      const actualizar = async (client: pg.Pool | pg.PoolClient) => {
        const { rows } = await client.query(
          `UPDATE organismos SET
             denominacion = COALESCE($2, denominacion),
             denominacion_simplificada_id = COALESCE($3, denominacion_simplificada_id),
             tipo_oficina_id = COALESCE($4, tipo_oficina_id),
             provincia_id = COALESCE($5, provincia_id),
             actualizado_a = now()
           WHERE id = $1
           RETURNING id, denominacion, propietario_id`,
          [id, denominacion ?? null, denominacionSimplificadaId ?? null, tipoOficinaId ?? null, provinciaId ?? null],
        )
        return rows[0]
      }

      if (huerfanas.length > 0) {
        // Confirmado: DELETE de las huérfanas + UPDATE de tipo, atómico.
        const resultado = await conTransaccion(pool, async (client) => {
          await client.query(
            'DELETE FROM evaluaciones_taxonomicas WHERE organismo_id = $1 AND pregunta_id = ANY($2)',
            [id, huerfanas.map((h) => h.pregunta_id)],
          )
          return actualizar(client)
        })
        return resultado
      }

      return actualizar(pool)
    },
  )

  app.delete('/api/organismos/:id', async (request, reply) => {
    const id = idParam(request)
    const organismo = await buscarOrganismoParaAutorizar(pool, id)
    if (!organismo) return reply.code(404).send({ error: 'No encontrado' })
    if (!puedeGestionarOrganismo(request.identidad!, organismo)) {
      return reply.code(403).send({ error: 'No autorizado' })
    }
    await pool.query('DELETE FROM organismos WHERE id = $1', [id])
    reply.code(204)
  })

  // --- Unidades funcionales (FR-014: autorización = la del organismo padre) ---

  async function autorizarContraOrganismoPadre(request: { params: unknown; identidad?: unknown }, reply: { code: (n: number) => { send: (b: unknown) => void } }) {
    const orgId = idParam(request, 'orgId')
    const organismo = await buscarOrganismoParaAutorizar(pool, orgId)
    if (!organismo) {
      reply.code(404).send({ error: 'Organismo no encontrado' })
      return null
    }
    if (!puedeGestionarOrganismo(request.identidad as never, organismo)) {
      reply.code(403).send({ error: 'No autorizado' })
      return null
    }
    return orgId
  }

  app.get('/api/organismos/:orgId/unidades-funcionales', async (request, reply) => {
    const orgId = await autorizarContraOrganismoPadre(request, reply)
    if (orgId === null) return
    const { rows } = await pool.query('SELECT * FROM unidades_funcionales WHERE organismo_id = $1 ORDER BY id', [
      orgId,
    ])
    return rows
  })

  app.post<{ Body: CrearUFBody }>(
    '/api/organismos/:orgId/unidades-funcionales',
    { schema: { body: CrearUFBody } },
    async (request, reply) => {
      const orgId = await autorizarContraOrganismoPadre(request, reply)
      if (orgId === null) return
      const { denominacionUnidad, localidadId, tipoUfId, anioImplementacion, domicilio, telefono, mail, responsable, codigoPostal } =
        request.body
      const firestoreIdSintetico = `api:${randomUUID()}`
      const { rows } = await pool.query(
        `INSERT INTO unidades_funcionales
           (organismo_id, denominacion_unidad, localidad_id, tipo_uf_id, anio_implementacion,
            domicilio, telefono, mail, responsable, codigo_postal, firestore_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          orgId,
          denominacionUnidad,
          localidadId,
          tipoUfId,
          anioImplementacion ?? null,
          domicilio ?? null,
          telefono ?? null,
          mail ?? null,
          responsable ?? null,
          codigoPostal ?? null,
          firestoreIdSintetico,
        ],
      )
      reply.code(201)
      return rows[0]
    },
  )

  app.get('/api/organismos/:orgId/unidades-funcionales/:ufId', async (request, reply) => {
    const orgId = await autorizarContraOrganismoPadre(request, reply)
    if (orgId === null) return
    const ufId = idParam(request, 'ufId')
    const { rows } = await pool.query('SELECT * FROM unidades_funcionales WHERE id = $1 AND organismo_id = $2', [
      ufId,
      orgId,
    ])
    if (rows.length === 0) return reply.code(404).send({ error: 'No encontrado' })
    return rows[0]
  })

  app.patch<{ Body: Static<typeof ActualizarUFBody> }>(
    '/api/organismos/:orgId/unidades-funcionales/:ufId',
    { schema: { body: ActualizarUFBody } },
    async (request, reply) => {
      const orgId = await autorizarContraOrganismoPadre(request, reply)
      if (orgId === null) return
      const ufId = idParam(request, 'ufId')
      const b = request.body
      const { rows } = await pool.query(
        `UPDATE unidades_funcionales SET
           denominacion_unidad = COALESCE($3, denominacion_unidad),
           localidad_id = COALESCE($4, localidad_id),
           tipo_uf_id = COALESCE($5, tipo_uf_id),
           anio_implementacion = COALESCE($6, anio_implementacion),
           domicilio = COALESCE($7, domicilio),
           telefono = COALESCE($8, telefono),
           mail = COALESCE($9, mail),
           responsable = COALESCE($10, responsable),
           codigo_postal = COALESCE($11, codigo_postal)
         WHERE id = $1 AND organismo_id = $2
         RETURNING *`,
        [
          ufId,
          orgId,
          b.denominacionUnidad ?? null,
          b.localidadId ?? null,
          b.tipoUfId ?? null,
          b.anioImplementacion ?? null,
          b.domicilio ?? null,
          b.telefono ?? null,
          b.mail ?? null,
          b.responsable ?? null,
          b.codigoPostal ?? null,
        ],
      )
      if (rows.length === 0) return reply.code(404).send({ error: 'No encontrado' })
      return rows[0]
    },
  )

  app.delete('/api/organismos/:orgId/unidades-funcionales/:ufId', async (request, reply) => {
    const orgId = await autorizarContraOrganismoPadre(request, reply)
    if (orgId === null) return
    const ufId = idParam(request, 'ufId')
    const resultado = await pool.query('DELETE FROM unidades_funcionales WHERE id = $1 AND organismo_id = $2', [
      ufId,
      orgId,
    ])
    if (resultado.rowCount === 0) return reply.code(404).send({ error: 'No encontrado' })
    reply.code(204)
  })

  // --- Taxonomía (FR-014, 1:1 con el organismo; 004-fix-taxonomia-endpoint) ---

  // T002 (Foundational): consulta compartida entre GET (US1) y la respuesta
  // de PUT (US2) — agrupa por pregunta (data-model.md, "Vista de consulta/
  // reemplazo"). json_agg con FILTER deja `opciones` en null cuando la
  // pregunta no es de opción — se traduce a `undefined` (campo ausente) más
  // abajo, nunca a un array vacío ni a un null explícito en el JSON.
  async function obtenerTaxonomiaOrganismo(orgId: number) {
    const { rows } = await pool.query<{
      pregunta_codigo: string
      pregunta_texto: string
      pregunta_grupo: string
      tipo_respuesta: 'opcion_unica' | 'opcion_multiple' | 'numerica' | 'texto_libre'
      opciones: { codigo: string; etiqueta: string }[] | null
      valor_numero: string | null
      valor_texto: string | null
    }>(
      `SELECT
         p.codigo AS pregunta_codigo, p.texto AS pregunta_texto, p.grupo AS pregunta_grupo, p.tipo_respuesta,
         json_agg(json_build_object('codigo', o.codigo, 'etiqueta', o.etiqueta) ORDER BY o.orden)
           FILTER (WHERE o.id IS NOT NULL) AS opciones,
         max(e.valor_numero) AS valor_numero,
         max(e.valor_texto) AS valor_texto
       FROM evaluaciones_taxonomicas e
       JOIN taxonomia_preguntas p ON p.id = e.pregunta_id
       LEFT JOIN taxonomia_opciones o ON o.id = e.opcion_id
       WHERE e.organismo_id = $1
       GROUP BY p.id, p.codigo, p.texto, p.grupo, p.tipo_respuesta
       ORDER BY p.orden`,
      [orgId],
    )

    return rows.map((r) => {
      const pregunta = {
        codigo: r.pregunta_codigo,
        texto: r.pregunta_texto,
        grupo: r.pregunta_grupo,
        tipoRespuesta: r.tipo_respuesta,
      }
      if (r.tipo_respuesta === 'numerica') return { pregunta, valorNumero: Number(r.valor_numero) }
      if (r.tipo_respuesta === 'texto_libre') return { pregunta, valorTexto: r.valor_texto }
      return { pregunta, opciones: r.opciones ?? [] }
    })
  }

  app.get('/api/organismos/:orgId/taxonomia', async (request, reply) => {
    const orgId = await autorizarContraOrganismoPadre(request, reply)
    if (orgId === null) return
    return obtenerTaxonomiaOrganismo(orgId)
  })

  app.put<{ Body: ReemplazarTaxonomiaBody }>(
    '/api/organismos/:orgId/taxonomia',
    { schema: { body: ReemplazarTaxonomiaBody } },
    async (request, reply) => {
      const orgId = await autorizarContraOrganismoPadre(request, reply)
      if (orgId === null) return

      // FR-013: un preguntaCodigo desconocido debe rechazarse con un error
      // de cliente identificable — un INSERT con pregunta_id NULL violaría
      // un NOT NULL (SQLSTATE 23502), no un trigger (P0001), así que no lo
      // detectaría esRechazoDeTrigger (US3). Se valida antes de tocar nada.
      const codigosPreguntas = [...new Set(request.body.respuestas.map((r) => r.preguntaCodigo))]
      if (codigosPreguntas.length > 0) {
        const { rows: existentes } = await pool.query<{ codigo: string }>(
          'SELECT codigo FROM taxonomia_preguntas WHERE codigo = ANY($1)',
          [codigosPreguntas],
        )
        const encontrados = new Set(existentes.map((e) => e.codigo))
        const desconocidos = codigosPreguntas.filter((c) => !encontrados.has(c))
        if (desconocidos.length > 0) {
          return reply.code(400).send({ error: `Pregunta(s) inexistente(s): ${desconocidos.join(', ')}` })
        }
      }

      try {
        await conTransaccion(pool, async (client: pg.PoolClient) => {
          await client.query('DELETE FROM evaluaciones_taxonomicas WHERE organismo_id = $1', [orgId])

          for (const r of request.body.respuestas) {
            if (r.opcionesCodigos) {
              for (const opcionCodigo of r.opcionesCodigos) {
                await client.query(
                  `INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
                   SELECT $1,
                          (SELECT id FROM taxonomia_preguntas WHERE codigo = $2),
                          (SELECT o.id FROM taxonomia_opciones o
                             JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
                            WHERE p.codigo = $2 AND o.codigo = $3)`,
                  [orgId, r.preguntaCodigo, opcionCodigo],
                )
              }
            } else if (r.valorNumero !== undefined) {
              await client.query(
                `INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_numero)
                 SELECT $1, (SELECT id FROM taxonomia_preguntas WHERE codigo = $2), $3`,
                [orgId, r.preguntaCodigo, r.valorNumero],
              )
            } else if (r.valorTexto !== undefined) {
              await client.query(
                `INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_texto)
                 SELECT $1, (SELECT id FROM taxonomia_preguntas WHERE codigo = $2), $3`,
                [orgId, r.preguntaCodigo, r.valorTexto],
              )
            }
          }
        })
      } catch (err) {
        // T009 (US3): un rechazo de trigger (FR-007/FR-006/FR-004/FR-008,
        // y desde 0003 también Protección A) vuelve como 400 identificable,
        // nunca 500 (D11). Cualquier otro error sigue siendo un 500 genuino.
        if (esRechazoDeTrigger(err)) {
          return reply.code(400).send({ error: err.message })
        }
        throw err
      }

      return obtenerTaxonomiaOrganismo(orgId)
    },
  )
}
