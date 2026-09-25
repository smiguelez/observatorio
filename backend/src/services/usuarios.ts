// 007 (Decisión 4/5/6): operaciones de identidad con reglas y transacción
// propias. Las comparte la ruta y el helper de pruebas para no duplicar SQL.
import type pg from 'pg'
import { conTransaccion } from '../db/transaction.js'
import { ErrorNegocio } from '../http/errores-integridad.js'

export type RolInicial = 'admin' | 'usuario_normal'

export interface DatosAlta {
  email: string
  rol: RolInicial
  provinciaId?: number | null
  nombreDisplay?: string | null
}

export interface UsuarioProvisionado {
  id: string
  email: string
  provinciaId: number | null
  roles: RolInicial[]
}

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function provisionarUsuario(pool: pg.Pool, datos: DatosAlta): Promise<UsuarioProvisionado> {
  const email = normalizarEmail(datos.email)
  if (!FORMATO_EMAIL.test(email)) throw new ErrorNegocio(400, 'El email no tiene un formato válido.')
  if (datos.rol !== 'admin' && datos.rol !== 'usuario_normal') throw new ErrorNegocio(400, 'El rol indicado no existe.')
  const provinciaId = datos.provinciaId ?? null
  if (datos.rol === 'usuario_normal' && provinciaId === null) {
    throw new ErrorNegocio(400, 'La provincia es obligatoria para un usuario normal.')
  }
  if (provinciaId !== null) {
    const prov = await pool.query('SELECT 1 FROM provincias WHERE id = $1', [provinciaId])
    if (prov.rowCount === 0) throw new ErrorNegocio(400, 'La provincia indicada no existe.')
  }

  return conTransaccion(pool, async (client) => {
    // ON CONFLICT: dos altas simultáneas del mismo email → una sola inserta; la otra recibe el rechazo.
    const ins = await client.query<{ id: string }>(
      `INSERT INTO usuarios (email, provincia_id, email_verificado, firestore_id, nombre_display, creado_a)
       VALUES ($1, $2, true, 'api:' || gen_random_uuid()::text, $3, now())
       ON CONFLICT (email) DO NOTHING
       RETURNING id::text`,
      [email, provinciaId, datos.nombreDisplay ?? null],
    )
    if (ins.rowCount === 0) throw new ErrorNegocio(400, 'Ese email ya está dado de alta.')
    const id = ins.rows[0]!.id

    const roles: RolInicial[] = datos.rol === 'admin' ? ['usuario_normal', 'admin'] : ['usuario_normal']
    await client.query(
      `INSERT INTO usuario_roles (usuario_id, rol_id) SELECT $1, id FROM roles WHERE nombre = ANY($2::text[])`,
      [id, roles],
    )
    // auth."user" por SQL, en la misma transacción (Decisión 4). El admin avala el email → emailVerified = true
    // (evita que un ingreso posterior por enlace borre la contraseña, FR-020).
    await client.query(
      `INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, now(), now())`,
      [id, datos.nombreDisplay ?? email, email],
    )
    return { id, email, provinciaId, roles }
  })
}

export interface CambiosPerfil {
  nombreDisplay?: string
  provinciaId?: number
  fotoUrl?: string
}

export const MENSAJE_PROVINCIA_SOLO_ADMIN = 'La provincia de un usuario solo la puede asignar un administrador.'

// Decisión 6 (FR-008..FR-011): la provincia la escribe solo un admin. Un no admin que intenta CAMBIARLA
// (valor distinto del actual, incluido null → valor) recibe 403 y NO se aplica nada de la solicitud.
// Reenviar la provincia actual no es un cambio. La fila se bloquea para que el chequeo y el UPDATE sean atómicos.
export async function actualizarUsuario(pool: pg.Pool, id: bigint, esAdmin: boolean, cambios: CambiosPerfil) {
  return conTransaccion(pool, async (client) => {
    const actual = await client.query<{ provincia_id: number | null }>(
      'SELECT provincia_id FROM usuarios WHERE id = $1 FOR UPDATE',
      [id],
    )
    if (actual.rowCount === 0) throw new ErrorNegocio(404, 'No encontrado')

    const { provinciaId } = cambios
    const cambiaProvincia = provinciaId !== undefined && provinciaId !== actual.rows[0]!.provincia_id
    if (cambiaProvincia && !esAdmin) throw new ErrorNegocio(403, MENSAJE_PROVINCIA_SOLO_ADMIN)
    if (cambiaProvincia) {
      const existe = await client.query('SELECT 1 FROM provincias WHERE id = $1', [provinciaId])
      if (existe.rowCount === 0) throw new ErrorNegocio(400, 'La provincia indicada no existe.')
    }

    const { rows } = await client.query(
      `UPDATE usuarios SET
         nombre_display = COALESCE($2, nombre_display),
         provincia_id = COALESCE($3, provincia_id),
         foto_url = COALESCE($4, foto_url)
       WHERE id = $1
       RETURNING id, email, nombre_display, provincia_id, foto_url`,
      [id, cambios.nombreDisplay ?? null, cambiaProvincia ? provinciaId : null, cambios.fotoUrl ?? null],
    )
    return rows[0]
  })
}

// Decisión 5 (FR-012..FR-015): "es admin / no es admin" = agregar o quitar la fila `admin`; la fila
// `usuario_normal` se conserva siempre. Dentro de una transacción se bloquean las filas admin (FOR UPDATE) y
// se cuenta: dos degradaciones simultáneas de los dos últimos admins se serializan y la segunda se rechaza.
export async function cambiarRol(pool: pg.Pool, usuarioId: string, rol: RolInicial) {
  if (rol !== 'admin' && rol !== 'usuario_normal') throw new ErrorNegocio(400, 'El rol indicado no existe.')

  return conTransaccion(pool, async (client) => {
    const existe = await client.query('SELECT 1 FROM usuarios WHERE id = $1', [usuarioId])
    if (existe.rowCount === 0) throw new ErrorNegocio(404, 'No encontrado')

    // Bloquea TODAS las filas admin: serializa a los que cambian el conjunto de admins.
    await client.query(
      `SELECT usuario_id FROM usuario_roles WHERE rol_id = (SELECT id FROM roles WHERE nombre = 'admin') FOR UPDATE`,
    )
    const { rows: conteo } = await client.query<{ n: number }>(
      `SELECT count(*)::int n FROM usuario_roles WHERE rol_id = (SELECT id FROM roles WHERE nombre = 'admin')`,
    )
    const esAdminAhora = (
      await client.query(
        `SELECT 1 FROM usuario_roles WHERE usuario_id = $1 AND rol_id = (SELECT id FROM roles WHERE nombre = 'admin')`,
        [usuarioId],
      )
    ).rowCount! > 0

    if (rol === 'usuario_normal' && esAdminAhora && conteo[0]!.n <= 1) {
      throw new ErrorNegocio(400, 'El sistema no puede quedarse sin administradores.')
    }

    await client.query(
      `INSERT INTO usuario_roles (usuario_id, rol_id) SELECT $1, id FROM roles WHERE nombre = 'usuario_normal' ON CONFLICT DO NOTHING`,
      [usuarioId],
    )
    if (rol === 'admin') {
      await client.query(
        `INSERT INTO usuario_roles (usuario_id, rol_id) SELECT $1, id FROM roles WHERE nombre = 'admin' ON CONFLICT DO NOTHING`,
        [usuarioId],
      )
    } else {
      await client.query(
        `DELETE FROM usuario_roles WHERE usuario_id = $1 AND rol_id = (SELECT id FROM roles WHERE nombre = 'admin')`,
        [usuarioId],
      )
    }
    const { rows } = await client.query<{ nombre: string }>(
      `SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = $1 ORDER BY r.id DESC`,
      [usuarioId],
    )
    return { id: usuarioId, roles: rows.map((r) => r.nombre) as RolInicial[] }
  })
}
