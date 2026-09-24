// T004 (006-backend-endpoints-faltantes, US1): los 5 catálogos de
// referencia no tenían ningún endpoint — hallazgo verificado en
// 005-frontend-cliente. Lectura para cualquier autenticado, sin relación
// con ningún organismo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { getPgPool } from '../../src/db/pool.js'
import { crearUsuarioDePrueba, limpiarUsuariosDePrueba } from '../helpers/db.js'

const PREFIJO = 'test-contract-catalogos'
const pool = getPgPool()

describe('Contrato: catálogos de referencia', () => {
  let app: FastifyInstance
  let cookie: string

  beforeAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    app = await buildApp()
    const u = await crearUsuarioDePrueba(app, `${PREFIJO}@example.observatorio.test`)
    cookie = u.cookie
  })

  afterAll(async () => {
    await limpiarUsuariosDePrueba(pool, PREFIJO)
    await app.close()
  })

  const catalogos: { ruta: string; tabla: string }[] = [
    { ruta: '/api/provincias', tabla: 'provincias' },
    { ruta: '/api/denominaciones-simplificadas', tabla: 'denominaciones_simplificadas' },
    { ruta: '/api/tipos-oficina', tabla: 'tipos_oficina' },
    { ruta: '/api/tipos-uf', tabla: 'tipos_uf' },
    { ruta: '/api/fueros', tabla: 'fueros' },
  ]

  for (const { ruta, tabla } of catalogos) {
    it(`GET ${ruta} devuelve la lista completa real de ${tabla} (FR-001)`, async () => {
      const { rows } = await pool.query<{ count: string }>(`SELECT count(*) FROM ${tabla}`)
      const esperado = Number(rows[0]!.count)

      const res = await app.inject({ method: 'GET', url: ruta, headers: { cookie } })
      expect(res.statusCode).toBe(200)
      const body = res.json() as unknown[]
      expect(body).toHaveLength(esperado)
    })

    it(`GET ${ruta} sin sesión da 401`, async () => {
      const res = await app.inject({ method: 'GET', url: ruta })
      expect(res.statusCode).toBe(401)
    })
  }
})
