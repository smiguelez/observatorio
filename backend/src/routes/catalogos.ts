// T002 (006-backend-endpoints-faltantes, US1): catálogos de referencia —
// FR-001 (lectura para cualquier autenticado, sin chequeo adicional,
// mismo criterio que localidades.ts) y FR-002 (0 rutas de escritura).
import type { FastifyInstance } from 'fastify'
import { getPgPool } from '../db/pool.js'

export async function registrarRutasCatalogos(app: FastifyInstance) {
  const pool = getPgPool()

  app.get('/api/provincias', async () => {
    const { rows } = await pool.query('SELECT id, nombre FROM provincias ORDER BY id')
    return rows
  })

  app.get('/api/denominaciones-simplificadas', async () => {
    const { rows } = await pool.query('SELECT id, nombre FROM denominaciones_simplificadas ORDER BY id')
    return rows
  })

  app.get('/api/tipos-oficina', async () => {
    const { rows } = await pool.query('SELECT id, nombre FROM tipos_oficina ORDER BY id')
    return rows
  })

  app.get('/api/tipos-uf', async () => {
    const { rows } = await pool.query('SELECT id, nombre FROM tipos_uf ORDER BY id')
    return rows
  })

  app.get('/api/fueros', async () => {
    const { rows } = await pool.query('SELECT id, nombre FROM fueros ORDER BY id')
    return rows
  })
}
