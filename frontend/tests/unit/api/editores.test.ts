import { afterEach, describe, expect, it, vi } from 'vitest'
import { agregarEditor, listarEditores } from '@/api/editores'

afterEach(() => vi.unstubAllGlobals())
const stub = (cuerpo: unknown, status = 200) =>
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(cuerpo), { status })))

describe('editores', () => {
  it('usuarioId bigint (string) => number; nombre viene de nombre_display', async () => {
    stub([{ usuarioId: '1179', nombre: null, email: 'e@x.co' }])
    expect(await listarEditores(742)).toEqual([{ usuarioId: 1179, nombre: null, email: 'e@x.co' }])
  })
  it('el POST envía usuarioId como NÚMERO (el backend lo exige Integer)', async () => {
    stub({ usuarioId: 5 }, 201)
    await agregarEditor(742, 5)
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ usuarioId: 5 })
    expect(typeof JSON.parse(String(init.body)).usuarioId).toBe('number')
  })
  it('los 400 traen el mensaje del backend', async () => {
    stub({ error: 'Ese usuario ya es editor de este organismo.' }, 400)
    await expect(agregarEditor(742, 5)).rejects.toThrow('Ese usuario ya es editor de este organismo.')
  })
})
