// 007 (US4, FR-017/FR-022): canje del acceso inicial. Ruta PÚBLICA por diseño (todavía no hay sesión): fija la
// contraseña inicial e inicia sesión. Respuestas uniformes ante token inválido/usado/vencido/reemplazado.
// El token viaja en el cuerpo del POST (nunca en la URL) y no se registra en logs.
import type { FastifyInstance } from 'fastify'
import { Type, type Static } from '@sinclair/typebox'
import { getPgPool } from '../db/pool.js'
import { canjearAccesoInicial } from '../auth/acceso-inicial.js'

const CanjeBody = Type.Object({ token: Type.String({ minLength: 1 }), password: Type.String() })

export async function registrarRutasAccesoInicial(app: FastifyInstance) {
  const pool = getPgPool()
  app.post<{ Body: Static<typeof CanjeBody> }>(
    '/api/acceso-inicial/canjear',
    { schema: { body: CanjeBody } },
    async (request, reply) => {
      const canje = await canjearAccesoInicial(pool, request.body.token, request.body.password)
      reply.header('set-cookie', canje.setCookie)
      return { usuarioId: canje.usuarioId }
    },
  )
}
