// T025 (007, US4): contrato del alta administrada, la reemisión y el canje del acceso inicial
// (contracts/api.md §1). Contra la app real y la base real.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { contarIdentidad, crearUsuarioDePrueba, extraerCookie, limpiarUsuariosDePrueba, provisionarSinIdentidad } from '../helpers/db.js'

// T011/T012 (010, US2): `enviarEmail` mockeado — nunca la red real (research.md, Decisión 3).
vi.mock('../../src/email/resend.js', () => ({ enviarEmail: vi.fn() }))
import { enviarEmail } from '../../src/email/resend.js'

const PREFIJO = 'test-contract-acceso'
const pool = getPgPool()
const email = (n: string) => `${PREFIJO}-${n}@example.observatorio.test`
const CERO = { usuarios: 0, authUser: 0, cuentas: 0, sesiones: 0, verificaciones: 0 }

describe('Contrato: alta administrada y acceso inicial', () => {
  let app: FastifyInstance
  let admin: { usuarioId: string; cookie: string }
  let normal: { usuarioId: string; cookie: string }

  const alta = (cookie: string | undefined, payload: object) =>
    app.inject({ method: 'POST', url: '/api/usuarios', headers: cookie ? { cookie } : {}, payload })
  const canjear = (payload: object) => app.inject({ method: 'POST', url: '/api/acceso-inicial/canjear', payload })

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    admin = await crearUsuarioDePrueba(app, email('admin'), { rol: 'admin' })
    normal = await crearUsuarioDePrueba(app, email('normal'))
  })
  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })
  afterEach(() => {
    vi.mocked(enviarEmail).mockReset()
  })

  describe('POST /api/usuarios', () => {
    it('sin sesión 401; de un no admin 403 y no se crea nada', async () => {
      expect((await alta(undefined, { email: email('x1'), rol: 'usuario_normal', provinciaId: 1 })).statusCode).toBe(401)
      const res = await alta(normal.cookie, { email: email('x2'), rol: 'usuario_normal', provinciaId: 1 })
      expect(res.statusCode).toBe(403)
      expect(await contarIdentidad(pool, email('x2'))).toEqual(CERO)
    })

    it('201 con id, roles, provincia y accesoInicial { token, vence }; el usuario aparece en la lista (US4-1)', async () => {
      const res = await alta(admin.cookie, { email: email('nuevo'), rol: 'usuario_normal', provinciaId: 3, nombreDisplay: 'Nueva Persona' })
      expect(res.statusCode).toBe(201)
      const b = res.json()
      expect(b).toMatchObject({ email: email('nuevo'), provinciaId: 3, roles: ['usuario_normal'] })
      expect(b.id).toMatch(/^\d+$/)
      expect(b.accesoInicial.token).toMatch(/^[A-Za-z0-9_-]{40,}$/) // alta entropía (32 bytes base64url)
      expect(new Date(b.accesoInicial.vence).getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000)
      const lista = await app.inject({ method: 'GET', url: '/api/usuarios', headers: { cookie: admin.cookie } })
      expect(lista.json().map((u: { id: string }) => u.id)).toContain(b.id)
    })

    it('un admin puede darse de alta sin provincia', async () => {
      const res = await alta(admin.cookie, { email: email('adm2'), rol: 'admin' })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ provinciaId: null, roles: ['usuario_normal', 'admin'] })
    })

    it.each([
      ['email inválido', { email: 'nope', rol: 'usuario_normal', provinciaId: 1 }, 'formato válido'],
      ['rol inválido', { email: email('r'), rol: 'jefe', provinciaId: 1 }, 'El rol indicado no existe.'],
      ['usuario normal sin provincia', { email: email('sp'), rol: 'usuario_normal' }, 'La provincia es obligatoria para un usuario normal.'],
      ['provincia inexistente', { email: email('pi'), rol: 'usuario_normal', provinciaId: 9999 }, 'La provincia indicada no existe.'],
    ])('400 con mensaje claro y 0 filas: %s', async (_n, payload, mensaje) => {
      const res = await alta(admin.cookie, payload)
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toContain(mensaje)
      expect(await contarIdentidad(pool, (payload as { email: string }).email)).toEqual(CERO)
    })

    it('email ya dado de alta (con otro casing): 400 "ya está dado de alta" y el existente no se modifica (US4-4)', async () => {
      const antes = (await pool.query(`SELECT provincia_id FROM usuarios WHERE email = $1`, [email('nuevo')])).rows[0]
      const res = await alta(admin.cookie, { email: email('nuevo').toUpperCase(), rol: 'admin', provinciaId: 9 })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('Ese email ya está dado de alta.')
      expect((await pool.query(`SELECT provincia_id FROM usuarios WHERE email = $1`, [email('nuevo')])).rows[0]).toEqual(antes)
    })
  })

  describe('POST /api/usuarios/:id/acceso-inicial (reemitir)', () => {
    it('401 sin sesión, 403 no admin, 404 usuario inexistente', async () => {
      const url = `/api/usuarios/${normal.usuarioId}/acceso-inicial`
      expect((await app.inject({ method: 'POST', url })).statusCode).toBe(401)
      expect((await app.inject({ method: 'POST', url, headers: { cookie: normal.cookie } })).statusCode).toBe(403)
      const r404 = await app.inject({ method: 'POST', url: '/api/usuarios/999999999/acceso-inicial', headers: { cookie: admin.cookie } })
      expect(r404.statusCode).toBe(404)
    })

    it('201 { token, vence }; el token anterior deja de servir y el nuevo sí (FR-019)', async () => {
      const a = (await alta(admin.cookie, { email: email('reemit'), rol: 'usuario_normal', provinciaId: 2 })).json()
      const nuevo = await app.inject({ method: 'POST', url: `/api/usuarios/${a.id}/acceso-inicial`, headers: { cookie: admin.cookie } })
      expect(nuevo.statusCode).toBe(201)
      expect(Object.keys(nuevo.json()).sort()).toEqual(['token', 'vence'])
      expect(nuevo.json().token).not.toBe(a.accesoInicial.token)

      const viejo = await canjear({ token: a.accesoInicial.token, password: 'clave-con-el-viejo-1' })
      expect(viejo.statusCode).toBe(400)
      const ok = await canjear({ token: nuevo.json().token, password: 'clave-con-el-nuevo-1' })
      expect(ok.statusCode).toBe(200)
    })

    it('funciona también para un usuario migrado que todavía no tiene fila en auth."user"', async () => {
      const id = await provisionarSinIdentidad(pool, email('migrado'), 4)
      const nuevo = await app.inject({ method: 'POST', url: `/api/usuarios/${id}/acceso-inicial`, headers: { cookie: admin.cookie } })
      expect(nuevo.statusCode).toBe(201)
      const ok = await canjear({ token: nuevo.json().token, password: 'clave-del-migrado-1' })
      expect(ok.statusCode).toBe(200)
      expect(ok.json()).toEqual({ usuarioId: id })
      const s = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: extraerCookie(ok.headers['set-cookie']) } })
      expect(s.json()).toEqual({ usuarioId: id, rol: 'usuario_normal', provinciaId: 4 })
    })
  })

  // T011/T012 (010, US2): endpoint nuevo — envía el acceso YA vigente, sin generar uno nuevo.
  describe('POST /api/usuarios/:id/acceso-inicial/enviar-email', () => {
    const enviar = (id: string, cookie: string | undefined) =>
      app.inject({ method: 'POST', url: `/api/usuarios/${id}/acceso-inicial/enviar-email`, headers: cookie ? { cookie } : {} })

    it('401 sin sesión, 403 no admin', async () => {
      const a = (await alta(admin.cookie, { email: email('env-401'), rol: 'usuario_normal', provinciaId: 1 })).json()
      expect((await enviar(a.id, undefined)).statusCode).toBe(401)
      expect((await enviar(a.id, normal.cookie)).statusCode).toBe(403)
    })

    it('envío exitoso: 200 { emailEnviado: true }, sin tocar el token vigente (contracts/api.md)', async () => {
      vi.mocked(enviarEmail).mockResolvedValue({ ok: true })
      const a = (await alta(admin.cookie, { email: email('env-ok'), rol: 'usuario_normal', provinciaId: 1 })).json()

      const res = await enviar(a.id, admin.cookie)

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ emailEnviado: true })
      expect(enviarEmail).toHaveBeenCalledTimes(1)
      const [args] = vi.mocked(enviarEmail).mock.calls[0]!
      expect(args.to).toBe(email('env-ok'))
      expect(args.html).toContain(a.accesoInicial.token) // el mismo token ya generado, no uno nuevo

      // El token vigente sigue siendo el mismo: se puede canjear sin problema.
      expect((await canjear({ token: a.accesoInicial.token, password: 'clave-tras-envio-1' })).statusCode).toBe(200)
    })

    it('envío fallido: 200 { emailEnviado: false } — nunca un error HTTP (FR-006/007)', async () => {
      vi.mocked(enviarEmail).mockResolvedValue({ ok: false, motivo: 'Resend respondió 500' })
      const a = (await alta(admin.cookie, { email: email('env-fallo'), rol: 'usuario_normal', provinciaId: 1 })).json()

      const res = await enviar(a.id, admin.cookie)

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ emailEnviado: false })
      // "Copiar enlace" (el token ya generado) sigue funcionando igual — el fallo de envío no lo toca.
      expect((await canjear({ token: a.accesoInicial.token, password: 'clave-post-fallo-1' })).statusCode).toBe(200)
    })

    it('sin ningún acceso vigente (ya canjeado): 404, sin intentar enviar nada', async () => {
      const a = (await alta(admin.cookie, { email: email('env-canjeado'), rol: 'usuario_normal', provinciaId: 1 })).json()
      await canjear({ token: a.accesoInicial.token, password: 'una-clave-cualquiera-1' })

      const res = await enviar(a.id, admin.cookie)

      expect(res.statusCode).toBe(404)
      expect(enviarEmail).not.toHaveBeenCalled()
    })

    it('tras reemitir, envía el token NUEVO — el anterior ya no es el vigente', async () => {
      vi.mocked(enviarEmail).mockResolvedValue({ ok: true })
      const a = (await alta(admin.cookie, { email: email('env-reemitido'), rol: 'usuario_normal', provinciaId: 1 })).json()
      const nuevo = (await app.inject({ method: 'POST', url: `/api/usuarios/${a.id}/acceso-inicial`, headers: { cookie: admin.cookie } })).json()

      await enviar(a.id, admin.cookie)

      const [args] = vi.mocked(enviarEmail).mock.calls[0]!
      expect(args.html).toContain(nuevo.token)
      expect(args.html).not.toContain(a.accesoInicial.token)
    })
  })

  describe('POST /api/acceso-inicial/canjear (público)', () => {
    it('200 { usuarioId } + Set-Cookie de sesión, sin sesión previa (FR-017)', async () => {
      const a = (await alta(admin.cookie, { email: email('canje'), rol: 'usuario_normal', provinciaId: 5 })).json()
      const res = await canjear({ token: a.accesoInicial.token, password: 'mi-clave-inicial-1' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ usuarioId: a.id })
      const s = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: extraerCookie(res.headers['set-cookie']) } })
      expect(s.json()).toEqual({ usuarioId: a.id, rol: 'usuario_normal', provinciaId: 5 })
    })

    it('token inexistente, usado o vencido: 400 uniforme, sin sesión (FR-017)', async () => {
      const a = (await alta(admin.cookie, { email: email('usado'), rol: 'usuario_normal', provinciaId: 5 })).json()
      expect((await canjear({ token: a.accesoInicial.token, password: 'primera-clave-1' })).statusCode).toBe(200)
      const usado = await canjear({ token: a.accesoInicial.token, password: 'segunda-clave-2' })
      const inexistente = await canjear({ token: 'no-existe-este-token', password: 'segunda-clave-2' })
      const b = (await alta(admin.cookie, { email: email('venc'), rol: 'usuario_normal', provinciaId: 5 })).json()
      await pool.query(`UPDATE auth.verification SET "expiresAt" = now() - interval '1 minute' WHERE identifier = $1`, [`reset-password:${b.accesoInicial.token}`])
      const vencido = await canjear({ token: b.accesoInicial.token, password: 'segunda-clave-2' })
      for (const r of [usado, inexistente, vencido]) {
        expect(r.statusCode).toBe(400)
        expect(r.json()).toEqual({ error: 'El acceso inicial no es válido o venció.' })
        expect(r.headers['set-cookie']).toBeUndefined()
      }
    })

    it('la política de contraseña se valida ANTES de mirar el token: 400 con code, igual para un token válido o no', async () => {
      const a = (await alta(admin.cookie, { email: email('corta'), rol: 'usuario_normal', provinciaId: 5 })).json()
      const conTokenValido = await canjear({ token: a.accesoInicial.token, password: 'corta' })
      const conTokenFalso = await canjear({ token: 'falso', password: 'corta' })
      expect(conTokenValido.statusCode).toBe(400)
      expect(conTokenValido.json().code).toBe('PASSWORD_TOO_SHORT')
      expect(conTokenFalso.json()).toEqual(conTokenValido.json())
      const larga = await canjear({ token: a.accesoInicial.token, password: 'x'.repeat(129) })
      expect(larga.json().code).toBe('PASSWORD_TOO_LONG')
      // el rechazo por política NO consumió el token
      expect((await canjear({ token: a.accesoInicial.token, password: 'ahora-si-larga-1' })).statusCode).toBe(200)
    })
  })
})
