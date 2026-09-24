// T014 (006-backend-endpoints-faltantes, US4): CRUD de editores no
// existía — hallazgo verificado en 005-frontend-cliente. Autorización
// distinta del resto de las subrutas de organismo (FR-013): solo
// propietario o admin, un editor no puede gestionar otros editores.
// Cubre también los rechazos de integridad de esRechazoDeIntegridad
// (editor duplicado, usuario inexistente) — mismo criterio que US3.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-organismo-editores'
const pool = getPgPool()

describe('Contrato: editores de un organismo', () => {
  let app: FastifyInstance
  let cookiePropietario: string
  let cookieEditor: string
  let usuarioEditorId: string
  let orgId: number

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const propietario = await crearUsuarioDePrueba(app, `${PREFIJO}-propietario@example.observatorio.test`)
    cookiePropietario = propietario.cookie
    const editor = await crearUsuarioDePrueba(app, `${PREFIJO}-editor@example.observatorio.test`)
    cookieEditor = editor.cookie
    usuarioEditorId = editor.usuarioId

    const org = await app.inject({
      method: 'POST',
      url: '/api/organismos',
      headers: { cookie: cookiePropietario },
      payload: { denominacion: `${PREFIJO} org`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 },
    })
    orgId = org.json().id
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  it('el organismo recién creado no es visible para el futuro editor (control, antes de agregarlo)', async () => {
    const lista = await app.inject({ method: 'GET', url: '/api/organismos', headers: { cookie: cookieEditor } })
    expect((lista.json() as { id: number }[]).map((o) => o.id)).not.toContain(orgId)
  })

  it('POST agrega un editor (propietario) — aparece en GET editores y en la lista del usuario agregado (FR-012/FR-013)', async () => {
    const post = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/editores`,
      headers: { cookie: cookiePropietario },
      payload: { usuarioId: Number(usuarioEditorId) },
    })
    expect(post.statusCode).toBe(201)

    const get = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}/editores`,
      headers: { cookie: cookiePropietario },
    })
    expect(get.json()).toEqual([
      expect.objectContaining({ usuarioId: usuarioEditorId, email: `${PREFIJO}-editor@example.observatorio.test` }),
    ])

    const listaDelEditor = await app.inject({
      method: 'GET',
      url: '/api/organismos',
      headers: { cookie: cookieEditor },
    })
    expect((listaDelEditor.json() as { id: number }[]).map((o) => o.id)).toContain(orgId)
  })

  it('RECHAZO — editor duplicado (UNIQUE, PK): agregar el mismo editor de nuevo da 400 identificable, no 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/editores`,
      headers: { cookie: cookiePropietario },
      payload: { usuarioId: Number(usuarioEditorId) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Ese usuario ya es editor de este organismo.' })
  })

  it('RECHAZO — usuario inexistente (FK): agregar un usuarioId inexistente da 400 identificable, no 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/editores`,
      headers: { cookie: cookiePropietario },
      payload: { usuarioId: 999999999 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'El usuario indicado no existe.' })
  })

  it('un editor (no propietario) NO puede agregar a otro editor — 403 (FR-013)', async () => {
    const tercero = await crearUsuarioDePrueba(app, `${PREFIJO}-tercero@example.observatorio.test`)
    const res = await app.inject({
      method: 'POST',
      url: `/api/organismos/${orgId}/editores`,
      headers: { cookie: cookieEditor },
      payload: { usuarioId: Number(tercero.usuarioId) },
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELETE quita un editor (propietario) — pierde el acceso al organismo', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/organismos/${orgId}/editores/${usuarioEditorId}`,
      headers: { cookie: cookiePropietario },
    })
    expect(del.statusCode).toBe(204)

    const listaDelExEditor = await app.inject({
      method: 'GET',
      url: '/api/organismos',
      headers: { cookie: cookieEditor },
    })
    expect((listaDelExEditor.json() as { id: number }[]).map((o) => o.id)).not.toContain(orgId)

    const getOrganismoDirecto = await app.inject({
      method: 'GET',
      url: `/api/organismos/${orgId}`,
      headers: { cookie: cookieEditor },
    })
    expect(getOrganismoDirecto.statusCode).toBe(403)
  })
})
