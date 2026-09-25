// SPIKE complementario de 007: ¿alcanza `databaseHooks.user.create.before` (el mecanismo ya usado en 002)
// para RECHAZAR la creación de identidad en los tres métodos? Se prueban dos formas de rechazar:
//   (a) lanzar un APIError con código   (b) devolver `false`
// y se observa: estado/respuesta por método, filas creadas, y qué sabe el hook del método (ctx.path).
// Uso: igual que spike-007-identidad.ts. Crea/borra datos `test-007-hook-*`.
import pg from 'pg'
import { PostgresDialect } from 'kysely'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { magicLink } from 'better-auth/plugins'
import { loadPgConfig, loadAuthConfig } from '../src/config/env.js'

const P = 'test-007-hook-'
const ORIGEN = process.env.BETTER_AUTH_URL ?? 'http://localhost:5173'
const pool = new pg.Pool(loadPgConfig())
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows
const enlaces = new Map<string, string>()
async function limpiar() {
  await q(`DELETE FROM auth.session WHERE "userId" IN (SELECT id FROM auth."user" WHERE email LIKE $1)`, [`${P}%`])
  await q(`DELETE FROM auth.account WHERE "userId" IN (SELECT id FROM auth."user" WHERE email LIKE $1)`, [`${P}%`])
  await q(`DELETE FROM auth.verification WHERE value LIKE $1`, [`%${P}%`])
  await q(`DELETE FROM auth."user" WHERE email LIKE $1`, [`${P}%`])
  await q(`DELETE FROM usuarios WHERE email LIKE $1`, [`${P}%`])
}
const filas = async (email: string) => ({
  usuarios: (await q(`SELECT count(*)::int n FROM usuarios WHERE email=$1`, [email]))[0].n,
  authUser: (await q(`SELECT count(*)::int n FROM auth."user" WHERE email=$1`, [email]))[0].n,
})

async function variante(modo: 'lanzar' | 'false') {
  const cfg = loadAuthConfig()
  const vistos: string[] = []
  const auth = betterAuth({
    secret: cfg.secret,
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth' },
    emailAndPassword: { enabled: true },
    socialProviders: { google: { clientId: 'x', clientSecret: 'x', verifyIdToken: async () => true } },
    plugins: [magicLink({ expiresIn: 300, sendMagicLink: async ({ email, token }) => { enlaces.set(email, token) } })],
    databaseHooks: { user: { create: { before: async (user: any, ctx: any) => {
      vistos.push(String(ctx?.path))
      const r = await q(`SELECT id FROM usuarios WHERE email=$1`, [String(user.email).toLowerCase().trim()])
      if (r.length === 0) {
        if (modo === 'lanzar') throw new APIError('FORBIDDEN', { code: 'ACCESO_NO_AUTORIZADO', message: 'No se pudo iniciar sesión con este email.' })
        return false
      }
      return { data: { id: String(r[0].id) } }
    } } } },
  })
  const llamar = async (m: string, ruta: string, cuerpo?: unknown) => {
    const res = await auth.handler(new Request(`${ORIGEN}/api/auth${ruta}`, { method: m, headers: { 'content-type': 'application/json', origin: ORIGEN }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), redirect: 'manual' }))
    const t = await res.text()
    return { status: res.status, cuerpo: t.slice(0, 140), location: res.headers.get('location') }
  }
  const jwt = (email: string) => { const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url'); return `${b({ alg: 'none' })}.${b({ sub: `g-${email}`, email, email_verified: true, name: 'x' })}.` }
  console.log(`\n=== Variante: el before-hook ${modo === 'lanzar' ? 'LANZA APIError(FORBIDDEN, {code})' : 'DEVUELVE false'} ===`)
  // 1 contraseña (API de servidor; el alta HTTP está en la misma ruta)
  const e1 = `${P}${modo}-pw@example.test`
  const r1 = await auth.api.signUpEmail({ body: { email: e1, password: 'contrasena-12345', name: 'x' } }).then(() => ({ ok: true }), (e: any) => ({ ok: false, status: e.statusCode, code: e.body?.code, msg: e.body?.message }))
  console.log('  contraseña :', JSON.stringify(r1), JSON.stringify(await filas(e1)))
  // 2 enlace
  const e2 = `${P}${modo}-ml@example.test`
  await llamar('POST', '/sign-in/magic-link', { email: e2, callbackURL: '/', errorCallbackURL: '/login' })
  const r2 = await llamar('GET', `/magic-link/verify?token=${enlaces.get(e2)}&callbackURL=${encodeURIComponent('/')}&errorCallbackURL=${encodeURIComponent('/login')}`)
  console.log('  enlace     :', r2.status, r2.location, JSON.stringify(await filas(e2)))
  // 3 google
  const e3 = `${P}${modo}-g@example.test`
  const r3 = await llamar('POST', '/sign-in/social', { provider: 'google', idToken: { token: jwt(e3) } })
  console.log('  google     :', r3.status, r3.cuerpo, JSON.stringify(await filas(e3)))
  console.log('  ctx.path que ve el hook en cada creación:', JSON.stringify(vistos))
}

async function main() {
  await limpiar()
  await variante('lanzar')
  await variante('false')
}
main().catch((e) => console.error('SPIKE ERROR', e)).finally(async () => { await limpiar(); console.log('\nfilas de prueba restantes:', (await q(`SELECT count(*)::int n FROM usuarios WHERE email LIKE $1`, [`${P}%`]))[0].n); await pool.end() })
