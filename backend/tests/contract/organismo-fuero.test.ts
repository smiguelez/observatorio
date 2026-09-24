// T006 (006-backend-endpoints-faltantes, US2): GET /api/organismos/:orgId/fuero
// no existía — hallazgo verificado en 005-frontend-cliente.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, hacerAdmin, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-organismo-fuero'
const pool = getPgPool()

describe('Contrato: fuero de un organismo (solo lectura)', () => {
  let app: FastifyInstance
  let cookieAdmin: string
  let orgConFueroId: number
  let orgSinFueroId: number

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-admin@example.observatorio.test`)
    await hacerAdmin(pool, admin.usuarioId)
    cookieAdmin = admin.cookie

    const { rows: conFuero } = await pool.query<{ id: number }>(
      `SELECT o.id FROM organismos o
         JOIN organismo_fueros ofu ON ofu.organismo_id = o.id
        WHERE o.estado_fueros = 'cargado'
        LIMIT 1`,
    )
    orgConFueroId = conFuero[0]!.id

    // organismo nuevo, propio del admin, sin ningún fuero asignado
    const creado = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieAdmin },
      payload: { denominacion: `${PREFIJO} org`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 },
    })
    orgSinFueroId = creado.json().id
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('GET fuero de un organismo real con fueros cargados trae detalle + simplificado (FR-003)', async () => {
    const { rows: esperado } = await pool.query<{ fuero_simplificado: string | null }>(
      'SELECT fuero_simplificado FROM vista_fuero_simplificado WHERE organismo_id = $1',
      [orgConFueroId],
    )
    const { rows: esperadoDetalle } = await pool.query<{ id: number }>(
      'SELECT fuero_id AS id FROM organismo_fueros WHERE organismo_id = $1 ORDER BY fuero_id',
      [orgConFueroId],
    )

    const res = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgConFueroId}/fuero`,
      headers: { cookie: cookieAdmin },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { fueros: { id: number; nombre: string }[]; fueroSimplificado: string | null }
    expect(body.fueroSimplificado).toBe(esperado[0]!.fuero_simplificado)
    expect(body.fueros.map((f) => f.id).sort()).toEqual(esperadoDetalle.map((f) => f.id).sort())
    expect(body.fueros.length).toBeGreaterThan(0)
  })

  it('GET fuero de un organismo real sin ningún fuero asignado da 200 con listas vacías (FR-004)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgSinFueroId}/fuero`,
      headers: { cookie: cookieAdmin },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ fueros: [], fueroSimplificado: null })
  })

  it('GET fuero de un :orgId inexistente da 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/organismos/999999999/fuero',
      headers: { cookie: cookieAdmin },
    })
    expect(res.statusCode).toBe(404)
  })

  it('GET fuero sin ser dueño/editor/admin da 403', async () => {
    const otro = await crearUsuarioDePrueba(app, `${PREFIJO}-otro@example.observatorio.test`)
    const res = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgSinFueroId}/fuero`,
      headers: { cookie: otro.cookie },
    })
    expect(res.statusCode).toBe(403)
  })
})
