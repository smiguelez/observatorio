// T037 (US5): test de contrato de localidades — lectura permitida (FR-018);
// las rutas de escritura NO EXISTEN (FR-019): 404, no 403, ni siquiera para
// un admin — no hay regla de autorización que rechazar.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, hacerAdmin, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-localidades'
const pool = getPgPool()

describe('Contrato: localidades', () => {
  let app: FastifyInstance
  let cookie: string
  let cookieAdmin: string
  let localidadId: number

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()

    const usuario = await crearUsuarioDePrueba(app, `${PREFIJO}@example.observatorio.test`)
    cookie = usuario.cookie

    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-admin@example.observatorio.test`)
    await hacerAdmin(pool, admin.usuarioId)
    cookieAdmin = admin.cookie

    const { rows } = await pool.query<{ id: number }>('SELECT id FROM localidades ORDER BY id LIMIT 1')
    localidadId = rows[0]!.id
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('GET /api/localidades sin sesión da 401 (FR-004)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/localidades' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/localidades con sesión da 200 y una lista no vacía (FR-018)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/localidades', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })

  it('GET /api/localidades/:id existente da 200', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/localidades/${localidadId}`, headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(localidadId)
  })

  it('GET /api/localidades/:id inexistente da 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/localidades/999999999', headers: { cookie } })
    expect(res.statusCode).toBe(404)
  })

  it.each([
    ['POST', '/api/localidades'],
    ['PATCH', `/api/localidades/${1}`],
    ['DELETE', `/api/localidades/${1}`],
  ] as const)('%s /api/localidades da 404, NO 403 — la ruta no existe (FR-019)', async (method, url) => {
    const res = await app.inject({ method, url, headers: { cookie }, payload: { nombre: 'Intruso' } })
    expect(res.statusCode).toBe(404)
    expect(res.statusCode).not.toBe(403)
  })

  it('POST /api/localidades da 404 incluso para un ADMIN — no es una restricción de rol, la ruta no existe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/localidades',
      headers: { cookie: cookieAdmin },
      payload: { nombre: 'Intruso de admin' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.statusCode).not.toBe(403)
  })

  it('confirma que ningún intento de escritura anterior alteró el catálogo real', async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM localidades WHERE nombre = $1', ['Intruso'])
    expect(rows[0].n).toBe(0)
  })
})
