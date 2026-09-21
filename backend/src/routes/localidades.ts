// T036 (US5): catálogo de localidades — FR-018 (lectura para cualquier
// autenticado, sin chequeo de autorización adicional, igual que usuarios/
// FR-017) y FR-019 (0 rutas de escritura). No hay POST/PATCH/DELETE acá a
// propósito: no es una restricción de rol que rechace con 403, es que la
// operación no existe en este servicio — el mantenimiento de localidades es
// un proceso separado, fuera de esta API (spec.md).
import type { FastifyInstance } from 'fastify'
import { getPgPool } from '../db/pool.js'

function idParam(request: { params: unknown }): number {
  return Number((request.params as Record<string, string>).id)
}

export async function registrarRutasLocalidades(app: FastifyInstance) {
  const pool = getPgPool()

  app.get('/api/localidades', async () => {
    const { rows } = await pool.query(
      'SELECT id, nombre, provincia_id, latitud, longitud FROM localidades ORDER BY id',
    )
    return rows
  })

  app.get('/api/localidades/:id', async (request, reply) => {
    const id = idParam(request)
    const { rows } = await pool.query(
      'SELECT id, nombre, provincia_id, latitud, longitud FROM localidades WHERE id = $1',
      [id],
    )
    if (rows.length === 0) return reply.code(404).send({ error: 'No encontrado' })
    return rows[0]
  })
}
