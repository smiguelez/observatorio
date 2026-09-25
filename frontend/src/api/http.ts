import type { ZodType } from 'zod'

// Cliente HTTP mínimo. Rutas SIEMPRE relativas (`/api/...`): en desarrollo las
// atiende el proxy de Vite y en producción el mismo origen (research.md, Dec. 3).
// Ningún token en JS: la sesión es una cookie httpOnly que gestiona el navegador.

/** Respuesta no exitosa del backend. `mensaje` sale de `{error}` (dominio) o `{message}` (Better Auth). */
export class ApiError extends Error {
  readonly status: number
  readonly codigo: string | undefined
  readonly cuerpo: unknown

  constructor(status: number, mensaje: string, cuerpo?: unknown, codigo?: string) {
    super(mensaje)
    this.name = 'ApiError'
    this.status = status
    this.cuerpo = cuerpo
    this.codigo = codigo
  }
}

/** La respuesta no tiene la forma que el contrato documenta (deriva del backend). */
export class ContratoInesperado extends Error {
  readonly recurso: string
  readonly campo: string

  constructor(recurso: string, campo: string, detalle?: string) {
    super(`Contrato inesperado en ${recurso}${campo ? ` (${campo})` : ''}${detalle ? `: ${detalle}` : ''}`)
    this.name = 'ContratoInesperado'
    this.recurso = recurso
    this.campo = campo
  }
}

function extraerMensaje(cuerpo: unknown, status: number): { mensaje: string; codigo?: string } {
  if (cuerpo && typeof cuerpo === 'object') {
    const c = cuerpo as { error?: unknown; message?: unknown; code?: unknown }
    const mensaje = typeof c.error === 'string' ? c.error : typeof c.message === 'string' ? c.message : undefined
    const codigo = typeof c.code === 'string' ? c.code : undefined
    if (mensaje) return { mensaje, codigo }
  }
  return { mensaje: `Error ${status}` }
}

export interface OpcionesHttp {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

/** Ejecuta la llamada y devuelve el JSON crudo, o `undefined` en un 204 (sin cuerpo). */
export async function http(path: string, { method = 'GET', body, signal }: OpcionesHttp = {}): Promise<unknown> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })
  if (res.status === 204) return undefined

  const texto = await res.text()
  let cuerpo: unknown
  if (texto) {
    try {
      cuerpo = JSON.parse(texto)
    } catch {
      cuerpo = undefined
    }
  }
  if (!res.ok) {
    const { mensaje, codigo } = extraerMensaje(cuerpo, res.status)
    throw new ApiError(res.status, mensaje, cuerpo, codigo)
  }
  return cuerpo
}

/** Valida `datos` con el esquema del recurso; si no coincide lanza `ContratoInesperado` con el primer campo en falta. */
export function parsear<T>(esquema: ZodType<T>, datos: unknown, recurso: string): T {
  const r = esquema.safeParse(datos)
  if (r.success) return r.data
  const primero = r.error.issues[0]
  throw new ContratoInesperado(recurso, primero ? primero.path.join('.') : '', primero?.message)
}
