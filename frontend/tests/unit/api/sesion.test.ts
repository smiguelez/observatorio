import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContratoInesperado } from '@/api/http'
import { obtenerSesion, SesionWire } from '@/api/sesion'

function responder(status: number, cuerpo?: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status })),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('sesión', () => {
  it('normaliza usuarioId string -> number (respuesta real capturada en el spike T010)', () => {
    expect(SesionWire.parse({ usuarioId: '1172', rol: 'usuario_normal', provinciaId: null })).toEqual({
      usuarioId: 1172,
      rol: 'usuario_normal',
      provinciaId: null,
    })
  })

  it('un campo faltante lanza ContratoInesperado con el campo', async () => {
    responder(200, { usuarioId: '1', provinciaId: null })
    await expect(obtenerSesion()).rejects.toMatchObject({ name: 'ContratoInesperado', campo: 'rol' })
    await expect(obtenerSesion()).rejects.toBeInstanceOf(ContratoInesperado)
  })

  it('401 => null (sin sesión no es un error)', async () => {
    responder(401, { error: 'No autenticado' })
    await expect(obtenerSesion()).resolves.toBeNull()
  })

  it('otros errores se propagan', async () => {
    responder(500, { error: 'boom' })
    await expect(obtenerSesion()).rejects.toMatchObject({ status: 500 })
  })
})
