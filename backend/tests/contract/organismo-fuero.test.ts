// T006 (006-backend-endpoints-faltantes, US2): GET /api/organismos/:orgId/fuero
// no existía — hallazgo verificado en 005-frontend-cliente.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, hacerAdmin, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-organismo-fuero'
const pool = getPgPool()

describe('Contrato: fuero de un organismo (solo lectura)', () => {
  let app: FastifyInstance
  let cookieAdmin: string
  let orgConFueroId: number
  let orgSinFueroId: number

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-admin@example.observatorio.test`)
    await hacerAdmin(pool, admin.usuarioId)
    cookieAdmin = admin.cookie

    const { rows: conFuero } = await pool.query<{ id: number }>(
      `SELECT o.id FROM organismos o
         JOIN organismo_fueros ofu ON ofu.organismo_id = o.id
        WHERE o.estado_fueros = 'cargado'
        LIMIT 1`,
    )
    orgConFueroId = conFuero[0]!.id

    // organismo nuevo, propio del admin, sin ningún fuero asignado
    const creado = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieAdmin },
      payload: { denominacion: `${PREFIJO} org`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 },
    })
    orgSinFueroId = creado.json().id
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('GET fuero de un organismo real con fueros cargados trae detalle + simplificado (FR-003)', async () => {
    const { rows: esperado } = await pool.query<{ fuero_simplificado: string | null }>(
      'SELECT fuero_simplificado FROM vista_fuero_simplificado WHERE organismo_id = $1',
      [orgConFueroId],
    )
    const { rows: esperadoDetalle } = await pool.query<{ id: number }>(
      'SELECT fuero_id AS id FROM organismo_fueros WHERE organismo_id = $1 ORDER BY fuero_id',
      [orgConFueroId],
    )

    const res = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgConFueroId}/fuero`,
      headers: { cookie: cookieAdmin },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { fueros: { id: number; nombre: string }[]; fueroSimplificado: string | null }
    expect(body.fueroSimplificado).toBe(esperado[0]!.fuero_simplificado)
    expect(body.fueros.map((f) => f.id).sort()).toEqual(esperadoDetalle.map((f) => f.id).sort())
    expect(body.fueros.length).toBeGreaterThan(0)
  })

  it('GET fuero de un organismo real sin ningún fuero asignado da 200 con listas vacías (FR-004)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgSinFueroId}/fuero`,
      headers: { cookie: cookieAdmin },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ fueros: [], fueroSimplificado: null })
  })

  it('GET fuero de un :orgId inexistente da 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/organismos/999999999/fuero',
      headers: { cookie: cookieAdmin },
    })
    expect(res.statusCode).toBe(404)
  })

  it('GET fuero sin ser dueño/editor/admin da 403', async () => {
    const otro = await crearUsuarioDePrueba(app, `${PREFIJO}-otro@example.observatorio.test`)
    const res = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgSinFueroId}/fuero`,
      headers: { cookie: otro.cookie },
    })
    expect(res.statusCode).toBe(403)
  })
})

// T002 (011, US1): PUT — reemplazo completo del listado (contracts/api.md).
describe('Contrato: PUT /api/organismos/:orgId/fuero (011, US1)', () => {
  let app: FastifyInstance
  let cookieAdmin: string
  let orgId: number
  let penal: number
  let civil: number

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-put-admin@example.observatorio.test`)
    await hacerAdmin(pool, admin.usuarioId)
    cookieAdmin = admin.cookie

    const { rows: f } = await pool.query<{ id: number; nombre: string }>('SELECT id, nombre FROM fueros WHERE nombre IN ($1,$2)', [
      'penal',
      'civil',
    ])
    penal = f.find((x) => x.nombre === 'penal')!.id
    civil = f.find((x) => x.nombre === 'civil')!.id
  })
  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  async function crearOrg(sufijo: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieAdmin },
      payload: { denominacion: `${PREFIJO} put ${sufijo}`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 },
    })
    return res.json().id as number
  }
  function put(id: number, fueroIds: number[], cookie = cookieAdmin) {
    return app.inject({ method: 'PUT', url: `/api/organismos/${id}/fuero`, headers: { cookie }, payload: { fueroIds } })
  }
  const estadoFueros = (id: number) => pool.query<{ estado_fueros: string }>('SELECT estado_fueros FROM organismos WHERE id = $1', [id])

  it('un solo fuero: 200, fueroSimplificado = su nombre, estado_fueros pasa a cargado', async () => {
    orgId = await crearOrg('uno')
    const res = await put(orgId, [penal])
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ fueros: [{ id: penal, nombre: 'penal' }], fueroSimplificado: 'penal' })
    expect((await estadoFueros(orgId)).rows[0]!.estado_fueros).toBe('cargado')
  })

  it('más de uno: 200, fueroSimplificado = "multifuero"', async () => {
    const id = await crearOrg('multi')
    const res = await put(id, [penal, civil])
    expect(res.statusCode).toBe(200)
    expect(res.json().fueroSimplificado).toBe('multifuero')
    expect(res.json().fueros.map((f: { id: number }) => f.id).sort()).toEqual([civil, penal].sort())
    expect((await estadoFueros(id)).rows[0]!.estado_fueros).toBe('cargado')
  })

  it('vaciar el listado: 200, sin fuero asignado, estado_fueros vuelve a sin_fueros_asignados', async () => {
    const id = await crearOrg('vaciar')
    await put(id, [penal, civil])
    const res = await put(id, [])
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ fueros: [], fueroSimplificado: null })
    expect((await estadoFueros(id)).rows[0]!.estado_fueros).toBe('sin_fueros_asignados')
  })

  it('un fueroId inexistente: 400, no escribe nada', async () => {
    const id = await crearOrg('inexistente')
    const antes = await pool.query('SELECT count(*) FROM organismo_fueros WHERE organismo_id = $1', [id])
    const res = await put(id, [999999])
    expect(res.statusCode).toBe(400)
    const despues = await pool.query('SELECT count(*) FROM organismo_fueros WHERE organismo_id = $1', [id])
    expect(despues.rows[0]).toEqual(antes.rows[0])
  })

  it('sin sesión da 401; sin ser dueño/editor/admin da 403', async () => {
    const id = await crearOrg('auth')
    expect((await app.inject({ method: 'PUT', url: `/api/organismos/${id}/fuero`, payload: { fueroIds: [penal] } })).statusCode).toBe(401)
    const otro = await crearUsuarioDePrueba(app, `${PREFIJO}-put-otro@example.observatorio.test`)
    expect((await put(id, [penal], otro.cookie)).statusCode).toBe(403)
  })

  it('organismo inexistente da 404', async () => {
    expect((await put(999999999, [penal])).statusCode).toBe(404)
  })
})

// T008 (011, US2): no permitir que un fuero en uso desaparezca en silencio.
describe('Contrato: PUT /api/organismos/:orgId/fuero — bloqueo por fuero en uso (011, US2)', () => {
  let app: FastifyInstance
  let cookieAdmin: string
  let orgId: number
  let asignacionId: number
  let penal: number
  let civil: number
  let localidadId: number

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-us2-admin@example.observatorio.test`)
    await hacerAdmin(pool, admin.usuarioId)
    cookieAdmin = admin.cookie

    const { rows: f } = await pool.query<{ id: number; nombre: string }>('SELECT id, nombre FROM fueros WHERE nombre IN ($1,$2)', [
      'penal',
      'civil',
    ])
    penal = f.find((x) => x.nombre === 'penal')!.id
    civil = f.find((x) => x.nombre === 'civil')!.id
    localidadId = (await pool.query<{ id: number }>('SELECT id FROM localidades WHERE provincia_id = 1 ORDER BY id LIMIT 1')).rows[0]!.id

    const org = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieAdmin },
      payload: { denominacion: `${PREFIJO} us2 org`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 },
    })
    orgId = org.json().id
    await app.inject({ method: 'PUT', url: `/api/organismos/${orgId}/fuero`, headers: { cookie: cookieAdmin }, payload: { fueroIds: [penal, civil] } })

    const uf = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/unidades-funcionales`,
      headers: { cookie: cookieAdmin },
      payload: { denominacionUnidad: `${PREFIJO} us2 uf`, localidadId, tipoUfId: 1 },
    })
    const ufId = uf.json().id

    const grupo = await app.inject({
      method: 'POST',
      url: '/api/pools-jueces',
      headers: { cookie: cookieAdmin },
      payload: { provinciaId: 1, descripcion: `${PREFIJO} us2 pool`, totalJueces: 3 },
    })
    const grupoId = grupo.json().id

    const asignacion = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`,
      headers: { cookie: cookieAdmin },
      payload: { grupoJuecesId: grupoId, cantidadAsignada: 2 },
    })
    asignacionId = asignacion.json().id

    // Acotar esa asignación al fuero "civil" — sin endpoint propio todavía (no forma parte de esta
    // feature): se inserta directo, mismo criterio que otros tests de este proyecto para datos que
    // no tienen (todavía) un camino de escritura por API.
    await pool.query('INSERT INTO asignacion_fueros (asignacion_id, fuero_id) VALUES ($1, $2)', [asignacionId, civil])
  })
  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('quitar el fuero en uso se rechaza: 400 con fuerosEnUso, nada cambia', async () => {
    const antes = await pool.query('SELECT fuero_id FROM organismo_fueros WHERE organismo_id = $1 ORDER BY fuero_id', [orgId])
    const res = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgId}/fuero`,
      headers: { cookie: cookieAdmin },
      payload: { fueroIds: [penal] }, // saca "civil", que la asignación usa
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().fuerosEnUso).toEqual([{ id: civil, nombre: 'civil' }])
    expect(res.json().error).toContain('civil')
    const despues = await pool.query('SELECT fuero_id FROM organismo_fueros WHERE organismo_id = $1 ORDER BY fuero_id', [orgId])
    expect(despues.rows).toEqual(antes.rows)
  })

  it('liberada la asignación, ahora sí se puede quitar el fuero', async () => {
    await pool.query('DELETE FROM asignacion_fueros WHERE asignacion_id = $1 AND fuero_id = $2', [asignacionId, civil])
    const res = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgId}/fuero`,
      headers: { cookie: cookieAdmin },
      payload: { fueroIds: [penal] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ fueros: [{ id: penal, nombre: 'penal' }], fueroSimplificado: 'penal' })
  })
})
