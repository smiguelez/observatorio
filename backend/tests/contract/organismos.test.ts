// T025 (US2): test de contrato de organismos — status codes de
// contracts/api.md, incluido el caso central de FR-013/Principio II:
// propietario_id ignorado aunque el body lo inyecte explícitamente.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-organismos'
const pool = getPgPool()

const BODY_ORGANISMO_BASE = {
  denominacion: 'Organismo de contrato',
  denominacionSimplificadaId: 1,
  tipoOficinaId: 1,
  provinciaId: 1,
}

describe('Contrato: organismos', () => {
  let app: FastifyInstance
  let cookieA: string
  let usuarioAId: string
  let usuarioBId: string

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const a = await crearUsuarioDePrueba(app, `${PREFIJO}-a@example.observatorio.test`)
    const b = await crearUsuarioDePrueba(app, `${PREFIJO}-b@example.observatorio.test`)
    cookieA = a.cookie
    usuarioAId = a.usuarioId
    usuarioBId = b.usuarioId
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('POST sin sesión da 401 (FR-004)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/organismos', payload: BODY_ORGANISMO_BASE })
    expect(res.statusCode).toBe(401)
  })

  it('POST con sesión crea el organismo con propietario_id = caller, IGNORANDO cualquier valor inyectado en el body (FR-013)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieA },
      payload: { ...BODY_ORGANISMO_BASE, propietarioId: usuarioBId, propietario_id: usuarioBId },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.propietario_id).toBe(usuarioAId)
    expect(body.propietario_id).not.toBe(usuarioBId)

    // No solo la respuesta: lo que quedó persistido.
    const { rows } = await pool.query('SELECT propietario_id::text FROM organismos WHERE id = $1', [body.id])
    expect(rows[0].propietario_id).toBe(usuarioAId)
  })

  it('GET/PATCH del propio organismo funciona; PATCH también ignora propietario_id inyectado', async () => {
    const creado = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieA },
      payload: BODY_ORGANISMO_BASE,
    })
    const id = creado.json().id

    const get = await app.inject({ method: 'GET', url: `/api/organismos/${id}`, headers: { cookie: cookieA } })
    expect(get.statusCode).toBe(200)

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/organismos/${id}`,
      headers: { cookie: cookieA },
      payload: { denominacion: 'Editado', propietarioId: usuarioBId },
    })
    expect(patch.statusCode).toBe(200)
    expect(patch.json().propietario_id).toBe(usuarioAId)
    expect(patch.json().denominacion).toBe('Editado')
  })

  it('GET a un organismo inexistente da 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/organismos/999999999', headers: { cookie: cookieA } })
    expect(res.statusCode).toBe(404)
  })

  it('DELETE del propio organismo da 204 y luego GET da 404', async () => {
    const creado = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieA },
      payload: BODY_ORGANISMO_BASE,
    })
    const id = creado.json().id

    const del = await app.inject({ method: 'DELETE', url: `/api/organismos/${id}`, headers: { cookie: cookieA } })
    expect(del.statusCode).toBe(204)

    const get = await app.inject({ method: 'GET', url: `/api/organismos/${id}`, headers: { cookie: cookieA } })
    expect(get.statusCode).toBe(404)
  })
})
