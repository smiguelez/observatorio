// Helper de limpieza para tests que corren contra la base REAL (no mocks —
// mismo enfoque que el resto del proyecto). Cada test file usa su propio
// prefijo de email de prueba; esto borra todo rastro en organismos (y sus
// dependientes), auth.* y usuarios que matchee ese prefijo, antes y después
// de correr.
import type pg from 'pg'
import type { FastifyInstance } from 'fastify'
import { getPgPool } from '../../src/db/pool.js'
import { provisionarUsuario } from '../../src/services/usuarios.js'
import { emitirAccesoInicial, canjearAccesoInicial } from '../../src/auth/acceso-inicial.js'

export async function limpiarUsuariosDePrueba(pool: pg.Pool, prefix: string) {
  const patron = `${prefix}%`
  // organismos.propietario_id y organismo_editores.usuario_id -> usuarios
  // NO tienen ON DELETE CASCADE (db/schema.sql): hay que borrar estas filas
  // antes que las de usuarios, o la FK lo rechaza. Borrar el organismo sí
  // cascadea sus propios dependientes (UF, taxonomía, editores, fueros).
  await pool.query(
    `DELETE FROM organismo_editores WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE $1)`,
    [patron],
  )
  await pool.query(
    `DELETE FROM organismos WHERE propietario_id IN (SELECT id FROM usuarios WHERE email LIKE $1)`,
    [patron],
  )
  await pool.query(
    `DELETE FROM auth.session WHERE "userId" IN (SELECT id::text FROM usuarios WHERE email LIKE $1)`,
    [patron],
  )
  await pool.query(
    `DELETE FROM auth.account WHERE "userId" IN (SELECT id::text FROM usuarios WHERE email LIKE $1)`,
    [patron],
  )
  await pool.query(`DELETE FROM auth.verification WHERE value LIKE $1`, [`%${prefix}%`])
  // Los accesos iniciales (`reset-password:*`) guardan el id del usuario, no su email (007).
  await pool.query(
    `DELETE FROM auth.verification WHERE identifier LIKE 'reset-password:%' AND value IN (SELECT id::text FROM usuarios WHERE email LIKE $1)`,
    [patron],
  )
  await pool.query(`DELETE FROM auth."user" WHERE email LIKE $1`, [patron])
  await pool.query(`DELETE FROM usuarios WHERE email LIKE $1`, [patron])
}

export function extraerCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
  if (!raw) throw new Error('No vino set-cookie en la respuesta')
  return raw.split(';')[0]!
}

export interface UsuarioDePrueba {
  usuarioId: string
  cookie: string
}

// 007: el alta pública por contraseña ya no existe. El usuario de prueba se da
// de alta por el MISMO servicio que la ruta (provisión) y entra por el canje
// del acceso inicial, que ya deja una sesión iniciada.
export const PASSWORD_DE_PRUEBA = 'contrasena-test-12345'

export async function crearUsuarioDePrueba(
  _app: FastifyInstance,
  email: string,
  opciones: { rol?: 'admin' | 'usuario_normal'; provinciaId?: number | null } = {},
): Promise<UsuarioDePrueba> {
  const pool = getPgPool()
  const rol = opciones.rol ?? 'usuario_normal'
  const usuario = await provisionarUsuario(pool, {
    email,
    rol,
    provinciaId: opciones.provinciaId === undefined ? PROVINCIA_DE_PRUEBA : opciones.provinciaId,
    nombreDisplay: 'Test',
  })
  const acceso = await emitirAccesoInicial(pool, usuario.id)
  const canje = await canjearAccesoInicial(pool, acceso.token, PASSWORD_DE_PRUEBA)
  return { usuarioId: usuario.id, cookie: extraerCookie(canje.setCookie) }
}

// Provincia por defecto de los usuarios de prueba (el servicio exige una para el usuario normal).
const PROVINCIA_DE_PRUEBA = 1

export async function hacerAdmin(pool: pg.Pool, usuarioId: string) {
  await pool.query(
    `INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, (SELECT id FROM roles WHERE nombre = 'admin'))`,
    [usuarioId],
  )
}

// No hay endpoint de "editar mi perfil" todavía (eso es US4) — la provincia
// se fija directo por SQL para armar el fixture de los tests de pools.
export async function asignarProvincia(pool: pg.Pool, usuarioId: string, provinciaId: number) {
  await pool.query('UPDATE usuarios SET provincia_id = $2 WHERE id = $1', [usuarioId, provinciaId])
}

// grupos_jueces no tiene una columna que lo ligue a un usuario de prueba
// (no hay "creado_por"); se limpia por prefijo de `descripcion`, que los
// tests de pools usan a propósito para poder identificar sus propias filas.
export async function limpiarPoolsDePrueba(pool: pg.Pool, prefix: string) {
  // Una asignación a una UF impide borrar el pool (FK sin cascade): se quita primero, por si un test falló a mitad.
  await pool.query(
    'DELETE FROM unidad_funcional_grupo_jueces WHERE grupo_jueces_id IN (SELECT id FROM grupos_jueces WHERE descripcion LIKE $1)',
    [`${prefix}%`],
  )
  await pool.query('DELETE FROM grupos_jueces WHERE descripcion LIKE $1', [`${prefix}%`])
}

// Simula a uno de los 47 usuarios migrados: existe en `usuarios` (con rol y
// provincia) pero todavía NO tiene fila en auth."user" ni credenciales.
export async function provisionarSinIdentidad(
  pool: pg.Pool,
  email: string,
  provinciaId = 1,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO usuarios (email, provincia_id, firestore_id) VALUES ($1::text, $2, $1::text) RETURNING id::text`,
    [email, provinciaId],
  )
  await pool.query(
    `INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ($1, (SELECT id FROM roles WHERE nombre = 'usuario_normal'))`,
    [rows[0]!.id],
  )
  return rows[0]!.id
}

// Cuenta filas de identidad de un email, para afirmar "0 filas" tras un rechazo (FR-002).
export async function contarIdentidad(pool: pg.Pool, email: string) {
  const n = async (sql: string) => (await pool.query(sql, [email.trim().toLowerCase()])).rows[0].n as number
  return {
    usuarios: await n(`SELECT count(*)::int n FROM usuarios WHERE email = $1`),
    authUser: await n(`SELECT count(*)::int n FROM auth."user" WHERE email = $1`),
    cuentas: await n(`SELECT count(*)::int n FROM auth.account WHERE "userId" IN (SELECT id FROM auth."user" WHERE email = $1)`),
    sesiones: await n(`SELECT count(*)::int n FROM auth.session WHERE "userId" IN (SELECT id FROM auth."user" WHERE email = $1)`),
    verificaciones: await n(`SELECT count(*)::int n FROM auth.verification WHERE value LIKE '%' || $1 || '%'`),
  }
}
