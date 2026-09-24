// T009 (006-backend-endpoints-faltantes, US3): CRUD de asignaciones de
// jueces por UF (D8) — no existía ningún endpoint, hallazgo verificado en
// 005-frontend-cliente. Cubre explícitamente los 3 tipos de rechazo que
// motivaron generalizar trigger-error.ts (research.md, Decisiones 2-3):
// duplicado (UNIQUE), cantidad inválida (CHECK), referencia inexistente
// (FK) — cada uno debe dar 400 con mensaje identificable, nunca 500.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-asignaciones-jueces'
const pool = getPgPool()

describe('Contrato: asignaciones de jueces por UF (D8)', () => {
  let app: FastifyInstance
  let cookie: string
  let orgId: number
  let ufId: number
  let poolAId: number
  let poolBId: number

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const u = await crearUsuarioDePrueba(app, `${PREFIJO}@example.observatorio.test`)
    cookie = u.cookie

    const org = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie },
      payload: { denominacion: `${PREFIJO} org`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 },
    })
    orgId = org.json().id

    const { rows: localidades } = await pool.query<{ id: number }>('SELECT id FROM localidades LIMIT 1')
    const uf = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/unidades-funcionales`,
      headers: { cookie },
      payload: { denominacionUnidad: `${PREFIJO} uf`, localidadId: localidades[0]!.id, tipoUfId: 1 },
    })
    ufId = uf.json().id

    const { rows: pools } = await pool.query<{ id: number }>('SELECT id FROM grupos_jueces ORDER BY id LIMIT 2')
    poolAId = pools[0]!.id
    poolBId = pools[1]!.id
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('POST crea una asignación válida y GET la lista (FR-006)', async () => {
    const post = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie },
      payload: { grupoJuecesId: poolAId, cantidadAsignada: 5 },
    })
    expect(post.statusCode).toBe(201)
    expect(post.json()).toMatchObject({ grupoJuecesId: poolAId, cantidadAsignada: 5 })

    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie },
    })
    expect(get.json()).toEqual([expect.objectContaining({ grupoJuecesId: poolAId, cantidadAsignada: 5 })])
  })

  it('RECHAZO 1/3 — duplicado (UNIQUE): segunda asignación al mismo par UF-pool da 400 identificable, no 500 (FR-008)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie },
      payload: { grupoJuecesId: poolAId, cantidadAsignada: 3 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Ya existe una asignación de esta unidad funcional a ese pool.' })
  })

  it('RECHAZO 2/3 — cantidad inválida (CHECK): cantidadAsignada=0 da 400 identificable, no 500 (FR-009)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie },
      payload: { grupoJuecesId: poolBId, cantidadAsignada: 0 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'La cantidad asignada debe ser mayor a 0.' })
  })

  it('RECHAZO 3/3 — referencia inexistente (FK): pool inexistente da 400 identificable, no 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie },
      payload: { grupoJuecesId: 999999999, cantidadAsignada: 3 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'El pool de jueces indicado no existe.' })
  })

  it('una UF puede tener 2 asignaciones a pools DISTINTOS a la vez (D8, caso 3/4) (FR-007)', async () => {
    const post = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie },
      payload: { grupoJuecesId: poolBId, cantidadAsignada: 2 },
    })
    expect(post.statusCode).toBe(201)

    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie },
    })
    const body = get.json() as { grupoJuecesId: number }[]
    expect(body.map((a) => a.grupoJuecesId).sort()).toEqual([poolAId, poolBId].sort())
  })

  it('PATCH edita la cantidad de una asignación existente', async () => {
    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie },
    })
    const asignacionId = (get.json() as { id: number; grupoJuecesId: number }[]).find(
      (a) => a.grupoJuecesId === poolAId,
    )!.id

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces/${asignacionId}`,
      headers: { cookie },
      payload: { cantidadAsignada: 9 },
    })
    expect(patch.statusCode).toBe(200)
    expect(patch.json()).toMatchObject({ cantidadAsignada: 9 })
  })

  it('DELETE elimina una asignación existente', async () => {
    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie },
    })
    const asignacionId = (get.json() as { id: number; grupoJuecesId: number }[]).find(
      (a) => a.grupoJuecesId === poolBId,
    )!.id

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces/${asignacionId}`,
      headers: { cookie },
    })
    expect(del.statusCode).toBe(204)

    const getPosterior = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie },
    })
    expect((getPosterior.json() as { id: number }[]).map((a) => a.id)).not.toContain(asignacionId)
  })
})
