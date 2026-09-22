// T019 (US1): test de contrato — los 3 métodos de autenticación son rutas
// independientes (contracts/api.md, tabla "Autenticación"; Principio III:
// "ninguno de los tres MUST ser prerequisito para que los otros dos
// funcionen"). Corre contra la app real (fastify.inject(), sin socket) y la
// base real — requiere DATABASE_URL, BETTER_AUTH_SECRET,
// GOOGLE_CLIENT_ID/SECRET en el entorno (los mismos que usa `npm run dev`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-auth'
const pool = getPgPool()

describe('Contrato: autenticación — 3 métodos independientes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('POST /api/auth/sign-up/email funciona por sí solo (credenciales locales)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `${PREFIJO}-password@example.observatorio.test`,
        password: 'contrasena-test-12345',
        name: 'Contrato Password',
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBeTypeOf('string')
  })

  it('POST /api/auth/sign-in/magic-link funciona por sí solo, con un email que NUNCA pasó por contraseña', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email: `${PREFIJO}-magiclink@example.observatorio.test` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: true })
  })

  it('POST /api/auth/sign-in/social (google) funciona por sí solo, sin depender de los otros dos', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'google', callbackURL: '/' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.redirect).toBe(true)
    expect(body.url).toContain('accounts.google.com')
  })

  it('GET /api/auth/session (nuestra IdentidadResuelta) da 401 sin cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/session' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/auth/get-session (Better Auth) da 200 con sesión null sin cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/get-session' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toBeNull()
  })
})
