import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, http } from '@/api/http'

function responder(cuerpo: unknown, status: number) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(cuerpo), { status })))
}
afterEach(() => vi.unstubAllGlobals())

describe('extraerMensaje (008: rechazos de 007)', () => {
  it('un rechazo de validación de esquema de Fastify NO se muestra como "Bad Request"', async () => {
    responder({ statusCode: 400, code: 'FST_ERR_VALIDATION', error: 'Bad Request', message: "body must have required property 'rol'" }, 400)
    const e = (await http('/api/usuarios', { method: 'POST', body: {} }).catch((x: unknown) => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(400)
    expect(e.message).toBe('Los datos enviados no son válidos.')
    expect(e.message).not.toMatch(/Bad Request/)
    expect(e.codigo).toBe('FST_ERR_VALIDATION')
  })
  it('un rechazo de dominio {error} conserva el texto del servidor', async () => {
    responder({ error: 'Ese email ya está dado de alta.' }, 400)
    await expect(http('/api/usuarios', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 400, message: 'Ese email ya está dado de alta.' })
  })
  it('un {error, code} (canje) conserva texto y código', async () => {
    responder({ error: 'La contraseña debe tener al menos 8 caracteres.', code: 'PASSWORD_TOO_SHORT' }, 400)
    await expect(http('/api/acceso-inicial/canjear', { method: 'POST', body: {} })).rejects.toMatchObject({ codigo: 'PASSWORD_TOO_SHORT', message: 'La contraseña debe tener al menos 8 caracteres.' })
  })
  it('un {message, code} de Better Auth sigue igual', async () => {
    responder({ message: 'Invalid email or password', code: 'INVALID_EMAIL_OR_PASSWORD' }, 401)
    await expect(http('/api/auth/sign-in/email', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 401, message: 'Invalid email or password' })
  })
})
