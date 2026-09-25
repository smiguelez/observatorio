import { afterEach, describe, expect, it, vi } from 'vitest'
import { listarUsuarios, obtenerUsuario } from '@/api/usuarios'
import { wire } from './fixtures/wire'

function responder(cuerpo: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(cuerpo), { status: 200 })))
}
afterEach(() => vi.unstubAllGlobals())

describe('mapeo de usuarios (respuestas reales)', () => {
  it('id string => number, snake => camel', async () => {
    responder(wire.usuariosLista)
    expect(await listarUsuarios()).toEqual([
      { id: 97, email: 'usuario-0@ejemplo.test', nombreDisplay: 'Usuario 0', provinciaId: 10, roles: ['usuario_normal'] },
    ])
  })
  it('roles: null (usuario sin roles) => []', async () => {
    responder([{ id: '5', email: 'a@b.co', nombre_display: null, provincia_id: null, roles: null }])
    expect((await listarUsuarios())[0]).toMatchObject({ id: 5, nombreDisplay: null, provinciaId: null, roles: [] })
  })
  it('detalle: incluye email_verificado y foto_url', async () => {
    responder({ id: '5', email: 'a@b.co', nombre_display: 'A', email_verificado: true, foto_url: null, provincia_id: 3, roles: ['admin'] })
    expect(await obtenerUsuario(5)).toEqual({ id: 5, email: 'a@b.co', nombreDisplay: 'A', provinciaId: 3, roles: ['admin'], emailVerificado: true, fotoUrl: null })
  })
  it('un id no entero lanza ContratoInesperado', async () => {
    responder([{ id: 'abc', email: 'a@b.co', nombre_display: null, provincia_id: null, roles: [] }])
    await expect(listarUsuarios()).rejects.toMatchObject({ name: 'ContratoInesperado' })
  })
})
