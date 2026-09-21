// T035 (US4): lectura amplia + edición rechazada entre usuarios sin
// relación, permitida para admin (quickstart.md Paso 7). Verifica los DOS
// lados de la regla: la visibilidad amplia (lo que NO se restringe) y la
// edición acotada (lo que SÍ se restringe) — no alcanza con probar uno solo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, hacerAdmin, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-usuarios-authz'
const pool = getPgPool()

describe('Perfiles de usuario: lectura amplia + edición acotada (FR-016/FR-017)', () => {
  let app: FastifyInstance
  let cookieM: string
  let cookieN: string
  let cookieAdmin: string
  let usuarioMId: string
  let usuarioNId: string

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()

    const m = await crearUsuarioDePrueba(app, `${PREFIJO}-m@example.observatorio.test`)
    const n = await crearUsuarioDePrueba(app, `${PREFIJO}-n@example.observatorio.test`)
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-admin@example.observatorio.test`)
    await hacerAdmin(pool, admin.usuarioId)

    cookieM = m.cookie
    cookieN = n.cookie
    cookieAdmin = admin.cookie
    usuarioMId = m.usuarioId
    usuarioNId = n.usuarioId
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('lado 1 — M lee el perfil completo de N (email incluido), sin relación ni rol especial', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/usuarios/${usuarioNId}`, headers: { cookie: cookieM } })
    expect(res.statusCode).toBe(200)
    expect(res.json().email).toBe(`${PREFIJO}-n@example.observatorio.test`)
  })

  it('lado 1 (simétrico) — N lee el perfil completo de M', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/usuarios/${usuarioMId}`, headers: { cookie: cookieN } })
    expect(res.statusCode).toBe(200)
    expect(res.json().email).toBe(`${PREFIJO}-m@example.observatorio.test`)
  })

  it('lado 1 — la lista /api/usuarios incluye a ambos para cualquiera de los dos', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/usuarios', headers: { cookie: cookieM } })
    expect(res.statusCode).toBe(200)
    const ids = res.json().map((u: { id: string }) => u.id)
    expect(ids).toContain(usuarioMId)
    expect(ids).toContain(usuarioNId)
  })

  it('lado 2 — M NO puede editar el perfil de N (sin relación, sin admin)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioNId}`,
      headers: { cookie: cookieM },
      payload: { nombreDisplay: 'Editado indebidamente por M' },
    })
    expect(res.statusCode).toBe(403)

    const { rows } = await pool.query('SELECT nombre_display FROM usuarios WHERE id = $1', [usuarioNId])
    expect(rows[0].nombre_display).not.toBe('Editado indebidamente por M')
  })

  it('lado 2 — M SÍ puede editar su propio perfil', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioMId}`,
      headers: { cookie: cookieM },
      payload: { nombreDisplay: 'M edita lo propio' },
    })
    expect(res.statusCode).toBe(200)

    const { rows } = await pool.query('SELECT nombre_display FROM usuarios WHERE id = $1', [usuarioMId])
    expect(rows[0].nombre_display).toBe('M edita lo propio')
  })

  it('lado 2 — un admin SÍ puede editar el perfil de N sin ser N', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioNId}`,
      headers: { cookie: cookieAdmin },
      payload: { nombreDisplay: 'N editado por admin' },
    })
    expect(res.statusCode).toBe(200)

    const { rows } = await pool.query('SELECT nombre_display FROM usuarios WHERE id = $1', [usuarioNId])
    expect(rows[0].nombre_display).toBe('N editado por admin')
  })
})
