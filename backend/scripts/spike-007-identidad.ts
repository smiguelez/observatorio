// SPIKE de `007-identidad-autorizacion` (plan.md, research.md). Valida empíricamente, contra la base real y
// contra better-auth@1.7.5, las preguntas de diseño ANTES de decidir la implementación:
//   A. ¿Un ÚNICO `databaseHooks.user.create.before` (el mecanismo ya usado en 002) puede a la vez RECHAZAR el alta
//      de un email no provisionado —lanzando un APIError— y fijar auth.user.id, por los tres métodos?
//      (Comparado con `user.validateUserInfo` en scripts/spike-007-hook-only.ts y en research.md, Decisión 1.)
//   B. ¿Un token `reset-password:<token>` creado a mano (con vencimiento propio) sirve como "acceso inicial"
//      de un solo uso, incluso para un usuario sin credencial?
//   C. ¿Una contraseña fijada así sobrevive a un ingreso posterior por enlace (FR-020)?
//   D. ¿Se puede forzar `revokeOtherSessions` en el servidor al cambiar la contraseña (FR-018)?
//   E. ¿`disabledPaths` cierra el alta pública por contraseña (FR-004) sin romper la API de servidor?
// Uso: BETTER_AUTH_URL=http://localhost:5173 DATABASE_URL=... BETTER_AUTH_SECRET=... GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x \
//        npx tsx scripts/spike-007-identidad.ts
// Crea datos con prefijo `test-007-spike-` y los borra al empezar y al terminar. No modifica src/.

import pg from 'pg'
import { PostgresDialect } from 'kysely'
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { magicLink } from 'better-auth/plugins'
import { loadPgConfig, loadAuthConfig } from '../src/config/env.js'

const P = 'test-007-spike-'
const ORIGEN = process.env.BETTER_AUTH_URL ?? 'http://localhost:5173'
const pool = new pg.Pool(loadPgConfig())
const resultados: [string, boolean, string][] = []
const check = (caso: string, ok: boolean, detalle = '') => {
  resultados.push([caso, ok, detalle])
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${caso}${detalle ? `  — ${detalle}` : ''}`)
}
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows

async function limpiar() {
  const pat = `${P}%`
  await q(`DELETE FROM auth.session WHERE "userId" IN (SELECT id FROM auth."user" WHERE email LIKE $1)`, [pat])
  await q(`DELETE FROM auth.account WHERE "userId" IN (SELECT id FROM auth."user" WHERE email LIKE $1)`, [pat])
  await q(`DELETE FROM auth.verification WHERE value LIKE $1 OR identifier LIKE $1 OR value IN (SELECT id FROM auth."user" WHERE email LIKE $1)`, [`%${P}%`])
  await q(`DELETE FROM auth."user" WHERE email LIKE $1`, [pat])
  await q(`DELETE FROM usuarios WHERE email LIKE $1`, [pat])
}
const provisionar = async (email: string) =>
  (await q(`INSERT INTO usuarios (email, firestore_id) VALUES ($1,$2) RETURNING id`, [email, email]))[0].id as number
const filas = async (email: string) => ({
  usuarios: (await q(`SELECT count(*)::int n FROM usuarios WHERE email = $1`, [email]))[0].n as number,
  authUser: (await q(`SELECT count(*)::int n FROM auth."user" WHERE email = $1`, [email]))[0].n as number,
  cuentas: (await q(`SELECT count(*)::int n FROM auth.account WHERE "userId" IN (SELECT id FROM auth."user" WHERE email=$1)`, [email]))[0].n as number,
})

const enlaces = new Map<string, string>() // email -> token (lo que haría sendMagicLink)

async function main() {
  await limpiar()
  const cfg = loadAuthConfig()
  const auth = betterAuth({
    secret: cfg.secret,
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth' },
    emailAndPassword: { enabled: true },
    // E: cierra el alta pública por contraseña en el router HTTP (la API de servidor no se ve afectada).
    disabledPaths: ['/sign-up/email'],
    socialProviders: { google: { clientId: 'x', clientSecret: 'x', verifyIdToken: async () => true } },
    plugins: [magicLink({ expiresIn: 300, sendMagicLink: async ({ email, token }) => { enlaces.set(email, token) } })],
    account: { accountLinking: { enabled: true, trustedProviders: ['google'], requireLocalEmailVerified: true } },
    databaseHooks: {
      user: {
        create: {
          // Hook de 002 (Decisión 3), ahora con la compuerta de provisión COMPUESTA en la misma función:
          //   1) email normalizado; 2) si no está en `usuarios` -> se RECHAZA lanzando un APIError con código
          //   (los tres flujos lo traducen: 403 JSON, o redirección a errorCallbackURL con ?error=);
          //   3) si está -> se fija auth.user.id = usuarios.id. Nunca inserta en `usuarios`.
          before: async (user, ctx) => {
            const email = String(user.email ?? '').trim().toLowerCase()
            const r = await q(`SELECT id FROM usuarios WHERE email = $1`, [email])
            if (r.length === 0) {
              throw new APIError('FORBIDDEN', { code: 'ACCESO_NO_AUTORIZADO', message: 'No se pudo iniciar sesión con este email.' })
            }
            console.log(`  [gate] ${ctx?.path} ${email} -> permitido`)
            return { data: { id: String(r[0].id) } }
          },
        },
      },
    },
    // D: forzar en el servidor que cambiar la contraseña cierre las demás sesiones.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/change-password' && ctx.body) ctx.body.revokeOtherSessions = true
      }),
    },
  })

  const llamar = async (metodo: string, ruta: string, cuerpo?: unknown, cookie?: string) => {
    const res = await auth.handler(new Request(`${ORIGEN}/api/auth${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', origin: ORIGEN, ...(cookie ? { cookie } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      redirect: 'manual',
    }))
    const texto = await res.text()
    let json: any
    try { json = texto ? JSON.parse(texto) : undefined } catch { json = texto }
    const sc = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    return { status: res.status, json, cookie: sc, location: res.headers.get('location') }
  }
  const jwt = (email: string) => {
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    return `${b({ alg: 'none', typ: 'JWT' })}.${b({ sub: `g-${email}`, email, email_verified: true, name: 'Prueba' })}.`
  }

  console.log('\n=== A. Compuerta de provisión y fijación de id en UN solo databaseHooks.user.create.before ===')
  // A1 alta pública por contraseña: cerrada por disabledPaths (E) en el router...
  const e1 = await llamar('POST', '/sign-up/email', { email: `${P}a1@example.test`, password: 'contrasena-12345', name: 'x' })
  check('E1 router: POST /sign-up/email con disabledPaths', e1.status === 404, `status ${e1.status}`)
  // ...y aunque se llegara a la API de servidor, la compuerta rechaza el email no provisionado (defensa en profundidad)
  let a1: unknown
  try { await auth.api.signUpEmail({ body: { email: `${P}a1b@example.test`, password: 'contrasena-12345', name: 'x' } }) } catch (e) { a1 = e }
  const a1f = await filas(`${P}a1b@example.test`)
  check('A1 contraseña, NO provisionado: rechazado por la compuerta, 0 filas', !!a1 && a1f.usuarios === 0 && a1f.authUser === 0, `${(a1 as any)?.statusCode} ${(a1 as any)?.body?.code ?? ''} ${(a1 as any)?.body?.message ?? ''}`)
  // A2 contraseña, provisionado (server API): el hook fija el id = usuarios.id (el caso que abría la toma de cuenta)
  const idA2 = await provisionar(`${P}a2@example.test`)
  const a2 = await auth.api.signUpEmail({ body: { email: `${P}a2@example.test`, password: 'contrasena-12345', name: 'x' } }).catch((e: any) => e)
  check('A2 contraseña, provisionado por server API: la compuerta lo PERMITE (por eso E1 es imprescindible)', String((a2 as any)?.user?.id) === String(idA2), `user.id=${(a2 as any)?.user?.id} usuarios.id=${idA2}`)

  // A3 magic link
  await q(`DELETE FROM auth.verification WHERE identifier NOT LIKE 'reset-password:%' AND expiresAt < now() - interval '1 day'`).catch(() => {})
  await llamar('POST', '/sign-in/magic-link', { email: `${P}a3-no@example.test`, callbackURL: '/' , errorCallbackURL: '/login' })
  const tokNo = enlaces.get(`${P}a3-no@example.test`)!
  const v3 = await llamar('GET', `/magic-link/verify?token=${tokNo}&callbackURL=${encodeURIComponent('/')}&errorCallbackURL=${encodeURIComponent('/login')}`)
  const f3 = await filas(`${P}a3-no@example.test`)
  check('A3 enlace, NO provisionado: verify redirige con error y 0 filas', v3.status === 302 && /error=ACCESO_NO_AUTORIZADO/.test(v3.location ?? '') && f3.usuarios === 0 && f3.authUser === 0, `${v3.status} ${v3.location}`)
  const idA4 = await provisionar(`${P}a4@example.test`)
  await llamar('POST', '/sign-in/magic-link', { email: `${P}a4@example.test`, callbackURL: '/' })
  const v4 = await llamar('GET', `/magic-link/verify?token=${enlaces.get(`${P}a4@example.test`)}&callbackURL=${encodeURIComponent('/')}`)
  const u4 = await q(`SELECT id, "emailVerified" FROM auth."user" WHERE email = $1`, [`${P}a4@example.test`])
  check('A4 enlace, provisionado (sin auth.user previo): crea identidad con id = usuarios.id y sesión', v4.status === 302 && String(u4[0]?.id) === String(idA4) && !!v4.cookie, `auth.user.id=${u4[0]?.id} usuarios.id=${idA4} emailVerified=${u4[0]?.emailVerified}`)

  // A5/A6 Google (idToken)
  const g5 = await llamar('POST', '/sign-in/social', { provider: 'google', idToken: { token: jwt(`${P}a5-no@example.test`) } })
  const f5 = await filas(`${P}a5-no@example.test`)
  check('A5 Google, NO provisionado: rechazado y 0 filas', g5.status >= 400 && f5.usuarios === 0 && f5.authUser === 0, `${g5.status} ${JSON.stringify(g5.json)?.slice(0, 120)}`)
  const idA6 = await provisionar(`${P}a6@example.test`)
  const g6 = await llamar('POST', '/sign-in/social', { provider: 'google', idToken: { token: jwt(`${P}a6@example.test`) } })
  const u6 = await q(`SELECT id FROM auth."user" WHERE email = $1`, [`${P}a6@example.test`])
  check('A6 Google, provisionado: entra con id = usuarios.id', g6.status === 200 && String(u6[0]?.id) === String(idA6), `${g6.status} auth.user.id=${u6[0]?.id} usuarios.id=${idA6}`)
  const e7 = await q(`SELECT count(*)::int n FROM usuarios WHERE email LIKE $1`, [`${P}a%`])
  check('A7 ningún intento rechazado dejó filas en usuarios (solo los 3 provisionados a mano)', e7[0].n === 3, `n=${e7[0].n}`)

  console.log('\n=== B/C. Acceso inicial reutilizando el token de reset-password ===')
  const emailB = `${P}b@example.test`
  const idB = await provisionar(emailB)
  // El "alta administrada" crea auth.user (emailVerified=true: el admin avala el email) en la misma transacción que usuarios.
  await q(`INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1,$2,$3,true,now(),now())`, [String(idB), 'B', emailB])
  const ctx = await auth.$context
  const emitir = async (segundos: number, userId: string) => {
    const token = `tok-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
    await ctx.internalAdapter.createVerificationValue({ identifier: `reset-password:${token}`, value: userId, expiresAt: new Date(Date.now() + segundos * 1000) })
    return token
  }
  const tOk = await emitir(24 * 3600, String(idB))
  const b1 = await llamar('POST', '/reset-password', { token: tOk, newPassword: 'primera-contrasena-1' })
  const cuentasB = (await filas(emailB)).cuentas
  check('B1 canjear el token fija la contraseña de un usuario SIN credencial (crea la cuenta credential)', b1.status === 200 && cuentasB === 1, `${b1.status} cuentas=${cuentasB}`)
  const b2 = await llamar('POST', '/reset-password', { token: tOk, newPassword: 'segunda-contrasena-2' })
  check('B2 el mismo token no sirve dos veces', b2.status === 400, `${b2.status} ${b2.json?.code}`)
  const tVenc = await emitir(-5, String(idB))
  const b3 = await llamar('POST', '/reset-password', { token: tVenc, newPassword: 'tercera-contrasena-3' })
  check('B3 un token vencido no sirve', b3.status === 400, `${b3.status} ${b3.json?.code}`)
  const tRace = await emitir(3600, String(idB))
  const [r1, r2] = (await Promise.all([1, 2].map((n) => llamar('POST', '/reset-password', { token: tRace, newPassword: `carrera-contrasena-${n}${n}` })))) as [Awaited<ReturnType<typeof llamar>>, Awaited<ReturnType<typeof llamar>>]
  check('B4 dos canjes simultáneos: exactamente uno tiene efecto', [r1.status, r2.status].sort().join() === '200,400', `${r1.status},${r2.status}`)
  const b5 = await llamar('POST', '/sign-in/email', { email: emailB, password: 'primera-contrasena-1' })
  const b5b = await llamar('POST', '/sign-in/email', { email: emailB, password: 'carrera-contrasena-11' })
  const b5c = await llamar('POST', '/sign-in/email', { email: emailB, password: 'carrera-contrasena-22' })
  check('B5 tras los canjes, ingresa con la contraseña que ganó la carrera (y no con la primera)', b5.status !== 200 && [b5b.status, b5c.status].sort().join() === '200,401', `primera=${b5.status} c1=${b5b.status} c2=${b5c.status}`)
  const tCorta = await emitir(3600, String(idB))
  const b6 = await llamar('POST', '/reset-password', { token: tCorta, newPassword: 'corta' })
  check('B6 la política mínima de contraseña también aplica al canje', b6.status === 400, `${b6.status} ${b6.json?.code}`)
  const c1 = await llamar('POST', '/sign-in/magic-link', { email: emailB, callbackURL: '/' })
  const cv = await llamar('GET', `/magic-link/verify?token=${enlaces.get(emailB)}&callbackURL=${encodeURIComponent('/')}`)
  const cuentasC = (await filas(emailB)).cuentas
  check('C1 (FR-020) ingresar luego por enlace NO borra la contraseña (emailVerified=true)', cv.status === 302 && !!cv.cookie && cuentasC === 1, `${cv.status} cuentas=${cuentasC} ${c1.status}`)
  // contraste: el comportamiento que se quiere EVITAR (auth.user con emailVerified=false)
  const emailC = `${P}c@example.test`
  const idC = await provisionar(emailC)
  await q(`INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1,$2,$3,false,now(),now())`, [String(idC), 'C', emailC])
  await ctx.internalAdapter.createAccount({ userId: String(idC), providerId: 'credential', accountId: String(idC), password: await ctx.password.hash('contrasena-c-1234') })
  await llamar('POST', '/sign-in/magic-link', { email: emailC, callbackURL: '/' })
  await llamar('GET', `/magic-link/verify?token=${enlaces.get(emailC)}&callbackURL=${encodeURIComponent('/')}`)
  check('C2 contraste: con emailVerified=false el enlace SÍ borra la contraseña (lo que hay que evitar)', (await filas(emailC)).cuentas === 0, `cuentas=${(await filas(emailC)).cuentas}`)

  console.log('\n=== D. Cambio de contraseña cierra las demás sesiones (forzado en servidor) ===')
  const emailD = `${P}d@example.test`
  const idD = await provisionar(emailD)
  await q(`INSERT INTO auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1,$2,$3,true,now(),now())`, [String(idD), 'D', emailD])
  await ctx.internalAdapter.createAccount({ userId: String(idD), providerId: 'credential', accountId: String(idD), password: await ctx.password.hash('contrasena-d-1234') })
  const s1 = await llamar('POST', '/sign-in/email', { email: emailD, password: 'contrasena-d-1234' })
  const s2 = await llamar('POST', '/sign-in/email', { email: emailD, password: 'contrasena-d-1234' })
  const d1 = await llamar('POST', '/change-password', { currentPassword: 'contrasena-d-1234', newPassword: 'contrasena-d-nueva-5678' }, s1.cookie)
  // Con revokeOtherSessions Better Auth revoca TODAS, crea una sesión nueva y la entrega en Set-Cookie: la "actual" es la nueva.
  const g1 = await llamar('GET', '/get-session', undefined, d1.cookie)
  const g1vieja = await llamar('GET', '/get-session', undefined, s1.cookie)
  const g2 = await llamar('GET', '/get-session', undefined, s2.cookie)
  check('D1 el cambio (sin pedir revokeOtherSessions) deja activa la sesión actual y cierra la otra', d1.status === 200 && !!g1.json?.user && !g2.json?.user, `cambio=${d1.status} actual(nueva cookie)=${!!g1.json?.user} cookie previa=${!!g1vieja.json?.user} otra=${!!g2.json?.user}`)
  const d2 = await llamar('POST', '/sign-in/email', { email: emailD, password: 'contrasena-d-1234' })
  check('D2 la contraseña anterior deja de servir', d2.status === 401, `${d2.status}`)

  console.log('\n=== E2. emailAndPassword.disableSignUp (alternativa a disabledPaths) ===')
  const auth2 = betterAuth({
    secret: cfg.secret,
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth' },
    emailAndPassword: { enabled: true, disableSignUp: true },
  })
  const idE2 = await provisionar(`${P}e2@example.test`)
  const viaHttp = await auth2.handler(new Request(`${ORIGEN}/api/auth/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGEN }, body: JSON.stringify({ email: `${P}e2@example.test`, password: 'contrasena-12345', name: 'x' }) }))
  const viaApi: any = await auth2.api.signUpEmail({ body: { email: `${P}e2@example.test`, password: 'contrasena-12345', name: 'x' } }).catch((e: any) => e)
  check('E2 disableSignUp cierra el alta por HTTP Y por la API de servidor (aun con email provisionado)', viaHttp.status >= 400 && !!viaApi?.statusCode && (await filas(`${P}e2@example.test`)).authUser === 0, `http=${viaHttp.status} api=${viaApi?.statusCode} ${viaApi?.body?.code ?? ''} (usuarios.id=${idE2})`)

  console.log('\n=== Resumen ===')
  const fallos = resultados.filter((r) => !r[1])
  console.log(`${resultados.length - fallos.length}/${resultados.length} casos PASS`)
  if (fallos.length) console.log('FALLARON:', fallos.map((f) => f[0]).join(' | '))
}

main()
  .catch((e) => { console.error('SPIKE ERROR', e) })
  .finally(async () => { await limpiar(); const r = await q(`SELECT count(*)::int n FROM usuarios WHERE email LIKE $1`, [`${P}%`]); console.log('filas de prueba restantes:', r[0].n); await pool.end() })
