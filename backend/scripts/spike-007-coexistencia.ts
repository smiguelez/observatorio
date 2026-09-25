// SPIKE 007 — coexistencia de las dos protecciones, mismo ataque, misma config, solo cambia `disableSignUp`.
//   Config común: el ÚNICO databaseHooks.user.create.before (rechaza no provisionados / fija id). SIN disabledPaths.
//   Ataque X (D14): alta pública por contraseña de un email NO provisionado.
//   Ataque Y (apropiación): alta pública por contraseña de un email YA provisionado, sin auth.user todavía,
//                            con una contraseña elegida por el atacante; luego intenta iniciar sesión con ella.
// Uso: BETTER_AUTH_URL=http://localhost:5173 BETTER_AUTH_SECRET=... GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x npx tsx scripts/spike-007-coexistencia.ts
import pg from 'pg'
import { PostgresDialect } from 'kysely'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { loadPgConfig, loadAuthConfig } from '../src/config/env.js'

const P = 'test-007-coex-'
const ORIGEN = process.env.BETTER_AUTH_URL ?? 'http://localhost:5173'
const pool = new pg.Pool(loadPgConfig())
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows
async function limpiar() {
  await q(`DELETE FROM auth.session WHERE "userId" IN (SELECT id FROM auth."user" WHERE email LIKE $1)`, [`${P}%`])
  await q(`DELETE FROM auth.account WHERE "userId" IN (SELECT id FROM auth."user" WHERE email LIKE $1)`, [`${P}%`])
  await q(`DELETE FROM auth."user" WHERE email LIKE $1`, [`${P}%`])
  await q(`DELETE FROM usuarios WHERE email LIKE $1`, [`${P}%`])
}
const cuenta = async (email: string) => ({
  usuarios: (await q(`SELECT count(*)::int n FROM usuarios WHERE email=$1`, [email]))[0].n,
  authUser: (await q(`SELECT count(*)::int n FROM auth."user" WHERE email=$1`, [email]))[0].n,
  credencial: (await q(`SELECT count(*)::int n FROM auth.account WHERE "userId" IN (SELECT id FROM auth."user" WHERE email=$1) AND "providerId"='credential'`, [email]))[0].n,
})

function crear(disableSignUp: boolean) {
  return betterAuth({
    secret: loadAuthConfig().secret,
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth' },
    emailAndPassword: { enabled: true, disableSignUp },
    databaseHooks: { user: { create: { before: async (user) => {
      const email = String(user.email ?? '').trim().toLowerCase()
      const r = await q(`SELECT id FROM usuarios WHERE email = $1`, [email])
      if (r.length === 0) throw new APIError('FORBIDDEN', { code: 'ACCESO_NO_AUTORIZADO', message: 'No se pudo iniciar sesión con este email.' })
      return { data: { id: String(r[0].id) } }
    } } } },
  })
}
const http = async (auth: ReturnType<typeof crear>, ruta: string, cuerpo: object) => {
  const res = await auth.handler(new Request(`${ORIGEN}/api/auth${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGEN }, body: JSON.stringify(cuerpo) }))
  const t = await res.text(); let j: any; try { j = JSON.parse(t) } catch { j = t }
  return { status: res.status, code: j?.code, hasUser: !!j?.user }
}

async function corrida(disableSignUp: boolean) {
  console.log(`\n===== disableSignUp: ${disableSignUp} =====`)
  await limpiar()
  const auth = crear(disableSignUp)
  const noProv = `${P}noprov-${disableSignUp}@example.test`
  const prov = `${P}prov-${disableSignUp}@example.test`
  await q(`INSERT INTO usuarios (email, firestore_id) VALUES ($1,$2)`, [prov, prov])
  console.log('  estado inicial provisionado:', JSON.stringify(await cuenta(prov)))

  const x = await http(auth, '/sign-up/email', { email: noProv, password: 'atacante-12345', name: 'x' })
  console.log('  X  (D14) HTTP sign-up email NO provisionado :', JSON.stringify(x), JSON.stringify(await cuenta(noProv)))
  const xa: any = await auth.api.signUpEmail({ body: { email: noProv, password: 'atacante-12345', name: 'x' } }).catch((e: any) => e)
  console.log('  X  (D14) server API sign-up NO provisionado :', xa?.statusCode ?? 'OK', xa?.body?.code, JSON.stringify(await cuenta(noProv)))

  const y = await http(auth, '/sign-up/email', { email: prov, password: 'atacante-12345', name: 'x' })
  console.log('  Y  (A2)  HTTP sign-up email PROVISIONADO    :', JSON.stringify(y), JSON.stringify(await cuenta(prov)))
  const ya: any = await auth.api.signUpEmail({ body: { email: prov, password: 'atacante-98765', name: 'x' } }).catch((e: any) => e)
  console.log('  Y  (A2)  server API sign-up PROVISIONADO    :', ya?.statusCode ?? 'OK', ya?.body?.code, JSON.stringify(await cuenta(prov)))
  const login = await http(auth, '/sign-in/email', { email: prov, password: 'atacante-12345' })
  console.log('  Y  el atacante inicia sesión con su clave    :', JSON.stringify(login), login.hasUser ? '<-- CUENTA TOMADA' : '(sin acceso)')
  await limpiar()
}
await corrida(false)
await corrida(true)
await pool.end()
