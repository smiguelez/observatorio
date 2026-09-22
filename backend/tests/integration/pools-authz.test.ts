// T031 (US3): misma provincia permite, provincia distinta rechaza (SC-003;
// quickstart.md Paso 6), admin siempre permite. Dos usuarios con el MISMO
// rol (usuario_normal) y provincias distintas — la variable que decide es
// la provincia, no el rol, y se prueba en ambos sentidos (no solo X→Y).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import {
  asignarProvincia,
  crearUsuarioDePrueba,
  hacerAdmin,
  limpiarPoolsDePrueba,
  limpiarUsuariosDePrueba,
} from '../helpers/db.js'

const PREFIJO = 'test-pools-authz'
const pool = getPgPool()

describe('Scoping por provincia en pools_jueces (SC-003)', () => {
  let app: FastifyInstance
  let cookieX: string
  let cookieY: string
  let cookieAdmin: string
  let poolXId: string
  let poolYId: string

  beforeAll(async () => {
    await limpiarPoolsDePrueba(pool, PREFIJO)
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()

    const x = await crearUsuarioDePrueba(app, `${PREFIJO}-x@example.observatorio.test`)
    const y = await crearUsuarioDePrueba(app, `${PREFIJO}-y@example.observatorio.test`)
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-admin@example.observatorio.test`)
    await asignarProvincia(pool, x.usuarioId, 1)
    await asignarProvincia(pool, y.usuarioId, 2)
    await asignarProvincia(pool, admin.usuarioId, 3) // provincia distinta de X e Y a propósito
    await hacerAdmin(pool, admin.usuarioId)

    cookieX = x.cookie
    cookieY = y.cookie
    cookieAdmin = admin.cookie

    const orgX = await app.inject({
      method: 'POST',
      url: '/api/pools-jueces',
      headers: { cookie: cookieX },
      payload: { provinciaId: 1, descripcion: `${PREFIJO}-de-x`, totalJueces: 5 },
    })
    poolXId = orgX.json().id

    const orgY = await app.inject({
      method: 'POST',
      url: '/api/pools-jueces',
      headers: { cookie: cookieY },
      payload: { provinciaId: 2, descripcion: `${PREFIJO}-de-y`, totalJueces: 3 },
    })
    poolYId = orgY.json().id
  })

  afterAll(async () => {
    await limpiarPoolsDePrueba(pool, PREFIJO)
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('misma provincia: X opera sobre su propio pool', async () => {
    const get = await app.inject({ method: 'GET', url: `/api/pools-jueces/${poolXId}`, headers: { cookie: cookieX } })
    expect(get.statusCode).toBe(200)
  })

  it('provincia distinta, MISMO rol: Y no puede operar sobre el pool de X', async () => {
    const get = await app.inject({ method: 'GET', url: `/api/pools-jueces/${poolXId}`, headers: { cookie: cookieY } })
    expect(get.statusCode).toBe(403)

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/pools-jueces/${poolXId}`,
      headers: { cookie: cookieY },
      payload: { totalJueces: 999 },
    })
    expect(patch.statusCode).toBe(403)

    const del = await app.inject({ method: 'DELETE', url: `/api/pools-jueces/${poolXId}`, headers: { cookie: cookieY } })
    expect(del.statusCode).toBe(403)
  })

  it('simétrico: X (mismo rol que Y) tampoco puede operar sobre el pool de Y', async () => {
    const get = await app.inject({ method: 'GET', url: `/api/pools-jueces/${poolYId}`, headers: { cookie: cookieX } })
    expect(get.statusCode).toBe(403)
  })

  it('crear declarando la provincia ajena se rechaza aunque el rol sea idéntico al del dueño legítimo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pools-jueces',
      headers: { cookie: cookieY },
      payload: { provinciaId: 1, descripcion: `${PREFIJO}-intruso`, totalJueces: 1 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin, de una provincia distinta a ambas, opera sobre los dos pools sin restricción', async () => {
    const getX = await app.inject({ method: 'GET', url: `/api/pools-jueces/${poolXId}`, headers: { cookie: cookieAdmin } })
    expect(getX.statusCode).toBe(200)

    const getY = await app.inject({ method: 'GET', url: `/api/pools-jueces/${poolYId}`, headers: { cookie: cookieAdmin } })
    expect(getY.statusCode).toBe(200)

    const patchX = await app.inject({
      method: 'PATCH',
      url: `/api/pools-jueces/${poolXId}`,
      headers: { cookie: cookieAdmin },
      payload: { totalJueces: 10 },
    })
    expect(patchX.statusCode).toBe(200)
  })

  it('la lista de pools de un usuario no-admin solo incluye los de su propia provincia', async () => {
    const listaX = await app.inject({ method: 'GET', url: '/api/pools-jueces', headers: { cookie: cookieX } })
    expect(listaX.statusCode).toBe(200)
    const ids = listaX.json().map((p: { id: string }) => p.id)
    expect(ids).toContain(poolXId)
    expect(ids).not.toContain(poolYId)
  })
})
