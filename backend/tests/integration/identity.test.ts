// T010 (007, US1): identidad unificada y compuerta de provisión (FR-001, FR-002,
// FR-005..FR-007, SC-002, SC-004).
// Google se prueba con una instancia de Better Auth armada en el test que usa el
// MISMO hook de producción (`crearHookIdentidad`) pero con `verifyIdToken` de
// prueba: el proveedor real verifica el JWT contra Google y no se puede simular.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { betterAuth } from 'better-auth'
import { PostgresDialect } from 'kysely'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearHookIdentidad } from '../../src/auth/identidad-hook.js'
import { loadAuthConfig } from '../../src/config/env.js'
import {
  contarIdentidad,
  crearUsuarioDePrueba,
  extraerCookie,
  limpiarUsuariosDePrueba,
  provisionarSinIdentidad,
} from '../helpers/db.js'

const PREFIJO = 'test-identity'
const pool = getPgPool()
const email = (n: string) => `${PREFIJO}-${n}@example.observatorio.test`
const CERO = { usuarios: 0, authUser: 0, cuentas: 0, sesiones: 0, verificaciones: 0 }
const ORIGEN = 'http://localhost:5173'

function jwtDeGoogle(e: string, name = 'Prueba') {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'none', typ: 'JWT' })}.${b({ sub: `g-${e}`, email: e, email_verified: true, name })}.`
}

describe('Identidad: compuerta de provisión y unificación entre métodos', () => {
  let app: FastifyInstance
  const authGoogle = betterAuth({
    secret: loadAuthConfig().secret,
    baseURL: ORIGEN,
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth' },
    databaseHooks: { user: { create: { before: crearHookIdentidad(pool) } } },
    socialProviders: { google: { clientId: 'x', clientSecret: 'x', verifyIdToken: async () => true } },
    account: { accountLinking: { enabled: true, trustedProviders: ['google'], requireLocalEmailVerified: true } },
  })
  const googleSignIn = (e: string) =>
    authGoogle.handler(
      new Request(`${ORIGEN}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGEN },
        body: JSON.stringify({ provider: 'google', idToken: { token: jwtDeGoogle(e) } }),
      }),
    )

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
  })
  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('Google con un email NO dado de alta: 403 ACCESO_NO_AUTORIZADO, uniforme, y 0 filas (FR-001/002/003)', async () => {
    const res = await googleSignIn(email('g-no'))
    expect(res.status).toBe(403)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe('ACCESO_NO_AUTORIZADO')
    expect(body.message).not.toMatch(/existe|registrad|alta/i) // no revela si el email existe
    expect(await contarIdentidad(pool, email('g-no'))).toEqual(CERO)
  })

  it('Google con un usuario dado de alta y sin auth.user: entra a SU cuenta, mismo id, rol y provincia, sin duplicar (FR-005)', async () => {
    const id = await provisionarSinIdentidad(pool, email('g-si'), 5)
    const res = await googleSignIn(email('g-si'))
    expect(res.status).toBe(200)
    const au = await pool.query(`SELECT id FROM auth."user" WHERE email = $1`, [email('g-si')])
    expect(au.rows).toEqual([{ id }])
    const u = await pool.query(
      `SELECT provincia_id, (SELECT count(*)::int FROM usuario_roles WHERE usuario_id = usuarios.id) roles FROM usuarios WHERE email = $1`,
      [email('g-si')],
    )
    expect(u.rows).toEqual([{ provincia_id: 5, roles: 1 }])
    expect((await contarIdentidad(pool, email('g-si'))).usuarios).toBe(1)
  })

  it('Google con el email en otro casing y con espacios: mismo usuario, no uno nuevo (US1-6)', async () => {
    const id = await provisionarSinIdentidad(pool, email('g-caso'))
    const res = await googleSignIn(`  ${email('g-caso').toUpperCase()} `)
    expect(res.status).toBe(200)
    const u = await pool.query(`SELECT id FROM usuarios WHERE email LIKE $1`, [`${PREFIJO}-g-caso%`])
    expect(u.rows).toEqual([{ id }])
    const au = await pool.query(`SELECT id FROM auth."user" WHERE id = $1`, [id])
    expect(au.rowCount).toBe(1)
  })

  it('Google: un email distinto no se vincula a un usuario dado de alta por nombre ni por otro dato (FR-007)', async () => {
    await provisionarSinIdentidad(pool, email('g-otro'))
    const res = await googleSignIn(email('g-otro-distinto'))
    expect(res.status).toBe(403)
    expect(await contarIdentidad(pool, email('g-otro-distinto'))).toEqual(CERO)
    expect((await contarIdentidad(pool, email('g-otro'))).authUser).toBe(0)
  })

  it('resuelve al mismo usuarios.id por contraseña y por magic link (SC-004)', async () => {
    const u = await crearUsuarioDePrueba(app, email('unif'))
    const porClave = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: u.cookie } })
    expect(porClave.json().usuarioId).toBe(u.usuarioId)

    await app.inject({ method: 'POST', url: '/api/auth/sign-in/magic-link', payload: { email: email('unif') } })
    const { rows } = await pool.query<{ identifier: string }>(
      `SELECT identifier FROM auth.verification WHERE value LIKE $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [`%${email('unif')}%`],
    )
    const verificar = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${rows[0]!.identifier}` })
    expect(verificar.statusCode).toBe(200)
    const porEnlace = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: extraerCookie(verificar.headers['set-cookie']) },
    })
    expect(porEnlace.json().usuarioId).toBe(u.usuarioId)
    expect((await contarIdentidad(pool, email('unif'))).usuarios).toBe(1)
  })
})
