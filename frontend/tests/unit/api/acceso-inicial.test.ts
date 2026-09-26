import { afterEach, describe, expect, it, vi } from 'vitest'
import { canjearAccesoInicial } from '@/api/acceso-inicial'
import canje from './fixtures/real/canje.json'
import invalido from './fixtures/real/error-canje-invalido.json'
import corta from './fixtures/real/error-canje-password-corta.json'

function responder(cuerpo: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(cuerpo), { status })))
}
afterEach(() => vi.unstubAllGlobals())

describe('canje del acceso inicial (respuestas REALES de 007)', () => {
  it('200: { usuarioId } string => number; envía { token, password } por POST', async () => {
    responder(canje)
    expect(await canjearAccesoInicial({ token: 'abc', password: 'clave-larga-123' })).toEqual({ usuarioId: 2396 })
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('/api/acceso-inicial/canjear')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ token: 'abc', password: 'clave-larga-123' })
  })
  it('400 de acceso no válido: ApiError con el texto del servidor y SIN código (no es un error de contraseña)', async () => {
    responder(invalido, 400)
    const e = await canjearAccesoInicial({ token: 'x', password: 'clave-larga-123' }).catch((x: unknown) => x)
    expect(e).toMatchObject({ name: 'ApiError', status: 400, message: 'El acceso inicial no es válido o venció.' })
    expect((e as { codigo?: string }).codigo).toBeUndefined()
  })
  it('400 de contraseña corta: conserva el código PASSWORD_TOO_SHORT', async () => {
    responder(corta, 400)
    await expect(canjearAccesoInicial({ token: 'x', password: 'corta' })).rejects.toMatchObject({ status: 400, codigo: 'PASSWORD_TOO_SHORT' })
  })
  it('deriva del contrato: usuarioId no numérico => ContratoInesperado', async () => {
    responder({ usuarioId: 'abc' })
    await expect(canjearAccesoInicial({ token: 'x', password: 'clave-larga-123' })).rejects.toMatchObject({ name: 'ContratoInesperado' })
  })
})
