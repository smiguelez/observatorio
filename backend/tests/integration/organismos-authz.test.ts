// T026 (US2): acceso cruzado a organismo ajeno rechazado (SC-002); UF de un
// organismo ajeno rechazada aunque el caller sea propietario de OTRO
// organismo (Edge Case de spec.md: "no hay excepción porque ya es
// propietario de algo"); admin sí puede sobre cualquier organismo (matriz
// de contracts/api.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, hacerAdmin, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-organismos-authz'
const pool = getPgPool()

const BODY_ORGANISMO = {
  denominacion: 'Organismo authz',
  denominacionSimplificadaId: 1,
  tipoOficinaId: 1,
  provinciaId: 1,
}

describe('Autorización cruzada de organismos (SC-002) y herencia en UF (FR-014)', () => {
  let app: FastifyInstance
  let cookieA: string
  let cookieB: string
  let cookieC: string
  let cookieAdmin: string
  let organismoAId: string
  let organismoCId: string
  let localidadId: number
  let tipoUfId: number

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()

    // No asumir que id=1 existe en catálogos ya migrados (localidades no
    // arranca en 1 en esta base) — se consulta un id real.
    const localidad = await pool.query<{ id: number }>('SELECT id FROM localidades ORDER BY id LIMIT 1')
    localidadId = localidad.rows[0]!.id
    const tipoUf = await pool.query<{ id: number }>('SELECT id FROM tipos_uf ORDER BY id LIMIT 1')
    tipoUfId = tipoUf.rows[0]!.id

    const a = await crearUsuarioDePrueba(app, `${PREFIJO}-a@example.observatorio.test`)
    const b = await crearUsuarioDePrueba(app, `${PREFIJO}-b@example.observatorio.test`)
    const c = await crearUsuarioDePrueba(app, `${PREFIJO}-c@example.observatorio.test`)
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-admin@example.observatorio.test`)
    await hacerAdmin(pool, admin.usuarioId)

    cookieA = a.cookie
    cookieB = b.cookie
    cookieC = c.cookie
    cookieAdmin = admin.cookie

    const orgA = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieA },
      payload: BODY_ORGANISMO,
    })
    organismoAId = orgA.json().id

    // C es propietario de un organismo PROPIO distinto — el edge case exige
    // que eso no le dé ningún privilegio sobre el organismo de A.
    const orgC = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieC },
      payload: { ...BODY_ORGANISMO, denominacion: 'Organismo de C' },
    })
    organismoCId = orgC.json().id
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('B (sin relación) no puede leer, editar ni borrar el organismo de A', async () => {
    const get = await app.inject({ method: 'GET', url: `/api/organismos/${organismoAId}`, headers: { cookie: cookieB } })
    expect(get.statusCode).toBe(403)

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/organismos/${organismoAId}`,
      headers: { cookie: cookieB },
      payload: { denominacion: 'Hackeado' },
    })
    expect(patch.statusCode).toBe(403)

    const del = await app.inject({ method: 'DELETE', url: `/api/organismos/${organismoAId}`, headers: { cookie: cookieB } })
    expect(del.statusCode).toBe(403)
  })

  it('Edge case: C, propietario de OTRO organismo, no puede crear una UF bajo el organismo de A', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/organismos/${organismoAId}/unidades-funcionales`,
      headers: { cookie: cookieC },
      payload: { denominacionUnidad: 'UF intrusa', localidadId, tipoUfId },
    })
    expect(res.statusCode).toBe(403)

    // Confirmación negativa: C SÍ puede crear una UF bajo SU PROPIO organismo
    // — para dejar claro que el 403 de arriba es por el organismo, no un
    // bloqueo general de C para crear UFs.
    const resPropio = await app.inject({
      method: 'POST',
      url: `/api/organismos/${organismoCId}/unidades-funcionales`,
      headers: { cookie: cookieC },
      payload: { denominacionUnidad: 'UF legítima de C', localidadId, tipoUfId },
    })
    expect(resPropio.statusCode).toBe(201)
  })

  it('Un admin SÍ puede leer, editar y borrar el organismo de A', async () => {
    const get = await app.inject({ method: 'GET', url: `/api/organismos/${organismoAId}`, headers: { cookie: cookieAdmin } })
    expect(get.statusCode).toBe(200)

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/organismos/${organismoAId}`,
      headers: { cookie: cookieAdmin },
      payload: { denominacion: 'Editado por admin' },
    })
    expect(patch.statusCode).toBe(200)

    const del = await app.inject({ method: 'DELETE', url: `/api/organismos/${organismoAId}`, headers: { cookie: cookieAdmin } })
    expect(del.statusCode).toBe(204)
  })
})
