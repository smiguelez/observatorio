// T017 (US5, 004-fix-taxonomia-endpoint): Protección B — PATCH
// /api/organismos/:id avisa y exige confirmación antes de perder
// respuestas de taxonomía por un cambio de tipo. Caso que la originó:
// organismo id=311 ("OGA MEDIACIÓN"), que quedó con taxonomía huérfana
// por un cambio de tipo sin ningún aviso (hipótesis de Santi, ver
// specs/003-taxonomia-parametrizable/spec.md, Edge Cases) — esta feature
// no lo corrige retroactivamente, pero impide que vuelva a pasar sin que
// nadie lo note.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, hacerAdmin, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-organismos-cambio-tipo'
const pool = getPgPool()

describe('Protección B: aviso + confirmación al cambiar el tipo de un organismo', () => {
  let app: FastifyInstance
  let cookieAdmin: string

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const admin = await crearUsuarioDePrueba(app, `${PREFIJO}-admin@example.observatorio.test`)
    await hacerAdmin(pool, admin.usuarioId)
    cookieAdmin = admin.cookie
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  async function crearOrganismo(tipoOficinaId: number) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookieAdmin },
      payload: { denominacion: `${PREFIJO} org`, denominacionSimplificadaId: 1, tipoOficinaId, provinciaId: 1 },
    })
    return res.json().id as number
  }

  it('PATCH sin confirmación sobre un organismo con respuestas huérfanas — 400 con el listado, tipo sin cambiar (FR-018/FR-019)', async () => {
    const orgId = await crearOrganismo(1) // oficina judicial — 'autonomia' aplica
    const put = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgId}/taxonomia`,
      headers: { cookie: cookieAdmin },
      payload: { respuestas: [{ preguntaCodigo: 'autonomia', opcionesCodigos: ['A'] }] },
    })
    expect(put.statusCode).toBe(200)

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/organismos/${orgId}`,
      headers: { cookie: cookieAdmin },
      payload: { tipoOficinaId: 4 }, // unidad operativa — 'autonomia' NO aplica
    })
    expect(patch.statusCode).toBe(400)
    const body = patch.json() as { error: string; preguntasQueSePerderian: { codigo: string; texto: string }[] }
    expect(body.preguntasQueSePerderian.map((p) => p.codigo)).toEqual(['autonomia'])

    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}`,
      headers: { cookie: cookieAdmin },
    })
    expect(get.json().tipo_oficina_id).toBe(1)
  })

  it('PATCH con confirmación — 200, tipo cambiado, respuestas huérfanas eliminadas, el resto intacto (FR-020)', async () => {
    const orgId = await crearOrganismo(1)
    const put = await app.inject({
      method: 'PUT',
      url: `/api/organismos/${orgId}/taxonomia`,
      headers: { cookie: cookieAdmin },
      payload: {
        respuestas: [
          { preguntaCodigo: 'autonomia', opcionesCodigos: ['A'] },
          { preguntaCodigo: 'jerarquia_normativa', opcionesCodigos: ['B'] },
        ],
      },
    })
    expect(put.statusCode).toBe(200)

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/organismos/${orgId}`,
      headers: { cookie: cookieAdmin },
      payload: { tipoOficinaId: 4, confirmarPerdidaTaxonomia: true },
    })
    expect(patch.statusCode).toBe(200)

    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}`,
      headers: { cookie: cookieAdmin },
    })
    expect(get.json().tipo_oficina_id).toBe(4)

    const getTaxonomia = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}/taxonomia`,
      headers: { cookie: cookieAdmin },
    })
    // 'autonomia' y 'jerarquia_normativa' aplican solo a oficina judicial/
    // especializada — ninguna aplica a unidad operativa (tipo 4): ambas
    // deberían haber sido eliminadas, ninguna otra queda (no había otra).
    expect(getTaxonomia.json()).toEqual([])
  })

  it('PATCH que cambia el tipo de un organismo sin ninguna taxonomía cargada — 200 sin exigir confirmación (FR-021)', async () => {
    const orgId = await crearOrganismo(1)
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/organismos/${orgId}`,
      headers: { cookie: cookieAdmin },
      payload: { tipoOficinaId: 4 },
    })
    expect(patch.statusCode).toBe(200)

    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}`,
      headers: { cookie: cookieAdmin },
    })
    expect(get.json().tipo_oficina_id).toBe(4)
  })
})
