// T010 (Foundational): resolución de identidad por request (FR-002, FR-011).
// cookie de sesión -> auth.session (vía auth.api.getSession) -> auth.user.id
// (= String(usuarios.id), T007/T009) -> se relee rol/provincia SIEMPRE desde
// public.* en esta misma llamada — nunca se cachea ni se confía en nada del
// objeto de sesión de Better Auth más allá del id. Esto es lo que garantiza
// que remover a un editor, cambiar de provincia o sacar el rol admin surta
// efecto en la siguiente request sin re-login (SC-007).

import type pg from 'pg'
import type { auth } from './index.js'

export interface IdentidadResuelta {
  usuarioId: bigint
  rol: 'usuario_normal' | 'admin'
  provinciaId: number | null
}

export async function resolverIdentidad(
  pool: pg.Pool,
  authInstance: typeof auth,
  headers: Headers,
): Promise<IdentidadResuelta | null> {
  const session = await authInstance.api.getSession({ headers })
  if (!session) return null

  const usuarioId = BigInt(session.user.id)

  const { rows } = await pool.query<{ provincia_id: number | null; rol: string | null }>(
    `SELECT u.provincia_id,
            (SELECT r.nombre FROM usuario_roles ur
               JOIN roles r ON r.id = ur.rol_id
              WHERE ur.usuario_id = u.id AND r.nombre = 'admin'
              LIMIT 1) AS rol
     FROM usuarios u
     WHERE u.id = $1`,
    [usuarioId],
  )

  if (rows.length === 0) return null

  const fila = rows[0]!
  return {
    usuarioId,
    rol: fila.rol === 'admin' ? 'admin' : 'usuario_normal',
    provinciaId: fila.provincia_id,
  }
}
