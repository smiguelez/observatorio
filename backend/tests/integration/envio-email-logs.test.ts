// T008 (010, US1): mismo patrón que acceso-inicial-logs.test.ts — `enviarEmail` mockeado (nunca la
// red real), y se verifica qué ve la persona que pidió el magic link Y qué queda registrado.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { limpiarUsuariosDePrueba, provisionarSinIdentidad } from '../helpers/db.js'

vi.mock('../../src/email/resend.js', () => ({ enviarEmail: vi.fn() }))
import { enviarEmail } from '../../src/email/resend.js'

const PREFIJO = 'test-envio-email-logs'
const pool = getPgPool()
const email = (n: string) => `${PREFIJO}-${n}@example.observatorio.test`

async function pedirMagicLink(app: FastifyInstance, e: string) {
  return app.inject({ method: 'POST', url: '/api/auth/sign-in/magic-link', payload: { email: e } })
}
async function tokenMasReciente(e: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ identifier: string }>(
    `SELECT identifier FROM auth.verification WHERE value LIKE $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [`%${e}%`],
  )
  return rows[0]?.identifier
}

describe('Fallo de envío del magic link: mismo mensaje al usuario, log estructurado aparte (FR-001/002/003, US1)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
  })
  afterEach(async () => {
    vi.mocked(enviarEmail).mockReset()
    vi.restoreAllMocks()
    await limpiarUsuariosDePrueba(pool, PREFIJO)
  })
  afterAll(async () => {
    await app.close()
  })

  it('envío exitoso: enviarEmail se llama con la plantilla del magic link (asunto + un enlace, no el texto crudo del token), y no queda ninguna línea de log nueva', async () => {
    vi.mocked(enviarEmail).mockResolvedValue({ ok: true })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await provisionarSinIdentidad(pool, email('ok'))

    const res = await pedirMagicLink(app, email('ok'))

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: true })
    expect(enviarEmail).toHaveBeenCalledTimes(1)
    const [args] = vi.mocked(enviarEmail).mock.calls[0]!
    expect(args.to).toBe(email('ok'))
    expect(args.subject.length).toBeGreaterThan(0)
    expect(args.html).toContain('href="') // un enlace, no el token suelto como texto plano
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('envío fallido: la persona ve LA MISMA respuesta que en el caso exitoso; el fallo se registra con console.error, sin el token', async () => {
    vi.mocked(enviarEmail).mockResolvedValue({ ok: false, motivo: 'Resend respondió 500: proveedor caído' })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await provisionarSinIdentidad(pool, email('fallo'))

    const res = await pedirMagicLink(app, email('fallo'))
    const token = await tokenMasReciente(email('fallo'))

    // Mismo status y mismo cuerpo que el caso exitoso (FR-003 de 007, sin excepción por este fallo).
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: true })
    expect(token).toBeDefined() // el token SÍ se generó (el fallo es de ENVÍO, no de creación del enlace)

    expect(consoleError).toHaveBeenCalledTimes(1)
    const lineaLog = consoleError.mock.calls[0]!.join(' ')
    const registro = JSON.parse(lineaLog)
    expect(registro).toMatchObject({ evento: 'envio_email_fallido', proposito: 'magic_link', email: email('fallo'), motivo: 'Resend respondió 500: proveedor caído' })
    // Nunca el token ni el enlace completo en el log (FR-008).
    expect(lineaLog).not.toContain(token)
    expect(lineaLog).not.toContain('href=')
    expect(lineaLog).not.toContain('/magic-link/verify')
  })

  it('email NO dado de alta: ni siquiera se llama a enviarEmail (FR-003, sin cambios de esta feature)', async () => {
    const res = await pedirMagicLink(app, email('inexistente'))
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: true })
    expect(enviarEmail).not.toHaveBeenCalled()
  })
})
