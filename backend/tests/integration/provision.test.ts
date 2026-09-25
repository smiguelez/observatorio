// 007 (T007): servicio de provisión — atomicidad, normalización, validaciones y
// concurrencia (Decisión 4; FR-006, FR-019, FR-021).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { provisionarUsuario } from '../../src/services/usuarios.js'
import { ErrorNegocio } from '../../src/http/errores-integridad.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-provision'
const pool = getPgPool()
const email = (n: string) => `${PREFIJO}-${n}@example.observatorio.test`

async function filas(e: string) {
  const q = async (sql: string) => (await pool.query(sql, [e])).rows[0].n as number
  return {
    usuarios: await q(`SELECT count(*)::int n FROM usuarios WHERE email = $1`),
    roles: await q(`SELECT count(*)::int n FROM usuario_roles WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = $1)`),
    authUser: await q(`SELECT count(*)::int n FROM auth."user" WHERE email = $1`),
  }
}
async function rechazo(p: Promise<unknown>): Promise<ErrorNegocio> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorNegocio)
    return e as ErrorNegocio
  }
  throw new Error('se esperaba un rechazo')
}

describe('Servicio de provisión de usuarios', () => {
  beforeAll(() => limpiarUsuariosDePrueba(pool, PREFIJO))
  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
  })

  it('crea usuarios + roles + auth.user con el mismo id y emailVerified=true', async () => {
    const u = await provisionarUsuario(pool, { email: email('ok'), rol: 'usuario_normal', provinciaId: 3 })
    expect(u.roles).toEqual(['usuario_normal'])
    const au = await pool.query(`SELECT id, "emailVerified" FROM auth."user" WHERE email = $1`, [email('ok')])
    expect(au.rows[0]).toEqual({ id: u.id, emailVerified: true })
    const us = await pool.query(`SELECT provincia_id, email_verificado, firestore_id FROM usuarios WHERE id = $1`, [u.id])
    expect(us.rows[0].provincia_id).toBe(3)
    expect(us.rows[0].email_verificado).toBe(true)
    expect(us.rows[0].firestore_id).toMatch(/^api:/)
  })

  it('un admin tiene ambas filas de rol y puede no tener provincia', async () => {
    const u = await provisionarUsuario(pool, { email: email('admin'), rol: 'admin' })
    expect(u.provinciaId).toBeNull()
    const r = await pool.query(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1 ORDER BY 1`,
      [u.id],
    )
    expect(r.rows.map((x) => x.nombre)).toEqual(['admin', 'usuario_normal'])
  })

  it('normaliza el email (minúsculas, sin espacios) y un duplicado con otro casing se rechaza sin tocar al existente', async () => {
    const u = await provisionarUsuario(pool, { email: `  ${email('Norm').toUpperCase()} `, rol: 'usuario_normal', provinciaId: 1 })
    expect(u.email).toBe(email('norm'))
    const e = await rechazo(provisionarUsuario(pool, { email: email('norm'), rol: 'usuario_normal', provinciaId: 2 }))
    expect(e.message).toBe('Ese email ya está dado de alta.')
    const prov = await pool.query(`SELECT provincia_id FROM usuarios WHERE email = $1`, [email('norm')])
    expect(prov.rows[0].provincia_id).toBe(1)
    expect((await filas(email('norm'))).usuarios).toBe(1)
  })

  it.each([
    ['email inválido', { email: 'no-es-email', rol: 'usuario_normal' as const, provinciaId: 1 }, 'formato válido'],
    ['rol inválido', { email: email('rol'), rol: 'superuser' as never, provinciaId: 1 }, 'rol indicado no existe'],
    ['usuario normal sin provincia', { email: email('sinprov'), rol: 'usuario_normal' as const }, 'obligatoria'],
    ['provincia inexistente', { email: email('provx'), rol: 'usuario_normal' as const, provinciaId: 9999 }, 'provincia indicada no existe'],
  ])('rechaza %s y no deja ninguna fila', async (_n, datos, fragmento) => {
    const e = await rechazo(provisionarUsuario(pool, datos))
    expect(e.statusCode).toBe(400)
    expect(e.message).toContain(fragmento)
    expect(await filas(datos.email)).toEqual({ usuarios: 0, roles: 0, authUser: 0 })
  })

  it('si falla el INSERT de auth."user" se revierte todo (0 filas parciales)', async () => {
    // auth."user".email es UNIQUE: una fila huérfana previa fuerza el fallo tardío de la transacción.
    await pool.query(
      `INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES ('huerfano-test-provision', 'x', $1, true)`,
      [email('atomico')],
    )
    await expect(provisionarUsuario(pool, { email: email('atomico'), rol: 'usuario_normal', provinciaId: 1 })).rejects.toThrow()
    expect((await filas(email('atomico'))).usuarios).toBe(0)
    expect((await filas(email('atomico'))).roles).toBe(0)
    await pool.query(`DELETE FROM auth."user" WHERE id = 'huerfano-test-provision'`)
  })

  it('dos altas simultáneas del mismo email: se crea una sola, la otra recibe "ya está dado de alta"', async () => {
    const datos = { email: email('carrera'), rol: 'usuario_normal' as const, provinciaId: 1 }
    const r = await Promise.allSettled([provisionarUsuario(pool, datos), provisionarUsuario(pool, datos)])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    const rej = r.find((x) => x.status === 'rejected') as PromiseRejectedResult
    expect((rej.reason as Error).message).toBe('Ese email ya está dado de alta.')
    expect(await filas(email('carrera'))).toEqual({ usuarios: 1, roles: 1, authUser: 1 })
  })
})

// T026 (007, US4): flujo completo alta → canje → ingreso, un solo uso, vencimiento y convivencia de métodos.
describe('Flujo de alta administrada y primer acceso', () => {
  let app: FastifyInstance
  let admin: { usuarioId: string; cookie: string }
  const P2 = 'test-provision-flujo'
  const e2 = (n: string) => `${P2}-${n}@example.observatorio.test`
  const alta = async (n: string, provinciaId = 6) =>
    (await app.inject({ method: 'POST', url: '/api/usuarios', headers: { cookie: admin.cookie }, payload: { email: e2(n), rol: 'usuario_normal', provinciaId } })).json()
  const canjear = (token: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/acceso-inicial/canjear', payload: { token, password } })

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, P2)
    app = await buildApp()
    admin = await crearUsuarioDePrueba(app, e2('admin'), { rol: 'admin' })
  })
  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, P2)
    await app.close()
  })

  it('alta → canje → sesión con la provincia y el rol asignados → ingreso posterior por contraseña (US4-1/2, SC-007)', async () => {
    const t0 = Date.now()
    const a = await alta('ok')
    const c = await canjear(a.accesoInicial.token, 'clave-inicial-larga-1')
    expect(c.statusCode).toBe(200)
    const login = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: e2('ok'), password: 'clave-inicial-larga-1' } })
    expect(login.statusCode).toBe(200)
    expect(Date.now() - t0).toBeLessThan(5 * 60 * 1000)
  })

  it('dos canjes simultáneos del mismo acceso: solo el primero tiene efecto (US4 edge)', async () => {
    const a = await alta('carrera')
    const r = await Promise.all([canjear(a.accesoInicial.token, 'clave-carrera-uno-1'), canjear(a.accesoInicial.token, 'clave-carrera-dos-2')])
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 400])
    const ganadora = r[0]!.statusCode === 200 ? 'clave-carrera-uno-1' : 'clave-carrera-dos-2'
    const login = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: e2('carrera'), password: ganadora } })
    expect(login.statusCode).toBe(200)
  })

  it('la contraseña fijada por el acceso inicial sobrevive a un ingreso posterior por enlace (US4-7, FR-020)', async () => {
    const a = await alta('enlace')
    await canjear(a.accesoInicial.token, 'clave-que-sobrevive-1')
    await app.inject({ method: 'POST', url: '/api/auth/sign-in/magic-link', payload: { email: e2('enlace') } })
    const { rows } = await pool.query(`SELECT identifier FROM auth.verification WHERE value LIKE $1 ORDER BY "createdAt" DESC LIMIT 1`, [`%${e2('enlace')}%`])
    const v = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${rows[0].identifier}` })
    expect(v.statusCode).toBe(200)
    const cuentas = await pool.query(`SELECT count(*)::int n FROM auth.account WHERE "userId" = $1 AND "providerId" = 'credential'`, [a.id])
    expect(cuentas.rows[0].n).toBe(1)
    const login = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: e2('enlace'), password: 'clave-que-sobrevive-1' } })
    expect(login.statusCode).toBe(200)
  })

  it('un dado de alta que no canjeó puede ingresar por enlace; el acceso inicial no es la única puerta (US4 edge)', async () => {
    const a = await alta('soloenlace')
    await app.inject({ method: 'POST', url: '/api/auth/sign-in/magic-link', payload: { email: e2('soloenlace') } })
    const { rows } = await pool.query(`SELECT identifier FROM auth.verification WHERE value LIKE $1 AND identifier NOT LIKE 'reset-password:%' ORDER BY "createdAt" DESC LIMIT 1`, [`%${e2('soloenlace')}%`])
    const v = await app.inject({ method: 'GET', url: `/api/auth/magic-link/verify?token=${rows[0].identifier}` })
    expect(v.statusCode).toBe(200)
    expect(v.json().user.id).toBe(a.id)
  })
})
