// T034 (US4): test de contrato de usuarios — status codes de
// contracts/api.md: lectura amplia sin chequeo adicional (FR-017),
// escritura acotada a propio usuario o admin (FR-016).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-usuarios'
const pool = getPgPool()

describe('Contrato: usuarios', () => {
  let app: FastifyInstance
  let cookieM: string
  let usuarioMId: string
  let usuarioNId: string

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const m = await crearUsuarioDePrueba(app, `${PREFIJO}-m@example.observatorio.test`)
    const n = await crearUsuarioDePrueba(app, `${PREFIJO}-n@example.observatorio.test`)
    cookieM = m.cookie
    usuarioMId = m.usuarioId
    usuarioNId = n.usuarioId
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('GET /api/usuarios sin sesión da 401 (FR-004)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/usuarios' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/usuarios/:id sin sesión da 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/usuarios/${usuarioNId}` })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/usuarios/:id de OTRO usuario, sin relación, da 200 con el perfil completo (FR-017)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/usuarios/${usuarioNId}`, headers: { cookie: cookieM } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(usuarioNId)
    expect(body.email).toBe(`${PREFIJO}-n@example.observatorio.test`)
  })

  it('GET /api/usuarios/:id inexistente da 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/usuarios/999999999', headers: { cookie: cookieM } })
    expect(res.statusCode).toBe(404)
  })

  it('PATCH del propio perfil da 200', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioMId}`,
      headers: { cookie: cookieM },
      payload: { nombreDisplay: 'M vía contrato' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().nombre_display).toBe('M vía contrato')
  })

  it('PATCH del perfil de OTRO usuario (sin ser admin) da 403', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioNId}`,
      headers: { cookie: cookieM },
      payload: { nombreDisplay: 'Intento de M sobre N' },
    })
    expect(res.statusCode).toBe(403)
  })

  // T018 (007, US2): tabla de contracts/api.md §1 para PATCH /api/usuarios/:id.
  it('PATCH con provinciaId DISTINTA de un no admin: 403 con { error } explícito (FR-009)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioMId}`,
      headers: { cookie: cookieM },
      payload: { provinciaId: 24 },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: 'La provincia de un usuario solo la puede asignar un administrador.' })
  })

  it('PATCH con la provinciaId ACTUAL de un no admin: 200 y la respuesta refleja la provincia sin cambios (FR-010)', async () => {
    const { rows } = await pool.query('SELECT provincia_id FROM usuarios WHERE id = $1', [usuarioMId])
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioMId}`,
      headers: { cookie: cookieM },
      payload: { provinciaId: rows[0].provincia_id },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().provincia_id).toBe(rows[0].provincia_id)
  })

  it('PATCH de admin con una provincia inexistente: 400 { error }', async () => {
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-adminprov@example.observatorio.test`, { rol: 'admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioNId}`,
      headers: { cookie: admin.cookie },
      payload: { provinciaId: 9999 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'La provincia indicada no existe.' })
  })

  // T022 (007, US3): contrato de PUT /api/usuarios/:id/rol (contracts/api.md §1).
  it('PUT /:id/rol sin sesión da 401; de un no admin da 403 { error }', async () => {
    const sinSesion = await app.inject({ method: 'PUT', url: `/api/usuarios/${usuarioNId}/rol`, payload: { rol: 'admin' } })
    expect(sinSesion.statusCode).toBe(401)
    const noAdmin = await app.inject({
      method: 'PUT', url: `/api/usuarios/${usuarioNId}/rol`, headers: { cookie: cookieM }, payload: { rol: 'admin' },
    })
    expect(noAdmin.statusCode).toBe(403)
    expect(noAdmin.json().error).toBeTypeOf('string')
  })

  it('PUT /:id/rol de admin: 200 { id, roles } al promover; 404 usuario inexistente; 400 { error } rol inválido; 400 id mal formado', async () => {
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-adminrol@example.observatorio.test`, { rol: 'admin' })
    const ok = await app.inject({
      method: 'PUT', url: `/api/usuarios/${usuarioNId}/rol`, headers: { cookie: admin.cookie }, payload: { rol: 'admin' },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ id: usuarioNId, roles: ['usuario_normal', 'admin'] })
    // se restituye para no dejar a N como admin en otros tests del archivo
    await app.inject({ method: 'PUT', url: `/api/usuarios/${usuarioNId}/rol`, headers: { cookie: admin.cookie }, payload: { rol: 'usuario_normal' } })

    const noExiste = await app.inject({ method: 'PUT', url: '/api/usuarios/999999999/rol', headers: { cookie: admin.cookie }, payload: { rol: 'admin' } })
    expect(noExiste.statusCode).toBe(404)
    const rolMalo = await app.inject({ method: 'PUT', url: `/api/usuarios/${usuarioNId}/rol`, headers: { cookie: admin.cookie }, payload: { rol: 'jefe' } })
    expect(rolMalo.statusCode).toBe(400)
    expect(rolMalo.json()).toEqual({ error: 'El rol indicado no existe.' })
    const idMalo = await app.inject({ method: 'PUT', url: '/api/usuarios/abc/rol', headers: { cookie: admin.cookie }, payload: { rol: 'admin' } })
    expect(idMalo.statusCode).toBe(400)
  })
})
