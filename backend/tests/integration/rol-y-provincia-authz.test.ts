// T017 (007, US2): la provincia de un usuario la escribe solo un admin (FR-008..FR-011, FR-015).
// (T021, US3, agrega la sección de rol en este mismo archivo.)
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarPoolsDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-rolprov'
const pool = getPgPool()
const email = (n: string) => `${PREFIJO}-${n}@example.observatorio.test`
const MENSAJE_403 = 'La provincia de un usuario solo la puede asignar un administrador.'

describe('Provincia: solo un administrador la asigna (US2)', () => {
  let app: FastifyInstance
  let normal: { usuarioId: string; cookie: string }
  let admin: { usuarioId: string; cookie: string }

  const patch = (id: string, cookie: string, payload: object) =>
    app.inject({ method: 'PATCH', url: `/api/usuarios/${id}`, headers: { cookie }, payload })
  const estado = async (id: string) =>
    (await pool.query(`SELECT provincia_id, nombre_display FROM usuarios WHERE id = $1`, [id])).rows[0]

  beforeAll(async () => {
    await limpiarPoolsDePrueba(pool, PREFIJO)
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    normal = await crearUsuarioDePrueba(app, email('normal'), { provinciaId: 1 })
    admin = await crearUsuarioDePrueba(app, email('admin'), { rol: 'admin', provinciaId: null })
  })
  afterAll(async () => {
    await limpiarPoolsDePrueba(pool, PREFIJO)
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('no admin que cambia SU provincia: 403 explícito y nada cambia (US2-1, SC-004)', async () => {
    const res = await patch(normal.usuarioId, normal.cookie, { provinciaId: 2 })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe(MENSAJE_403)
    expect((await estado(normal.usuarioId)).provincia_id).toBe(1)
  })

  it('no admin que cambia nombre Y provincia: se rechaza COMPLETO, ni el nombre se modifica (US2-2)', async () => {
    const antes = await estado(normal.usuarioId)
    const res = await patch(normal.usuarioId, normal.cookie, { nombreDisplay: 'No debería guardarse', provinciaId: 3 })
    expect(res.statusCode).toBe(403)
    expect(await estado(normal.usuarioId)).toEqual(antes)
  })

  it('no admin que reenvía su provincia ACTUAL junto con otros datos: se guardan y la provincia queda igual (US2-3, FR-010)', async () => {
    const res = await patch(normal.usuarioId, normal.cookie, { nombreDisplay: 'Nombre nuevo', provinciaId: 1 })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ nombre_display: 'Nombre nuevo', provincia_id: 1 })
    expect(await estado(normal.usuarioId)).toEqual({ provincia_id: 1, nombre_display: 'Nombre nuevo' })
  })

  it('no admin sin provincia (null) que se asigna una: es un cambio → 403 (Decisión 6)', async () => {
    const sinProv = await crearUsuarioDePrueba(app, email('sinprov'), { rol: 'admin', provinciaId: null })
    await pool.query(`DELETE FROM usuario_roles WHERE usuario_id = $1 AND rol_id = (SELECT id FROM roles WHERE nombre='admin')`, [sinProv.usuarioId])
    const res = await patch(sinProv.usuarioId, sinProv.cookie, { provinciaId: 4 })
    expect(res.statusCode).toBe(403)
    expect((await estado(sinProv.usuarioId)).provincia_id).toBeNull()
  })

  it('no admin sobre OTRO usuario: 403 (regla de 002)', async () => {
    const res = await patch(admin.usuarioId, normal.cookie, { provinciaId: 1 })
    expect(res.statusCode).toBe(403)
  })

  it('admin asigna la provincia de otro: 200, y rige desde la siguiente solicitud del afectado sin re-login (US2-4/5, SC-005)', async () => {
    // El afectado opera pools de SU provincia (1); tras el cambio solo los de la 2.
    const creado = await app.inject({
      method: 'POST', url: '/api/pools-jueces', headers: { cookie: normal.cookie },
      payload: { provinciaId: 1, descripcion: `${PREFIJO}-pool-prov1`, totalJueces: 2 },
    })
    expect(creado.statusCode).toBe(201)
    const poolId = creado.json().id
    expect((await app.inject({ method: 'GET', url: `/api/pools-jueces/${poolId}`, headers: { cookie: normal.cookie } })).statusCode).toBe(200)

    const res = await patch(normal.usuarioId, admin.cookie, { provinciaId: 2 })
    expect(res.statusCode).toBe(200)
    expect(res.json().provincia_id).toBe(2)

    // Misma cookie (sin re-login): ya no ve el pool de la provincia anterior…
    expect((await app.inject({ method: 'GET', url: `/api/pools-jueces/${poolId}`, headers: { cookie: normal.cookie } })).statusCode).toBe(403)
    // …y sí opera en la nueva.
    const nuevo = await app.inject({
      method: 'POST', url: '/api/pools-jueces', headers: { cookie: normal.cookie },
      payload: { provinciaId: 2, descripcion: `${PREFIJO}-pool-prov2`, totalJueces: 2 },
    })
    expect(nuevo.statusCode).toBe(201)
  })

  it('admin con una provincia inexistente: 400 con mensaje claro, nunca 500 (US2-6, FR-015)', async () => {
    const res = await patch(normal.usuarioId, admin.cookie, { provinciaId: 9999 })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('La provincia indicada no existe.')
    expect((await estado(normal.usuarioId)).provincia_id).toBe(2)
  })

  it('admin sobre un usuario inexistente: 404', async () => {
    const res = await patch('999999999', admin.cookie, { provinciaId: 1 })
    expect(res.statusCode).toBe(404)
  })
})

// T021 (007, US3): rol solo por admin, efecto inmediato y último admin protegido (FR-012..FR-015, SC-006).
describe('Rol: un administrador otorga o quita el rol admin (US3)', () => {
  let app: FastifyInstance
  const put = (id: string, cookie: string, payload: object) =>
    app.inject({ method: 'PUT', url: `/api/usuarios/${id}/rol`, headers: { cookie }, payload })
  const roles = async (id: string) =>
    (await pool.query(`SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1 ORDER BY 1`, [id])).rows.map((r) => r.nombre)
  // Los admins reales NO se tocan nunca. La regla del último administrador (FR-014) y su carrera se prueban
  // en un esquema aislado: tests/integration/ultimo-admin.test.ts.

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, `${PREFIJO}-rol`)
    app = await buildApp()
  })
  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, `${PREFIJO}-rol`)
    await app.close()
  })

  it('promover: el afectado usa funciones de admin en su SIGUIENTE solicitud, sin re-login (US3-1, SC-005)', async () => {
    const a = await crearUsuarioDePrueba(app, email('rol-a'), { rol: 'admin' })
    const u = await crearUsuarioDePrueba(app, email('rol-u'))
    // Como normal no puede promover a otro…
    expect((await put(a.usuarioId, u.cookie, { rol: 'usuario_normal' })).statusCode).toBe(403)
    const res = await put(u.usuarioId, a.cookie, { rol: 'admin' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: u.usuarioId, roles: ['usuario_normal', 'admin'] })
    // …y con la MISMA cookie ahora sí puede.
    const sesion = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: u.cookie } })
    expect(sesion.json().rol).toBe('admin')
    expect((await put(a.usuarioId, u.cookie, { rol: 'usuario_normal' })).statusCode).toBe(200)
    // (a fue degradado por u: se restituye para los pasos siguientes)
    await pool.query(`INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, (SELECT id FROM roles WHERE nombre='admin')) ON CONFLICT DO NOTHING`, [a.usuarioId])
  })

  it('degradar: pierde las funciones de admin de inmediato y conserva usuario_normal (US3-2, US3-6)', async () => {
    const a = await crearUsuarioDePrueba(app, email('rol-b'), { rol: 'admin' })
    const v = await crearUsuarioDePrueba(app, email('rol-v'), { rol: 'admin' })
    const res = await put(v.usuarioId, a.cookie, { rol: 'usuario_normal' })
    expect(res.statusCode).toBe(200)
    expect(res.json().roles).toEqual(['usuario_normal'])
    expect(await roles(v.usuarioId)).toEqual(['usuario_normal'])
    expect((await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: v.cookie } })).json().rol).toBe('usuario_normal')
    // su ficha muestra el rol actual
    const ficha = await app.inject({ method: 'GET', url: `/api/usuarios/${v.usuarioId}`, headers: { cookie: a.cookie } })
    expect(ficha.json().roles).toEqual(['usuario_normal'])
  })

  it('no admin (incluso sobre sí mismo): 403 con mensaje y nada cambia (US3-3, SC-006)', async () => {
    const n = await crearUsuarioDePrueba(app, email('rol-n'))
    const res = await put(n.usuarioId, n.cookie, { rol: 'admin' })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBeTypeOf('string')
    expect(await roles(n.usuarioId)).toEqual(['usuario_normal'])
  })

  it('usuario o rol inexistente: 404 / 400 con mensaje, nunca 500 (US3-5, FR-015)', async () => {
    const a = await crearUsuarioDePrueba(app, email('rol-c'), { rol: 'admin' })
    const sinUsuario = await put('999999999', a.cookie, { rol: 'admin' })
    expect(sinUsuario.statusCode).toBe(404)
    const rolMalo = await put(a.usuarioId, a.cookie, { rol: 'superusuario' })
    expect(rolMalo.statusCode).toBe(400)
    expect(rolMalo.json().error).toBe('El rol indicado no existe.')
    expect(await roles(a.usuarioId)).toContain('admin')
  })

  it('autodescenso con OTROS admins: permitido (borde de US3-4)', async () => {
    const a = await crearUsuarioDePrueba(app, email('rol-d'), { rol: 'admin' })
    const res = await put(a.usuarioId, a.cookie, { rol: 'usuario_normal' })
    expect(res.statusCode).toBe(200)
  })
})
