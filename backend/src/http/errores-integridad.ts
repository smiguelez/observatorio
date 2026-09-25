// 007: manejador central de errores (D16, FR-023..FR-025, Decisión 7).
//  - `ErrorNegocio`: rechazos de reglas de dominio con mensaje claro y código HTTP propio.
//  - Errores de Postgres causados por datos del cliente (clase 23 integridad, clase 22 datos fuera de rango,
//    P0001 = RAISE EXCEPTION de los triggers) → 400 con un mensaje del mapa por constraint, o genérico por tipo.
//    Nunca se filtran nombres de tablas, columnas ni constraints.
//  - Todo lo demás (fallas reales) sigue siendo 500, registrado, sin exponer el mensaje interno.
import type { FastifyInstance } from 'fastify'

export class ErrorNegocio extends Error {
  constructor(
    public readonly statusCode: 400 | 403 | 404 | 409,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ErrorNegocio'
  }
}

const MENSAJE_POOL_EN_USO = 'El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes de eliminarlo.'

// Mapa por constraint (pg lo expone en `err.constraint`). Si el valor es un objeto, distingue por método HTTP:
// 23503 es el mismo código al insertar un hijo con padre inexistente que al borrar un padre referenciado, y el
// texto de `detail` de Postgres depende de `lc_messages`; el método es la señal estable (Decisión 7).
type Mensaje = string | { DELETE: string; otro: string }
const MENSAJES_POR_CONSTRAINT: Record<string, Mensaje> = {
  unidad_funcional_grupo_jueces_grupo_jueces_id_fkey: { DELETE: MENSAJE_POOL_EN_USO, otro: 'El pool de jueces indicado no existe.' },
  unidad_funcional_grupo_jueces_unidad_funcional_id_grupo_jue_key: 'Ya existe una asignación de esta unidad funcional a ese pool.',
  unidad_funcional_grupo_jueces_cantidad_asignada_check: 'La cantidad asignada debe ser mayor a 0.',
  grupos_jueces_total_jueces_check: 'El total de jueces no puede ser negativo.',
  unidades_funcionales_localidad_id_fkey: 'La localidad indicada no existe.',
  unidades_funcionales_tipo_uf_id_fkey: 'El tipo de unidad funcional indicado no existe.',
  organismos_denominacion_simplificada_id_fkey: 'La denominación simplificada indicada no existe.',
  organismos_tipo_oficina_id_fkey: 'El tipo de oficina indicado no existe.',
  organismos_provincia_id_fkey: 'La provincia indicada no existe.',
  grupos_jueces_provincia_id_fkey: 'La provincia indicada no existe.',
  usuarios_provincia_id_fkey: 'La provincia indicada no existe.',
  usuario_roles_rol_id_fkey: 'El rol indicado no existe.',
  organismo_editores_usuario_id_fkey: 'El usuario indicado no existe.',
  organismo_editores_pkey: 'Ese usuario ya es editor de este organismo.',
  usuarios_email_key: 'Ese email ya está dado de alta.',
}

// Devuelve el mensaje para un error de Postgres causado por el cliente, o null si es una falla inesperada.
export function mensajeDeIntegridadPg(err: unknown, metodo: string): string | null {
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown }
  if (typeof e?.code !== 'string') return null
  const esDelete = metodo.toUpperCase() === 'DELETE'

  if (typeof e.constraint === 'string' && e.constraint in MENSAJES_POR_CONSTRAINT) {
    const m = MENSAJES_POR_CONSTRAINT[e.constraint]!
    return typeof m === 'string' ? m : esDelete ? m.DELETE : m.otro
  }
  switch (e.code) {
    case '23503':
      return esDelete ? 'El registro está en uso y no puede eliminarse.' : 'El dato indicado no existe.'
    case '23505':
      return 'Ya existe un registro con esos datos.'
    case '23514':
      return 'El valor indicado está fuera de lo permitido.'
    case '23502':
      return 'Falta un dato obligatorio.'
    case 'P0001':
      // RAISE EXCEPTION de los triggers de integridad (001/003/004): ya están escritos para el cliente.
      return typeof e.message === 'string' ? e.message : null
    default:
      // Clase 22 (data exception): valor fuera de rango, texto demasiado largo, formato inválido…
      return e.code.startsWith('22') ? 'El valor indicado no es válido.' : null
  }
}

export function registrarManejadorDeErrores(app: FastifyInstance) {
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ErrorNegocio) {
      return reply.code(err.statusCode).send({ error: err.message, ...err.extra })
    }
    const mensaje = mensajeDeIntegridadPg(err, request.method)
    if (mensaje !== null) {
      return reply.code(400).send({ error: mensaje })
    }
    // Validación de esquema de Fastify (4xx) → forma por defecto; inesperado → 500 sin exponer el detalle.
    const status = (err as { statusCode?: number }).statusCode ?? 500
    if (status >= 500) {
      request.log.error({ err }, 'error no controlado')
      return reply.code(500).send({ error: 'Error interno del servidor' })
    }
    return reply.code(status).send(err)
  })
}
