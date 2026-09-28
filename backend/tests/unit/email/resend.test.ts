// T006 (010, Foundational): prueba enviarEmail() con un fetch fake — nunca pega a la red real, y
// no necesita ninguna credencial real de Resend (research.md, Decisión 3).
import { describe, expect, it, vi } from 'vitest'
import { enviarEmail } from '../../../src/email/resend.js'

const DEPS = { apiKey: 'clave-de-prueba', remitente: 'no-responder@example.test' }

function fetchFake(respuesta: { ok: boolean; status?: number; texto?: string }) {
  return vi.fn().mockResolvedValue({
    ok: respuesta.ok,
    status: respuesta.status ?? (respuesta.ok ? 200 : 500),
    statusText: 'x',
    text: async () => respuesta.texto ?? '',
  } as Response)
}

describe('enviarEmail', () => {
  it('éxito: llama a la API de Resend con el body correcto y devuelve { ok: true }', async () => {
    const fetchImpl = fetchFake({ ok: true })
    const resultado = await enviarEmail({ to: 'persona@example.com', subject: 'Asunto', html: '<p>hola</p>' }, { ...DEPS, fetchImpl })

    expect(resultado).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer clave-de-prueba' }),
      }),
    )
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string)
    expect(body).toEqual({ from: 'no-responder@example.test', to: 'persona@example.com', subject: 'Asunto', html: '<p>hola</p>' })
  })

  it('fallo HTTP (Resend responde 4xx/5xx): { ok: false } con el motivo, sin lanzar', async () => {
    const fetchImpl = fetchFake({ ok: false, status: 422, texto: '{"message":"dominio no verificado"}' })
    const resultado = await enviarEmail({ to: 'persona@example.com', subject: 'x', html: 'x' }, { ...DEPS, fetchImpl })

    expect(resultado.ok).toBe(false)
    expect((resultado as { motivo: string }).motivo).toContain('422')
    expect((resultado as { motivo: string }).motivo).toContain('dominio no verificado')
  })

  it('fallo de red (fetch rechaza): { ok: false } con el motivo, sin lanzar', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
    const resultado = await enviarEmail({ to: 'persona@example.com', subject: 'x', html: 'x' }, { ...DEPS, fetchImpl })

    expect(resultado).toEqual({ ok: false, motivo: 'getaddrinfo ENOTFOUND' })
  })

  it('faltan RESEND_API_KEY/EMAIL_REMITENTE (sin overrides ni env real): { ok: false }, nunca lanza', async () => {
    const anterior = { key: process.env.RESEND_API_KEY, remitente: process.env.EMAIL_REMITENTE }
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_REMITENTE
    try {
      const resultado = await enviarEmail({ to: 'persona@example.com', subject: 'x', html: 'x' })
      expect(resultado.ok).toBe(false)
    } finally {
      if (anterior.key !== undefined) process.env.RESEND_API_KEY = anterior.key
      if (anterior.remitente !== undefined) process.env.EMAIL_REMITENTE = anterior.remitente
    }
  })

  it('el html enviado a fetch es exactamente el recibido, sin transformarlo', async () => {
    const fetchImpl = fetchFake({ ok: true })
    const html = '<p>Enlace: <a href="https://example.test/x#token=abc">acá</a></p>'
    await enviarEmail({ to: 'persona@example.com', subject: 'x', html }, { ...DEPS, fetchImpl })

    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string)
    expect(body.html).toBe(html)
  })
})
