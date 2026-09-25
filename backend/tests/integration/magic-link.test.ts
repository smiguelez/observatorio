// T011 (007, US1): magic link — compuerta de provisión (FR-001..FR-003, FR-005),
// un solo uso y expiración corta (SC-006; Principio IV).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import {
  contarIdentidad,
  extraerCookie,
  limpiarUsuariosDePrueba,
  provisionarSinIdentidad,
} from '../helpers/db.js'

const PREFIJO = 'test-magiclink'
const pool = getPgPool()
const email = (n: string) => `${PREFIJO}-${n}@example.observatorio.test`
const CERO = { usuarios: 0, authUser: 0, cuentas: 0, sesiones: 0, verificaciones: 0 }

async function pedir(app: FastifyInstance, e: string) {
  return app.inject({ method: 'POST', url: '/api/auth/sign-in/magic-link', payload: { email: e } })
}
async function tokenMasReciente(e: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ identifier: string }>(
    `SELECT identifier FROM auth.verification WHERE value LIKE $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [`%${e}%`],
  )
  return rows[0]?.identifier
}

describe('Magic link', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await limpiarUsuariosDePrueba(pool, PREFIJO)
  })
  afterAll(async () => {
    await app.close()
  })

  it('email NO dado de alta: respuesta idéntica a la de uno dado de alta, pero sin enlace utilizable ni filas (FR-003)', async () => {
    await provisionarSinIdentidad(pool, email('si'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const conAlta = await pedir(app, email('si'))
    const sinAlta = await pedir(app, email('no'))

    expect(sinAlta.statusCode).toBe(conAlta.statusCode)
    expect(sinAlta.json()).toEqual(conAlta.json())
    expect(sinAlta.json()).toEqual({ status: true })
    // Solo el dado de alta deja un enlace registrado (log) y un token en la base.
    const textoLog = log.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(textoLog).toContain(email('si'))
    expect(textoLog).not.toContain(email('no'))
    expect(await contarIdentidad(pool, email('no'))).toEqual(CERO)
    expect(await tokenMasReciente(email('no'))).toBeUndefined()
  })

  it('un enlace forzado para un email no dado de alta no crea usuario ni sesión: redirige con ACCESO_NO_AUTORIZADO', async () => {
    // Se fabrica el token a mano (lo único que un atacante NO puede conseguir por la API).
    const token = 'token-forzado-test-magiclink'
    await pool.query(
      `INSERT INTO auth.verification (id, identifier, value, "expiresAt")
       VALUES ('vf-test-magiclink', $1, $2, now() + interval '5 minutes')`,
      [token, JSON.stringify({ email: email('forzado'), attempt: 0 })],
    )
    const res = await app.inject({
      method: 'GET',
      url: `/api/auth/magic-link/verify?token=${token}&callbackURL=%2F&errorCallbackURL=%2Flogin`,
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('error=ACCESO_NO_AUTORIZADO')
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(await contarIdentidad(pool, email('forzado'))).toMatchObject({ usuarios: 0, authUser: 0, cuentas: 0, sesiones: 0 })
  })

  it('usuario dado de alta SIN auth.user (como los migrados): entra a su cuenta, mismo id, sin duplicar ni tocar usuarios (FR-005, SC-002)', async () => {
    const id = await provisionarSinIdentidad(pool, email('migrado'), 7)
    await pedir(app, email('migrado'))
    const token = (await tokenMasReciente(email('migrado')))!
    const res = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${token}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.id).toBe(id)

    const sesion = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: extraerCookie(res.headers['set-cookie']) },
    })
    expect(sesion.json()).toEqual({ usuarioId: id, rol: 'usuario_normal', provinciaId: 7 })
    expect((await contarIdentidad(pool, email('migrado')))).toMatchObject({ usuarios: 1, authUser: 1 })
  })

  it('email dado de alta con otro casing y espacios: mismo usuario (US1-6)', async () => {
    const id = await provisionarSinIdentidad(pool, email('caso'))
    await pedir(app, `  ${email('caso').toUpperCase()}  `)
    const token = await tokenMasReciente(email('caso'))
    expect(token).toBeDefined()
    const res = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${token}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.id).toBe(id)
    expect((await contarIdentidad(pool, email('caso'))).usuarios).toBe(1)
  })

  it('un token ya usado se rechaza en el segundo intento (SC-006)', async () => {
    await provisionarSinIdentidad(pool, email('replay'))
    await pedir(app, email('replay'))
    const token = (await tokenMasReciente(email('replay')))!

    const primero = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${token}` })
    expect(primero.statusCode).toBe(200)
    const segundo = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${token}` })
    expect(segundo.statusCode).toBe(302)
    expect(segundo.headers.location).toContain('error=INVALID_TOKEN')
  })

  it('un token expirado se rechaza (SC-006)', async () => {
    await provisionarSinIdentidad(pool, email('vencido'))
    await pedir(app, email('vencido'))
    const token = (await tokenMasReciente(email('vencido')))!
    await pool.query(`UPDATE auth.verification SET "expiresAt" = now() - interval '1 minute' WHERE identifier = $1`, [token])
    const res = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${token}` })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toContain('error=INVALID_TOKEN')
  })
})
