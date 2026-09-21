// T030 (US3): test de contrato de pools-jueces — status codes de
// contracts/api.md, incluido el caso central de FR-015: el body de POST se
// VALIDA contra la provincia del usuario (no se ignora como propietario_id
// en organismos; acá una provincia no coincidente rechaza toda la request).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import {
  asignarProvincia,
  crearUsuarioDePrueba,
  limpiarPoolsDePrueba,
  limpiarUsuariosDePrueba,
} from '../helpers/db.js'

const PREFIJO = 'test-contract-pools'
const pool = getPgPool()

describe('Contrato: pools-jueces', () => {
  let app: FastifyInstance
  let cookieX: string

  beforeAll(async () => {
    await limpiarPoolsDePrueba(pool, PREFIJO)
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const x = await crearUsuarioDePrueba(app, `${PREFIJO}-x@example.observatorio.test`)
    await asignarProvincia(pool, x.usuarioId, 1)
    cookieX = x.cookie
  })

  afterAll(async () => {
    await limpiarPoolsDePrueba(pool, PREFIJO)
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('POST sin sesión da 401 (FR-004)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pools-jueces',
      payload: { provinciaId: 1, descripcion: `${PREFIJO}-sin-sesion`, totalJueces: 1 },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST con provinciaId igual a la del usuario crea el pool (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pools-jueces',
      headers: { cookie: cookieX },
      payload: { provinciaId: 1, descripcion: `${PREFIJO}-propio`, totalJueces: 4 },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().provincia_id).toBe(1)
  })

  it('POST con provinciaId distinta a la del usuario (no admin) da 403, sin crear nada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pools-jueces',
      headers: { cookie: cookieX },
      payload: { provinciaId: 2, descripcion: `${PREFIJO}-ajeno`, totalJueces: 4 },
    })
    expect(res.statusCode).toBe(403)

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM grupos_jueces WHERE descripcion = $1', [
      `${PREFIJO}-ajeno`,
    ])
    expect(rows[0].n).toBe(0)
  })

  it('GET/PATCH/DELETE del propio pool funcionan de punta a punta', async () => {
    const creado = await app.inject({
      method: 'POST',
      url: '/api/pools-jueces',
      headers: { cookie: cookieX },
      payload: { provinciaId: 1, descripcion: `${PREFIJO}-ciclo`, totalJueces: 2 },
    })
    const id = creado.json().id

    const get = await app.inject({ method: 'GET', url: `/api/pools-jueces/${id}`, headers: { cookie: cookieX } })
    expect(get.statusCode).toBe(200)

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/pools-jueces/${id}`,
      headers: { cookie: cookieX },
      payload: { totalJueces: 7 },
    })
    expect(patch.statusCode).toBe(200)
    expect(patch.json().total_jueces).toBe(7)

    const del = await app.inject({ method: 'DELETE', url: `/api/pools-jueces/${id}`, headers: { cookie: cookieX } })
    expect(del.statusCode).toBe(204)

    const getDespues = await app.inject({ method: 'GET', url: `/api/pools-jueces/${id}`, headers: { cookie: cookieX } })
    expect(getDespues.statusCode).toBe(404)
  })

  it('GET a un pool inexistente da 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pools-jueces/999999999', headers: { cookie: cookieX } })
    expect(res.statusCode).toBe(404)
  })
})
