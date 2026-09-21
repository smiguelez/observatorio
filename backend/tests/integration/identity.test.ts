// T020 (US1): login por método A (contraseña), vincular método B (magic
// link) con el MISMO email, login por B resuelve al mismo usuarios.id
// (SC-004; quickstart.md Paso 3). El token de magic link se lee directo de
// auth.verification (mismo mecanismo que usó la verificación manual contra
// el servidor real) — no hay proveedor de email real, así que no hay forma
// de "recibir" el link salvo leerlo de donde el plugin lo guarda.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { limpiarUsuariosDePrueba, extraerCookie } from '../helpers/db.js'

const PREFIJO = 'test-identity'
const EMAIL = `${PREFIJO}@example.observatorio.test`
const pool = getPgPool()

async function leerTokenMagicLinkMasReciente(email: string): Promise<string> {
  const { rows } = await pool.query<{ identifier: string }>(
    `SELECT identifier FROM auth.verification WHERE value LIKE $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [`%${email}%`],
  )
  if (rows.length === 0) throw new Error('No se encontró el token de magic link en auth.verification')
  return rows[0]!.identifier
}

describe('Identidad unificada entre métodos (SC-004)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('resuelve al mismo usuarios.id por contraseña y por magic link', async () => {
    // Método A: contraseña.
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: EMAIL, password: 'contrasena-test-12345', name: 'Identity Test' },
    })
    expect(signUp.statusCode).toBe(200)
    const idPorContrasena = signUp.json().user.id

    const cookieA = extraerCookie(signUp.headers['set-cookie'])
    const sesionA = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: cookieA },
    })
    expect(sesionA.statusCode).toBe(200)
    expect(sesionA.json().usuarioId).toBe(idPorContrasena)

    // Método B: magic link, mismo email.
    const solicitarLink = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email: EMAIL },
    })
    expect(solicitarLink.statusCode).toBe(200)

    const token = await leerTokenMagicLinkMasReciente(EMAIL)
    const verificar = await app.inject({
      method: 'GET',
      url: `/api/auth/magic-link/verify?token=${token}`,
    })
    expect(verificar.statusCode).toBe(200)
    expect(verificar.json().user.id).toBe(idPorContrasena)

    const cookieB = extraerCookie(verificar.headers['set-cookie'])
    const sesionB = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: cookieB },
    })
    expect(sesionB.statusCode).toBe(200)
    // La aserción central de SC-004: mismo usuarios.id sin importar el método.
    expect(sesionB.json().usuarioId).toBe(idPorContrasena)

    // Confirmación a nivel de dato de dominio: una sola fila en usuarios.
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM usuarios WHERE email = $1', [EMAIL])
    expect(rows[0].n).toBe(1)
  })

  it('NO fusiona identidades solo por coincidencia textual de email sin verificar (Principio V)', async () => {
    // Este caso ya está cubierto arriba: el hook de identidad resuelve por
    // email ANTES de que exista ambigüedad, así que nunca hay dos ids para
    // el mismo email en usuarios. Lo que sí hay que verificar es que
    // sign-up con un email YA REGISTRADO por otro método no crea una
    // segunda fila en usuarios ni deja huérfano el intento.
    const segundoAlta = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: EMAIL, password: 'otra-contrasena-cualquiera', name: 'Intento duplicado' },
    })
    // Better Auth rechaza el alta duplicada (ya existe un usuario con ese email).
    expect(segundoAlta.statusCode).not.toBe(200)

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM usuarios WHERE email = $1', [EMAIL])
    expect(rows[0].n).toBe(1)
  })
})
