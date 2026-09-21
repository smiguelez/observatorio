// T028 (US3): CRUD de grupos de jueces (pools) — FR-015. Sin owner/editor:
// la autorización es SIEMPRE por coincidencia de provincia (o admin), tanto
// para operar sobre un pool existente como para crear uno nuevo (el body
// del POST declara la provincia; si no coincide con la del usuario y el
// usuario no es admin, se rechaza — no se "fuerza" un valor como en
// organismos, se VALIDA el que trae el body, porque acá el usuario sí
// elige la provincia dentro de lo que le está permitido).
import type { FastifyInstance } from 'fastify'
import { Type, type Static } from '@sinclair/typebox'
import { getPgPool } from '../db/pool.js'
import { buscarPoolParaAutorizar, estaAutorizadoParaProvincia, puedeGestionarPool } from '../authz/pools-jueces.js'

const CrearPoolBody = Type.Object({
  provinciaId: Type.Integer(),
  descripcion: Type.Optional(Type.String()),
  totalJueces: Type.Integer({ minimum: 0 }),
})
type CrearPoolBody = Static<typeof CrearPoolBody>

const ActualizarPoolBody = Type.Partial(
  Type.Object({
    descripcion: Type.String(),
    totalJueces: Type.Integer({ minimum: 0 }),
  }),
)
type ActualizarPoolBody = Static<typeof ActualizarPoolBody>

function idParam(request: { params: unknown }): number {
  return Number((request.params as Record<string, string>).id)
}

export async function registrarRutasPoolsJueces(app: FastifyInstance) {
  const pool = getPgPool()

  app.get('/api/pools-jueces', async (request) => {
    const identidad = request.identidad!
    if (identidad.rol === 'admin') {
      const { rows } = await pool.query('SELECT id, descripcion, total_jueces, provincia_id FROM grupos_jueces ORDER BY id')
      return rows
    }
    const { rows } = await pool.query(
      'SELECT id, descripcion, total_jueces, provincia_id FROM grupos_jueces WHERE provincia_id = $1 ORDER BY id',
      [identidad.provinciaId],
    )
    return rows
  })

  app.post<{ Body: CrearPoolBody }>(
    '/api/pools-jueces',
    { schema: { body: CrearPoolBody } },
    async (request, reply) => {
      const identidad = request.identidad!
      const { provinciaId, descripcion, totalJueces } = request.body

      // FR-015: la provincia del BODY debe coincidir con la del usuario, o
      // el usuario debe ser admin — nunca se fuerza silenciosamente un
      // valor (a diferencia de propietario_id en organismos), se rechaza.
      if (!estaAutorizadoParaProvincia(identidad, provinciaId)) {
        return reply.code(403).send({ error: 'No autorizado para crear un pool en esa provincia' })
      }

      const { rows } = await pool.query(
        `INSERT INTO grupos_jueces (descripcion, total_jueces, provincia_id, firestore_id)
         VALUES ($1, $2, $3, NULL)
         RETURNING id, descripcion, total_jueces, provincia_id`,
        [descripcion ?? null, totalJueces, provinciaId],
      )
      reply.code(201)
      return rows[0]
    },
  )

  app.get('/api/pools-jueces/:id', async (request, reply) => {
    const id = idParam(request)
    const poolRow = await buscarPoolParaAutorizar(pool, id)
    if (!poolRow) return reply.code(404).send({ error: 'No encontrado' })
    if (!puedeGestionarPool(request.identidad!, poolRow)) {
      return reply.code(403).send({ error: 'No autorizado' })
    }
    const { rows } = await pool.query('SELECT * FROM grupos_jueces WHERE id = $1', [id])
    return rows[0]
  })

  app.patch<{ Body: ActualizarPoolBody }>(
    '/api/pools-jueces/:id',
    { schema: { body: ActualizarPoolBody } },
    async (request, reply) => {
      const id = idParam(request)
      const poolRow = await buscarPoolParaAutorizar(pool, id)
      if (!poolRow) return reply.code(404).send({ error: 'No encontrado' })
      if (!puedeGestionarPool(request.identidad!, poolRow)) {
        return reply.code(403).send({ error: 'No autorizado' })
      }

      const { descripcion, totalJueces } = request.body
      const { rows } = await pool.query(
        `UPDATE grupos_jueces SET
           descripcion = COALESCE($2, descripcion),
           total_jueces = COALESCE($3, total_jueces)
         WHERE id = $1
         RETURNING id, descripcion, total_jueces, provincia_id`,
        [id, descripcion ?? null, totalJueces ?? null],
      )
      return rows[0]
    },
  )

  app.delete('/api/pools-jueces/:id', async (request, reply) => {
    const id = idParam(request)
    const poolRow = await buscarPoolParaAutorizar(pool, id)
    if (!poolRow) return reply.code(404).send({ error: 'No encontrado' })
    if (!puedeGestionarPool(request.identidad!, poolRow)) {
      return reply.code(403).send({ error: 'No autorizado' })
    }
    await pool.query('DELETE FROM grupos_jueces WHERE id = $1', [id])
    reply.code(204)
  })
}
