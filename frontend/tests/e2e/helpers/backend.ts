import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Helpers de E2E contra el backend REAL (sin mocks). Requieren:
//   DATABASE_URL  — misma base que usa el backend (para crear/limpiar fixtures `test-frontend-*`)
//   BACKEND_LOG   — archivo donde el backend redirige su stdout (el magic link se LOGUEA, no se envía: G4)
export const PREFIJO = 'test-frontend-'
export const CLAVE = 'contrasena-test-12345'
export const BACKEND = 'http://localhost:3000'
// Origen del frontend en dev: es el origen confiable que fija BETTER_AUTH_URL.
const ORIGEN = 'http://localhost:5173'

function psql(sql: string): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL para los fixtures de E2E')
  return execFileSync('psql', [url, '-Atc', sql], { encoding: 'utf8' })
}

/** Mismo criterio que backend/tests/helpers/db.ts (`limpiarUsuariosDePrueba`), por prefijo. */
export function limpiarFixtures(prefijo = PREFIJO): void {
  const p = `${prefijo}%`
  const q = (s: string) => s.replaceAll('$P', `'${p}'`)
  for (const sql of [
    'DELETE FROM organismo_editores WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE $P)',
    'DELETE FROM organismos WHERE propietario_id IN (SELECT id FROM usuarios WHERE email LIKE $P)',
    'DELETE FROM auth.session WHERE "userId" IN (SELECT id::text FROM usuarios WHERE email LIKE $P)',
    'DELETE FROM auth.account WHERE "userId" IN (SELECT id::text FROM usuarios WHERE email LIKE $P)',
    `DELETE FROM auth.verification WHERE value LIKE '%${prefijo}%'`,
    // 007: el acceso inicial (`reset-password:*`) guarda el ID del usuario, no su email: se borra por id.
    `DELETE FROM auth.verification WHERE identifier LIKE 'reset-password:%' AND value IN (SELECT id::text FROM usuarios WHERE email LIKE $P)`,
    'DELETE FROM auth."user" WHERE email LIKE $P',
    'DELETE FROM usuarios WHERE email LIKE $P',
    // Pools de prueba: se identifican por prefijo de descripcion (mismo criterio que backend/tests).
    `DELETE FROM grupos_jueces WHERE descripcion LIKE '${prefijo}%' OR descripcion LIKE 'Grupo exclusivo de ${prefijo}%'`,
  ]) psql(q(sql))
}

export function contarFixtures(prefijo = PREFIJO): number {
  return Number(psql(`SELECT count(*) FROM usuarios WHERE email LIKE '${prefijo}%'`).trim())
}

// ---------------------------------------------------------------------------------------------------------------
// 007 eliminó el alta pública por contraseña: los usuarios de fixtures se dan de alta como en producción, por el flujo
// administrado (POST /api/usuarios) + canje del acceso inicial (POST /api/acceso-inicial/canjear). Para llamar al alta
// hace falta un admin autenticado y no hay admin sin credenciales, así que existe UN solo arranque por SQL
// (`asegurarAdminDeFixtures`): el admin de fixtures `test-frontend-boot@…`. Todo lo demás usa la API real de 007.
// ---------------------------------------------------------------------------------------------------------------
export const EMAIL_ADMIN_FIXTURES = `${PREFIJO}boot@example.test`
const PROVINCIA_POR_DEFECTO = 1
const jsonHeaders = { 'content-type': 'application/json', origin: ORIGEN }

async function canjear(token: string, password: string): Promise<Response> {
  return fetch(`${BACKEND}/api/acceso-inicial/canjear`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ token, password }) })
}

/** Inserta por SQL un acceso inicial de 1 hora para el usuario `id` (solo para el admin de arranque). */
function insertarAccesoDeArranque(id: string): string {
  const token = randomBytes(24).toString('base64url')
  psql(
    `INSERT INTO auth.verification (id, identifier, value, "expiresAt") VALUES ('boot-${token.slice(0, 12)}', 'reset-password:${token}', '${id}', now() + interval '1 hour')`,
  )
  return token
}

async function iniciarSesion(email: string): Promise<string | null> {
  const r = await fetch(`${BACKEND}/api/auth/sign-in/email`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email, password: CLAVE }) })
  if (!r.ok) return null
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

/**
 * Garantiza que existe el admin de fixtures con contraseña `CLAVE` y devuelve su cookie de sesión. No se cachea entre
 * llamadas: cada archivo hace `limpiarFixtures()` al empezar y lo borraría.
 */
export async function asegurarAdminDeFixtures(): Promise<string> {
  let id = sql(`SELECT id FROM usuarios WHERE email = '${EMAIL_ADMIN_FIXTURES}'`)
  if (!id) {
    id = sql(
      `INSERT INTO usuarios (email, email_verificado, firestore_id) VALUES ('${EMAIL_ADMIN_FIXTURES}', true, 'api:${PREFIJO}boot') RETURNING id`,
    ).split('\n')[0]!
    psql(`INSERT INTO usuario_roles (usuario_id, rol_id) SELECT ${id}, id FROM roles WHERE nombre IN ('admin', 'usuario_normal')`)
    psql(`INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES ('${id}', 'fixtures', '${EMAIL_ADMIN_FIXTURES}', true)`)
  }
  const existente = await iniciarSesion(EMAIL_ADMIN_FIXTURES)
  if (existente) return existente
  const r = await canjear(insertarAccesoDeArranque(id), CLAVE)
  if (!r.ok) throw new Error(`canje de arranque falló: ${r.status} ${await r.text()}`)
  const cookie = await iniciarSesion(EMAIL_ADMIN_FIXTURES)
  if (!cookie) throw new Error('el admin de fixtures no pudo iniciar sesión tras el canje')
  return cookie
}

export interface OpcionesUsuario {
  /** `undefined` (por defecto): el alta se hace con provincia y luego queda en NULL por SQL — el estado de partida que
   *  tenían los tests de 005 (usuario sin provincia). Un número la conserva tal como la dio el alta. */
  provinciaId?: number
  rol?: 'usuario_normal' | 'admin'
}

async function altaAdministrada(email: string, provinciaId: number | null, rol: 'usuario_normal' | 'admin', cookie: string) {
  const r = await fetch(`${BACKEND}/api/usuarios`, {
    method: 'POST',
    headers: { ...jsonHeaders, cookie },
    body: JSON.stringify({ email, rol, ...(provinciaId !== null ? { provinciaId } : {}) }),
  })
  if (r.status !== 201) throw new Error(`alta administrada falló para ${email}: ${r.status} ${await r.text()}`)
  return (await r.json()) as { id: string; accesoInicial: { token: string; vence: string } }
}

/**
 * Da de alta a `email` como un admin (POST /api/usuarios) y canjea su acceso inicial con `CLAVE` (POST
 * /api/acceso-inicial/canjear): queda con contraseña `CLAVE`, igual que el alta por contraseña de 005.
 */
export async function crearUsuarioConClave(email: string, opciones: OpcionesUsuario = {}): Promise<void> {
  const cookieAdmin = await asegurarAdminDeFixtures()
  const rol = opciones.rol ?? 'usuario_normal'
  const alta = await altaAdministrada(email, opciones.provinciaId ?? (rol === 'admin' ? null : PROVINCIA_POR_DEFECTO), rol, cookieAdmin)
  const r = await canjear(alta.accesoInicial.token, CLAVE)
  if (!r.ok) throw new Error(`canje falló para ${email}: ${r.status} ${await r.text()}`)
  if (opciones.provinciaId === undefined && rol === 'usuario_normal') asignarProvincia(email, null)
}

/** Alta administrada SIN canjear: la cuenta existe pero nunca fijó contraseña (puede ingresar por enlace o Google). */
export async function crearUsuarioSinClave(email: string, provinciaId = PROVINCIA_POR_DEFECTO): Promise<{ id: string; token: string }> {
  const cookieAdmin = await asegurarAdminDeFixtures()
  const alta = await altaAdministrada(email, provinciaId, 'usuario_normal', cookieAdmin)
  return { id: alta.id, token: alta.accesoInicial.token }
}

/** Último magic link logueado por el backend para `email`. */
export function ultimoMagicLink(email: string): string {
  const log = process.env.BACKEND_LOG
  if (!log) throw new Error('Falta BACKEND_LOG (archivo con el stdout del backend)')
  const lineas = readFileSync(log, 'utf8').split('\n').filter((l) => l.includes('[magic-link]') && l.includes(email))
  const ultima = lineas.at(-1)
  const m = ultima?.match(/Link: (\S+) \(token=/)
  if (!m) throw new Error(`No hay magic link logueado para ${email}`)
  return m[1]!
}

/** Pide el magic link por API (para fixtures) y devuelve su URL. */
export async function pedirMagicLink(email: string): Promise<string> {
  const r = await fetch(`${BACKEND}/api/auth/sign-in/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGEN },
    body: JSON.stringify({ email, callbackURL: '/' }),
  })
  if (!r.ok) throw new Error(`magic-link falló para ${email}: ${r.status} ${await r.text()}`)
  await new Promise((res) => setTimeout(res, 300)) // el backend loguea de forma asíncrona
  return ultimoMagicLink(email)
}

export function hacerAdmin(email: string): void {
  psql(`INSERT INTO usuario_roles (usuario_id, rol_id) SELECT u.id, r.id FROM usuarios u, roles r WHERE u.email = '${email}' AND r.nombre = 'admin'`)
}

export function asignarProvincia(email: string, provinciaId: number | null): void {
  psql(`UPDATE usuarios SET provincia_id = ${provinciaId === null ? 'NULL' : provinciaId} WHERE email = '${email}'`)
}

export function sql(consulta: string): string {
  return psql(consulta).trim()
}

/** Cliente de la API real con la cookie de una sesión de prueba (para armar fixtures). */
export interface ApiSesion {
  get: (ruta: string) => Promise<{ status: number; json: any }>
  post: (ruta: string, cuerpo: unknown) => Promise<{ status: number; json: any }>
  put: (ruta: string, cuerpo: unknown) => Promise<{ status: number; json: any }>
  patch: (ruta: string, cuerpo: unknown) => Promise<{ status: number; json: any }>
  del: (ruta: string) => Promise<{ status: number; json: any }>
}

export async function sesionApi(email: string): Promise<ApiSesion> {
  const r = await fetch(`${BACKEND}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGEN },
    body: JSON.stringify({ email, password: CLAVE }),
  })
  if (!r.ok) throw new Error(`sign-in falló para ${email}: ${r.status}`)
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  const llamar = async (metodo: string, ruta: string, cuerpo?: unknown) => {
    const res = await fetch(`${BACKEND}${ruta}`, {
      method: metodo,
      // Fastify rechaza (400) un DELETE/GET con content-type JSON y cuerpo vacío: solo se declara si hay cuerpo.
      headers: cuerpo === undefined ? { cookie } : { 'content-type': 'application/json', cookie },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
    const texto = await res.text()
    return { status: res.status, json: texto ? JSON.parse(texto) : undefined }
  }
  return {
    get: (ruta) => llamar('GET', ruta),
    post: (ruta, c) => llamar('POST', ruta, c),
    put: (ruta, c) => llamar('PUT', ruta, c),
    patch: (ruta, c) => llamar('PATCH', ruta, c),
    del: (ruta) => llamar('DELETE', ruta),
  }
}
