// T033 (007, US5): cambio de contraseña con la actual; el servidor cierra las demás sesiones aunque el cliente
// no lo pida (FR-018, SC-008). Usuario sin contraseña → rechazo claro (US5-5).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import {
  PASSWORD_DE_PRUEBA,
  crearUsuarioDePrueba,
  extraerCookie,
  limpiarUsuariosDePrueba,
  provisionarSinIdentidad,
} from '../helpers/db.js'

const PREFIJO = 'test-password'
const pool = getPgPool()
const email = (n: string) => `${PREFIJO}-${n}@example.observatorio.test`
const NUEVA = 'contrasena-nueva-67890'

describe('Cambio de contraseña (US5)', () => {
  let app: FastifyInstance

  const cambiar = (cookie: string, payload: object) =>
    app.inject({ method: 'POST', url: '/api/auth/change-password', headers: { cookie }, payload })
  const login = (e: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: e, password } })
  const sesionValida = async (cookie: string) =>
    (await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } })).statusCode === 200

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
  })
  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('actual correcta + nueva válida: la nueva sirve, la vieja no; las OTRAS sesiones se cierran y la actual sigue con cookie nueva (US5-1/4, SC-008)', async () => {
    const u = await crearUsuarioDePrueba(app, email('ok'))
    const otra = extraerCookie((await login(email('ok'), PASSWORD_DE_PRUEBA)).headers['set-cookie']) // 2.ª sesión ("otro dispositivo")
    expect(await sesionValida(u.cookie)).toBe(true)
    expect(await sesionValida(otra)).toBe(true)

    // El cliente NO pide revokeOtherSessions: el servidor lo fuerza.
    const res = await cambiar(u.cookie, { currentPassword: PASSWORD_DE_PRUEBA, newPassword: NUEVA })
    expect(res.statusCode).toBe(200)
    const cookieNueva = extraerCookie(res.headers['set-cookie'])
    expect(await sesionValida(cookieNueva)).toBe(true) // la sesión desde la que se cambió sigue activa
    expect(await sesionValida(otra)).toBe(false) // las demás se cerraron
    expect(await sesionValida(u.cookie)).toBe(false) // la cookie anterior rotó

    expect((await login(email('ok'), PASSWORD_DE_PRUEBA)).statusCode).toBe(401)
    expect((await login(email('ok'), NUEVA)).statusCode).toBe(200)
  })

  it('actual incorrecta: 400 con mensaje y la contraseña no cambia (US5-2)', async () => {
    const u = await crearUsuarioDePrueba(app, email('mala'))
    const res = await cambiar(u.cookie, { currentPassword: 'no-es-la-actual-1', newPassword: NUEVA })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBeTypeOf('string')
    expect((await login(email('mala'), PASSWORD_DE_PRUEBA)).statusCode).toBe(200)
    expect(await sesionValida(u.cookie)).toBe(true) // un cambio fallido no cierra sesiones
  })

  it('nueva contraseña bajo la política mínima: 400 PASSWORD_TOO_SHORT y sin cambios (US5-3)', async () => {
    const u = await crearUsuarioDePrueba(app, email('corta'))
    const res = await cambiar(u.cookie, { currentPassword: PASSWORD_DE_PRUEBA, newPassword: 'corta' })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('PASSWORD_TOO_SHORT')
    expect((await login(email('corta'), PASSWORD_DE_PRUEBA)).statusCode).toBe(200)
  })

  it('usuario que solo ingresa por enlace y no tiene contraseña: rechazo claro (US5-5)', async () => {
    await provisionarSinIdentidad(pool, email('sinclave'))
    await app.inject({ method: 'POST', url: '/api/auth/sign-in/magic-link', payload: { email: email('sinclave') } })
    const { rows } = await pool.query(`SELECT identifier FROM auth.verification WHERE value LIKE $1 ORDER BY "createdAt" DESC LIMIT 1`, [`%${email('sinclave')}%`])
    const v = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${rows[0].identifier}` })
    const cookie = extraerCookie(v.headers['set-cookie'])
    const res = await cambiar(cookie, { currentPassword: 'lo-que-sea-1234', newPassword: NUEVA })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('CREDENTIAL_ACCOUNT_NOT_FOUND')
    const cuentas = await pool.query(`SELECT count(*)::int n FROM auth.account WHERE "userId" IN (SELECT id FROM auth."user" WHERE email = $1)`, [email('sinclave')])
    expect(cuentas.rows[0].n).toBe(0)
  })

  it('sin sesión: el cambio se rechaza', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/change-password', payload: { currentPassword: 'x'.repeat(10), newPassword: NUEVA } })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })
})
