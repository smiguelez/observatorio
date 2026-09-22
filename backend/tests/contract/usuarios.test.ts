// T034 (US4): test de contrato de usuarios — status codes de
// contracts/api.md: lectura amplia sin chequeo adicional (FR-017),
// escritura acotada a propio usuario o admin (FR-016).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-usuarios'
const pool = getPgPool()

describe('Contrato: usuarios', () => {
  let app: FastifyInstance
  let cookieM: string
  let usuarioMId: string
  let usuarioNId: string

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const m = await crearUsuarioDePrueba(app, `${PREFIJO}-m@example.observatorio.test`)
    const n = await crearUsuarioDePrueba(app, `${PREFIJO}-n@example.observatorio.test`)
    cookieM = m.cookie
    usuarioMId = m.usuarioId
    usuarioNId = n.usuarioId
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('GET /api/usuarios sin sesión da 401 (FR-004)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/usuarios' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/usuarios/:id sin sesión da 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/usuarios/${usuarioNId}` })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/usuarios/:id de OTRO usuario, sin relación, da 200 con el perfil completo (FR-017)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/usuarios/${usuarioNId}`, headers: { cookie: cookieM } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(usuarioNId)
    expect(body.email).toBe(`${PREFIJO}-n@example.observatorio.test`)
  })

  it('GET /api/usuarios/:id inexistente da 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/usuarios/999999999', headers: { cookie: cookieM } })
    expect(res.statusCode).toBe(404)
  })

  it('PATCH del propio perfil da 200', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioMId}`,
      headers: { cookie: cookieM },
      payload: { nombreDisplay: 'M vía contrato' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().nombre_display).toBe('M vía contrato')
  })

  it('PATCH del perfil de OTRO usuario (sin ser admin) da 403', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioNId}`,
      headers: { cookie: cookieM },
      payload: { nombreDisplay: 'Intento de M sobre N' },
    })
    expect(res.statusCode).toBe(403)
  })
})
