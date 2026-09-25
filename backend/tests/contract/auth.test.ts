// T009 (007, US1): contrato de autenticación tras cerrar el alta pública
// (FR-001..FR-004). Corre contra la app real (fastify.inject()) y la base real.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { contarIdentidad, limpiarUsuariosDePrueba, provisionarSinIdentidad } from '../helpers/db.js'

const PREFIJO = 'test-contract-auth'
const pool = getPgPool()
const email = (n: string) => `${PREFIJO}-${n}@example.observatorio.test`
const CERO = { usuarios: 0, authUser: 0, cuentas: 0, sesiones: 0, verificaciones: 0 }

describe('Contrato: autenticación sin alta pública', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  const signUp = (e: string, password = 'contrasena-test-12345') =>
    app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: e, password, name: 'x' } })

  it('POST /sign-up/email con un email NO dado de alta: 400 EMAIL_PASSWORD_SIGN_UP_DISABLED y 0 filas (SC-001)', async () => {
    const res = await signUp(email('nuevo'))
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED')
    expect(await contarIdentidad(pool, email('nuevo'))).toEqual(CERO)
  })

  it('POST /sign-up/email sobre un email dado de alta cuyo dueño nunca ingresó: rechazado, sin sesión ni toma de cuenta (SC-003)', async () => {
    const id = await provisionarSinIdentidad(pool, email('migrado'))
    const res = await signUp(email('migrado'), 'clave-del-atacante-1')
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED')
    expect(res.headers['set-cookie']).toBeUndefined()
    // No se creó identidad ni credencial, y el atacante no puede iniciar sesión con esa contraseña.
    expect(await contarIdentidad(pool, email('migrado'))).toMatchObject({ usuarios: 1, authUser: 0, cuentas: 0, sesiones: 0 })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: email('migrado'), password: 'clave-del-atacante-1' },
    })
    expect(login.statusCode).toBe(401)
    expect(id).toBeTypeOf('string')
  })

  it('POST /sign-in/email con un email sin cuenta no crea nada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: email('fantasma'), password: 'contrasena-test-12345' },
    })
    expect(res.statusCode).toBe(401)
    expect(await contarIdentidad(pool, email('fantasma'))).toEqual(CERO)
  })

  it('POST /sign-in/magic-link responde 200 {status:true} también por un email no dado de alta', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email: email('magiclink') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: true })
  })

  it('POST /sign-in/social (google) sigue ofreciendo el redirect a Google', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'google', callbackURL: '/' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().url).toContain('accounts.google.com')
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
