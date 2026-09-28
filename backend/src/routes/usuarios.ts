// T032 (US4): GET /api/usuarios, GET /api/usuarios/:id (FR-017 — lectura
// amplia, sin chequeo de autorización más allá de estar autenticado, que ya
// garantiza el hook global de FR-004) y PATCH /api/usuarios/:id (FR-016 —
// solo el propio usuario o un admin).
import type { FastifyInstance } from 'fastify'
import { Type, type Static } from '@sinclair/typebox'
import { getPgPool } from '../db/pool.js'
import { puedeEditarUsuario } from '../authz/usuarios.js'
import { esAdmin } from '../authz/rules.js'
import { actualizarUsuario, cambiarRol, provisionarUsuario } from '../services/usuarios.js'
import { emitirAccesoInicial, obtenerAccesoInicialVigente } from '../auth/acceso-inicial.js'
import { loadOrigenFrontend } from '../config/env.js'
import { enviarEmail } from '../email/resend.js'
import { plantillaAccesoInicial } from '../email/plantillas.js'

const ActualizarUsuarioBody = Type.Partial(
  Type.Object({
    nombreDisplay: Type.String(),
    provinciaId: Type.Integer(),
    fotoUrl: Type.String(),
  }),
)
type ActualizarUsuarioBody = Static<typeof ActualizarUsuarioBody>

// ids bigint viajan como string numérico (D13/D17); un id mal formado es 400, no 500.
const ParamsId = Type.Object({ id: Type.String({ pattern: '^[0-9]{1,18}$' }) })

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

      return actualizarUsuario(pool, id, esAdmin(request.identidad!), request.body)
    },
  )

  // 007 (US3, FR-012..FR-015): otorgar o quitar el rol admin. Solo admin. El rol se valida en el servicio
  // (400 con { error }) y no en el esquema, para responder el cuerpo del contrato.
  app.put<{ Params: { id: string }; Body: { rol: string } }>(
    '/api/usuarios/:id/rol',
    { schema: { params: ParamsId, body: Type.Object({ rol: Type.String() }) } },
    async (request, reply) => {
      if (!esAdmin(request.identidad!)) {
        return reply.code(403).send({ error: 'Solo un administrador puede cambiar el rol de un usuario.' })
      }
      return cambiarRol(pool, request.params.id, request.body.rol as 'admin' | 'usuario_normal')
    },
  )

  // 007 (US4, FR-016/FR-019/FR-021): alta administrada. Solo admin. Entrega UNA vez el acceso inicial al
  // administrador (sin correo, Fase C). Usuario + roles + auth.user en una transacción; el acceso se emite
  // después: si esa emisión fallara, el admin puede reemitirlo.
  const AltaBody = Type.Object({
    email: Type.String(),
    rol: Type.String(),
    provinciaId: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
    nombreDisplay: Type.Optional(Type.String()),
  })
  app.post<{ Body: Static<typeof AltaBody> }>('/api/usuarios', { schema: { body: AltaBody } }, async (request, reply) => {
    if (!esAdmin(request.identidad!)) {
      return reply.code(403).send({ error: 'Solo un administrador puede dar de alta usuarios.' })
    }
    const { email, rol, provinciaId, nombreDisplay } = request.body
    const usuario = await provisionarUsuario(pool, { email, rol: rol as 'admin' | 'usuario_normal', provinciaId, nombreDisplay })
    const acceso = await emitirAccesoInicial(pool, usuario.id)
    return reply.code(201).send({ ...usuario, accesoInicial: { token: acceso.token, vence: acceso.vence.toISOString() } })
  })

  // Reemitir: invalida el anterior (FR-019). Para quien perdió su contraseña o su acceso.
  app.post<{ Params: { id: string } }>(
    '/api/usuarios/:id/acceso-inicial',
    { schema: { params: ParamsId } },
    async (request, reply) => {
      if (!esAdmin(request.identidad!)) {
        return reply.code(403).send({ error: 'Solo un administrador puede emitir un acceso inicial.' })
      }
      const acceso = await emitirAccesoInicial(pool, request.params.id)
      return reply.code(201).send({ token: acceso.token, vence: acceso.vence.toISOString() })
    },
  )

  // 010 (US2): envía por email el acceso VIGENTE (el de la alta o la última reemisión) — no genera
  // uno nuevo ni invalida el que ya podría estar circulando (research.md, Decisión 4). El fallo de
  // ENVÍO nunca es un error HTTP (FR-006/007): sigue siendo 200 con `emailEnviado: false`. No
  // loguea nada (el admin ya lo ve en la respuesta, en la misma pantalla que la disparó).
  app.post<{ Params: { id: string } }>(
    '/api/usuarios/:id/acceso-inicial/enviar-email',
    { schema: { params: ParamsId } },
    async (request, reply) => {
      if (!esAdmin(request.identidad!)) {
        return reply.code(403).send({ error: 'Solo un administrador puede enviar un acceso inicial por email.' })
      }
      const usuarioId = request.params.id
      const [acceso, usuario] = await Promise.all([
        obtenerAccesoInicialVigente(pool, usuarioId),
        pool.query<{ email: string }>('SELECT email::text FROM usuarios WHERE id = $1', [usuarioId]),
      ])
      if (!acceso) return reply.code(404).send({ error: 'No hay un acceso inicial vigente para este usuario.' })
      if (usuario.rowCount === 0) return reply.code(404).send({ error: 'No encontrado' })

      const url = `${loadOrigenFrontend()}/primer-acceso#token=${acceso.token}`
      const { subject, html } = plantillaAccesoInicial({ url })
      const resultado = await enviarEmail({ to: usuario.rows[0]!.email, subject, html })
      return reply.code(200).send({ emailEnviado: resultado.ok })
    },
  )
}
