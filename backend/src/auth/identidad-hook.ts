// 007 (Decisión 1, FR-001/002/003/006/007): compuerta de provisión + id unificado.
// Se compone en el mismo `databaseHooks.user.create.before` de 002 (Principio V):
//   1) normaliza el email (minúsculas, sin espacios);
//   2) si NO está en `usuarios` → lanza APIError 403 ACCESO_NO_AUTORIZADO (los tres
//      métodos lo traducen: JSON 403, o redirección con ?error= en los flujos de
//      navegador) y no queda ninguna fila;
//   3) si está → fija auth.user.id = usuarios.id (como texto).
// NUNCA inserta en `usuarios`: solo el alta administrada crea personas (cierra D14).
//
// El mensaje es uniforme y no revela si el email existe (FR-003).
import type pg from 'pg'
import { APIError } from 'better-auth/api'

interface DatosAltaUsuario {
  email: string
  [key: string]: unknown
}

export const MENSAJE_ACCESO_NO_AUTORIZADO = 'No se pudo iniciar sesión con este email.'

export async function buscarUsuarioIdPorEmail(pool: pg.Pool, email: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>('SELECT id::text FROM usuarios WHERE email = $1', [
    email.trim().toLowerCase(),
  ])
  return rows[0]?.id ?? null
}

export function crearHookIdentidad(pool: pg.Pool) {
  return async (user: DatosAltaUsuario): Promise<{ data: { id: string; email: string } }> => {
    const id = await buscarUsuarioIdPorEmail(pool, String(user.email ?? ''))
    if (id === null) {
      throw new APIError('FORBIDDEN', { code: 'ACCESO_NO_AUTORIZADO', message: MENSAJE_ACCESO_NO_AUTORIZADO })
    }
    return { data: { id, email: String(user.email).trim().toLowerCase() } }
  }
}
