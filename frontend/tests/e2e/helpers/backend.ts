import { execFileSync } from 'node:child_process'
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
    'DELETE FROM auth."user" WHERE email LIKE $P',
    'DELETE FROM usuarios WHERE email LIKE $P',
  ]) psql(q(sql))
}

export function contarFixtures(prefijo = PREFIJO): number {
  return Number(psql(`SELECT count(*) FROM usuarios WHERE email LIKE '${prefijo}%'`).trim())
}

/** Alta por contraseña directo contra el backend (sin cookie => sin origin check). */
export async function crearUsuarioConClave(email: string): Promise<void> {
  const r = await fetch(`${BACKEND}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGEN },
    body: JSON.stringify({ email, password: CLAVE, name: 'Test' }),
  })
  if (!r.ok) throw new Error(`sign-up falló para ${email}: ${r.status} ${await r.text()}`)
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
