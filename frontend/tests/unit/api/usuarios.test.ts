import { afterEach, describe, expect, it, vi } from 'vitest'
import { cambiarRol, crearUsuario, emitirAccesoInicial, listarUsuarios, obtenerUsuario } from '@/api/usuarios'
import altaAdmin from './fixtures/real/usuario-alta-admin.json'
import alta from './fixtures/real/usuario-alta.json'
import reemitido from './fixtures/real/acceso-reemitido.json'
import rol from './fixtures/real/rol.json'
import { wire } from './fixtures/wire'

function responder(cuerpo: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(cuerpo), { status })))
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

describe('alta administrada, acceso inicial y rol (respuestas REALES de 007)', () => {
  it('alta: id string => number, camelCase sin mapeo, vence => Date, un usuario normal trae una sola fila de rol', async () => {
    responder(alta, 201)
    const r = await crearUsuario({ email: alta.email, rol: 'usuario_normal', provinciaId: 3 })
    expect(r).toMatchObject({ id: 2396, email: alta.email, provinciaId: 3, roles: ['usuario_normal'] })
    expect(r.accesoInicial.vence).toBeInstanceOf(Date)
    expect(r.accesoInicial.vence.toISOString()).toBe(alta.accesoInicial.vence)
    expect(typeof r.accesoInicial.token).toBe('string')
  })
  it('alta de un admin sin provincia: provinciaId null y las DOS filas de rol', async () => {
    responder(altaAdmin, 201)
    const r = await crearUsuario({ email: altaAdmin.email, rol: 'admin', provinciaId: null })
    expect(r.provinciaId).toBeNull()
    expect(r.roles).toEqual(['usuario_normal', 'admin'])
  })
  it('el alta envía provinciaId solo si hay valor (un admin sin provincia no manda el campo)', async () => {
    responder(altaAdmin, 201)
    await crearUsuario({ email: 'a@b.co', rol: 'admin', provinciaId: null })
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.co', rol: 'admin' })
  })
  it('reemisión: { token, vence } y NO envía cuerpo ni content-type (Fastify rechazaría un POST vacío con JSON)', async () => {
    responder(reemitido, 201)
    const r = await emitirAccesoInicial(2396)
    expect(r.vence).toBeInstanceOf(Date)
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('/api/usuarios/2396/acceso-inicial')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(init.headers).toBeUndefined()
  })
  it('cambio de rol: { id, roles } con id number, y envía { rol } por PUT', async () => {
    responder(rol)
    expect(await cambiarRol(2396, 'admin')).toEqual({ id: 2396, roles: ['usuario_normal', 'admin'] })
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('/api/usuarios/2396/rol')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ rol: 'admin' })
  })
  it('deriva del contrato: sin accesoInicial, con un rol desconocido o con una fecha inválida => ContratoInesperado', async () => {
    responder({ ...alta, accesoInicial: undefined }, 201)
    await expect(crearUsuario({ email: 'a@b.co', rol: 'usuario_normal', provinciaId: 1 })).rejects.toMatchObject({ name: 'ContratoInesperado' })
    responder({ ...alta, roles: ['superusuario'] }, 201)
    await expect(crearUsuario({ email: 'a@b.co', rol: 'usuario_normal', provinciaId: 1 })).rejects.toMatchObject({ name: 'ContratoInesperado' })
    responder({ token: 'x', vence: 'no-es-fecha' }, 201)
    await expect(emitirAccesoInicial(1)).rejects.toMatchObject({ name: 'ContratoInesperado' })
    responder({ id: '2396', roles: ['jefe'] })
    await expect(cambiarRol(2396, 'admin')).rejects.toMatchObject({ name: 'ContratoInesperado' })
  })
})
