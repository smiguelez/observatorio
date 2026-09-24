// T012 (006-backend-endpoints-faltantes, US5): catálogo completo de
// preguntas de taxonomía — no existía, hallazgo verificado en
// 005-frontend-cliente (el endpoint de 004 solo devuelve lo respondido).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-taxonomia-preguntas'
const pool = getPgPool()

describe('Contrato: catálogo de preguntas de taxonomía', () => {
  let app: FastifyInstance
  let cookie: string

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const u = await crearUsuarioDePrueba(app, `${PREFIJO}@example.observatorio.test`)
    cookie = u.cookie
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('sin filtro devuelve las 9 preguntas existentes (FR-014)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/taxonomia/preguntas', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(9)
  })

  it('filtrado por tipoOficinaId de "oficina judicial" (id=1) devuelve las 9 preguntas aplicables (FR-015)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/taxonomia/preguntas?tipoOficinaId=1',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { pregunta?: unknown }[]
    expect(body).toHaveLength(9)
  })

  it('filtrado por tipoOficinaId de "unidad operativa" (id=4, sin preguntas aplicables) devuelve [] (FR-016)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/taxonomia/preguntas?tipoOficinaId=4',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('filtrado por un tipoOficinaId inexistente da 400, distinto del caso de lista vacía (FR-017)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/taxonomia/preguntas?tipoOficinaId=999999',
      headers: { cookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it('una pregunta opcion_unica incluye "opciones"; ninguna de las 9 migradas es numerica/texto_libre, así que se valida con una pregunta de prueba de cada tipo', async () => {
    const codigoUnica = `${PREFIJO}_unica`
    const codigoNumerica = `${PREFIJO}_numerica`
    await pool.query(
      `INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden) VALUES
         ($1, 'Prueba única', 'gestion', 'opcion_unica', 700),
         ($2, 'Prueba numérica', 'gestion', 'numerica', 701)`,
      [codigoUnica, codigoNumerica],
    )
    await pool.query(
      `INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
       SELECT id, 'A', 'Opción A', 1 FROM taxonomia_preguntas WHERE codigo = $1`,
      [codigoUnica],
    )

    try {
      const res = await app.inject({ method: 'GET', url: '/api/taxonomia/preguntas', headers: { cookie } })
      const body = res.json() as { pregunta?: { codigo: string }; codigo?: string; opciones?: unknown[] }[]
      const unica = body.find((p: any) => p.codigo === codigoUnica)!
      const numerica = body.find((p: any) => p.codigo === codigoNumerica)!
      expect((unica as any).opciones).toEqual([{ codigo: 'A', etiqueta: 'Opción A' }])
      expect((numerica as any).opciones).toBeUndefined()
    } finally {
      await pool.query('DELETE FROM taxonomia_preguntas WHERE codigo = ANY($1)', [[codigoUnica, codigoNumerica]])
    }
  })
})
