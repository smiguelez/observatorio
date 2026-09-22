// T018 (US1): GET /api/auth/session — devuelve la IdentidadResuelta (T010),
// no el objeto de sesión crudo de Better Auth (ese es
// /api/auth/get-session, manejado por el puente genérico en app.ts). Esta
// ruta es la que consume el resto del backend/frontend para saber
// "usuarios.id, rol y provincia de quien hace esta request" en un shape
// propio, estable, independiente de la forma interna de Better Auth.
import type { FastifyInstance } from 'fastify'
import { getPgPool } from '../db/pool.js'
import { auth } from '../auth/index.js'
import { resolverIdentidad } from '../auth/resolve-identity.js'
import { aHeadersWeb } from '../http/headers.js'

export async function registrarRutasAuth(app: FastifyInstance) {
  app.get('/api/auth/session', async (request, reply) => {
    const identidad = await resolverIdentidad(getPgPool(), auth, aHeadersWeb(request.headers))
    if (!identidad) {
      reply.code(401).send({ error: 'No autenticado' })
      return
    }
    reply.send({
      usuarioId: identidad.usuarioId.toString(),
      rol: identidad.rol,
      provinciaId: identidad.provinciaId,
    })
  })
}
