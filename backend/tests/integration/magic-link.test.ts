// T021 (US1): magic link reutilizado o vencido se rechaza (SC-006;
// quickstart.md Paso 4; Principio IV: un solo uso, expiración corta).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-magiclink'
const pool = getPgPool()

async function pedirYLeerToken(app: FastifyInstance, email: string): Promise<string> {
  const solicitar = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/magic-link',
    payload: { email },
  })
  if (solicitar.statusCode !== 200) throw new Error(`sign-in/magic-link falló: ${solicitar.statusCode} ${solicitar.body}`)

  const { rows } = await pool.query<{ identifier: string }>(
    `SELECT identifier FROM auth.verification WHERE value LIKE $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [`%${email}%`],
  )
  if (rows.length === 0) throw new Error('No se encontró el token en auth.verification')
  return rows[0]!.identifier
}

describe('Magic link: un solo uso y expiración corta (SC-006)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
  })

  afterEach(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
  })

  afterAll(async () => {
    await app.close()
  })

  it('un token ya usado se rechaza en el segundo intento (no otorga una sesión nueva)', async () => {
    const email = `${PREFIJO}-replay@example.observatorio.test`
    const token = await pedirYLeerToken(app, email)

    const primerUso = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${token}` })
    expect(primerUso.statusCode).toBe(200)
    expect(primerUso.json().user.email).toBe(email)

    const segundoUso = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${token}` })
    // La verificación exitosa devuelve 200 con { session, user }; el rechazo
    // (INVALID_TOKEN) es un redirect (302) a errorCallbackURL, no un 200 con
    // sesión — confirmado corriendo esto contra la app real, no asumido.
    expect(segundoUso.statusCode).not.toBe(200)
    expect(segundoUso.statusCode).toBe(302)
    expect(segundoUso.headers.location).toContain('error=INVALID_TOKEN')
  })

  it('un token expirado se rechaza (expiresAt en el pasado)', async () => {
    const email = `${PREFIJO}-expired@example.observatorio.test`
    const token = await pedirYLeerToken(app, email)

    // Simula expiración sin esperar los 5 minutos reales de expiresIn:
    // el propio Principio IV es lo que estamos probando, no el reloj.
    await pool.query(`UPDATE auth.verification SET "expiresAt" = now() - interval '1 minute' WHERE identifier = $1`, [
      token,
    ])

    const intento = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${token}` })
    expect(intento.statusCode).not.toBe(200)
    expect(intento.statusCode).toBe(302)
    expect(intento.headers.location).toContain('error=INVALID_TOKEN')
  })
})
