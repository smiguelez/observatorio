// T032 (US4): GET /api/usuarios, GET /api/usuarios/:id (FR-017 — lectura
// amplia, sin chequeo de autorización más allá de estar autenticado, que ya
// garantiza el hook global de FR-004) y PATCH /api/usuarios/:id (FR-016 —
// solo el propio usuario o un admin).
import type { FastifyInstance } from 'fastify'
import { Type, type Static } from '@sinclair/typebox'
import { getPgPool } from '../db/pool.js'
import { puedeEditarUsuario } from '../authz/usuarios.js'

const ActualizarUsuarioBody = Type.Partial(
  Type.Object({
    nombreDisplay: Type.String(),
    provinciaId: Type.Integer(),
    fotoUrl: Type.String(),
  }),
)
type ActualizarUsuarioBody = Static<typeof ActualizarUsuarioBody>

function idParam(request: { params: unknown }): bigint {
  return BigInt((request.params as Record<string, string>).id!)
}

export async function registrarRutasUsuarios(app: FastifyInstance) {
  const pool = getPgPool()

  // FR-017: cualquier autenticado, perfil completo — visibilidad amplia
  // confirmada explícitamente en spec.md (Clarifications). No hay `WHERE`
  // que acote por identidad del caller: es intencional, no un descuido.
  app.get('/api/usuarios', async () => {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.nombre_display, u.provincia_id,
              array_agg(r.nombre) FILTER (WHERE r.nombre IS NOT NULL) AS roles
         FROM usuarios u
         LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
         LEFT JOIN roles r ON r.id = ur.rol_id
        GROUP BY u.id
        ORDER BY u.id`,
    )
    return rows
  })

  app.get('/api/usuarios/:id', async (request, reply) => {
    const id = idParam(request)
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.nombre_display, u.email_verificado, u.foto_url, u.provincia_id,
              array_agg(r.nombre) FILTER (WHERE r.nombre IS NOT NULL) AS roles
         FROM usuarios u
         LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
         LEFT JOIN roles r ON r.id = ur.rol_id
        WHERE u.id = $1
        GROUP BY u.id`,
      [id],
    )
    if (rows.length === 0) return reply.code(404).send({ error: 'No encontrado' })
    return rows[0]
  })

  // FR-016: solo el propio usuario o un admin — a diferencia de la lectura,
  // acá SÍ hay un chequeo de autorización explícito.
  app.patch<{ Body: ActualizarUsuarioBody }>(
    '/api/usuarios/:id',
    { schema: { body: ActualizarUsuarioBody } },
    async (request, reply) => {
      const id = idParam(request)
      if (!puedeEditarUsuario(request.identidad!, id)) {
        return reply.code(403).send({ error: 'No autorizado' })
      }

      const existe = await pool.query('SELECT 1 FROM usuarios WHERE id = $1', [id])
      if (existe.rows.length === 0) return reply.code(404).send({ error: 'No encontrado' })

      const { nombreDisplay, provinciaId, fotoUrl } = request.body
      const { rows } = await pool.query(
        `UPDATE usuarios SET
           nombre_display = COALESCE($2, nombre_display),
           provincia_id = COALESCE($3, provincia_id),
           foto_url = COALESCE($4, foto_url)
         WHERE id = $1
         RETURNING id, email, nombre_display, provincia_id, foto_url`,
        [id, nombreDisplay ?? null, provinciaId ?? null, fotoUrl ?? null],
      )
      return rows[0]
    },
  )
}
