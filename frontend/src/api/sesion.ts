import { z } from 'zod'
import { ApiError, http, parsear } from './http'
import { usuarioIdDesdeWire } from './ids'

export type Rol = 'usuario_normal' | 'admin'
export type UsuarioId = number

export interface Sesion {
  usuarioId: UsuarioId
  rol: Rol
  provinciaId: number | null
}

// Forma wire de GET /api/auth/session (ruta propia del backend, no la de Better Auth):
// { usuarioId: string, rol, provinciaId: number|null }
export const SesionWire = z
  .object({
    usuarioId: z.string(),
    rol: z.enum(['usuario_normal', 'admin']),
    provinciaId: z.number().int().nullable(),
  })
  .transform(
    (w): Sesion => ({
      usuarioId: usuarioIdDesdeWire(w.usuarioId, 'sesion.usuarioId'),
      rol: w.rol,
      provinciaId: w.provinciaId,
    }),
  )

/** Identidad del cliente. `null` si no hay sesión (401) — no es un error. */
export async function obtenerSesion(): Promise<Sesion | null> {
  try {
    return parsear(SesionWire, await http('/api/auth/session'), 'sesion')
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    throw e
  }
}
