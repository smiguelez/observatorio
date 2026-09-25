// 007 (Decisión 3): "acceso inicial" = token `reset-password:<token>` de
// auth.verification (un solo uso atómico, vencimiento propio, política de
// contraseña de Better Auth). Se emite a mano (sin correo, Fase C) y se canjea
// fijando la contraseña + iniciando sesión. El token NUNCA se escribe en logs (FR-022).
import { randomBytes } from 'node:crypto'
import type pg from 'pg'
import { auth } from './index.js'
import { loadAccesoInicialTtlHoras } from '../config/env.js'
import { ErrorNegocio } from '../http/errores-integridad.js'

const PREFIJO = 'reset-password:'
const MENSAJE_INVALIDO = 'El acceso inicial no es válido o venció.'
// Política vigente de Better Auth (no se endurece en 007).
const MIN_PASSWORD = 8
const MAX_PASSWORD = 128

export interface AccesoInicial {
  token: string
  vence: Date
}

export async function emitirAccesoInicial(pool: pg.Pool, usuarioId: string): Promise<AccesoInicial> {
  // El destinatario es un usuario dado de alta (`usuarios`). Los migrados todavía no tienen fila en auth."user"
  // (se crea en su primer ingreso): se la crea acá, con el email avalado por el admin (emailVerified = true, FR-020).
  const usuario = await pool.query<{ email: string; nombre_display: string | null }>(
    'SELECT email::text, nombre_display FROM usuarios WHERE id = $1',
    [usuarioId],
  )
  if (usuario.rowCount === 0) throw new ErrorNegocio(404, 'No encontrado')
  await pool.query(
    `INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, now(), now()) ON CONFLICT (id) DO NOTHING`,
    [usuarioId, usuario.rows[0]!.nombre_display ?? usuario.rows[0]!.email, usuario.rows[0]!.email.toLowerCase()],
  )

  const token = randomBytes(32).toString('base64url')
  const vence = new Date(Date.now() + loadAccesoInicialTtlHoras() * 3600 * 1000)
  const ctx = await auth.$context
  // Reemitir invalida el anterior (FR-019): un solo acceso vigente por usuario.
  await pool.query(`DELETE FROM auth.verification WHERE identifier LIKE $1 AND value = $2`, [`${PREFIJO}%`, usuarioId])
  await ctx.internalAdapter.createVerificationValue({
    identifier: `${PREFIJO}${token}`,
    value: usuarioId,
    expiresAt: vence,
  })
  return { token, vence }
}

export interface CanjeExitoso {
  usuarioId: string
  setCookie: string[]
}

export async function canjearAccesoInicial(pool: pg.Pool, token: string, password: string): Promise<CanjeExitoso> {
  // La política se valida ANTES de mirar el token, para no filtrar su validez.
  if (password.length < MIN_PASSWORD) {
    throw new ErrorNegocio(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`, { code: 'PASSWORD_TOO_SHORT' })
  }
  if (password.length > MAX_PASSWORD) {
    throw new ErrorNegocio(400, `La contraseña no puede superar los ${MAX_PASSWORD} caracteres.`, { code: 'PASSWORD_TOO_LONG' })
  }

  // Lectura sin consumir, solo para resolver el email a quien iniciar sesión.
  const { rows } = await pool.query<{ email: string; usuario_id: string }>(
    `SELECT u.email, u.id AS usuario_id
       FROM auth.verification v JOIN auth."user" u ON u.id = v.value
      WHERE v.identifier = $1 AND v."expiresAt" > now()`,
    [`${PREFIJO}${token}`],
  )
  if (rows.length === 0) throw new ErrorNegocio(400, MENSAJE_INVALIDO)
  const { email, usuario_id: usuarioId } = rows[0]!

  try {
    // Consumo atómico + creación de la credencial (dos canjes simultáneos: solo uno gana).
    await auth.api.resetPassword({ body: { token, newPassword: password } })
  } catch {
    throw new ErrorNegocio(400, MENSAJE_INVALIDO)
  }

  const respuesta = await auth.api.signInEmail({ body: { email, password }, asResponse: true })
  if (!respuesta.ok) throw new ErrorNegocio(400, MENSAJE_INVALIDO)
  return { usuarioId, setCookie: respuesta.headers.getSetCookie() }
}
