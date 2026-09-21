// T007 — SPIKE (Principio V, gate crítico de plan.md). Valida empíricamente,
// contra la base real, que databaseHooks.user.create.before de Better Auth
// permite fijar auth.user.id = String(public.usuarios.id) en vez del id que
// la librería generaría por default (research.md, Decisión 3).
//
// Deja evidencia real (no un resumen): imprime la fila creada en auth.user y
// la fila resuelta en public.usuarios, y limpia los datos de prueba al final.

import pg from 'pg'
import { Kysely, PostgresDialect } from 'kysely'
import { betterAuth } from 'better-auth'
import { loadPgConfig, loadAuthConfig } from '../src/config/env.js'

const EMAIL_PRUEBA = 'spike-identidad@example.observatorio.test'
const FIRESTORE_ID_PRUEBA = 'spike-identidad-test'

async function main() {
  const pool = new pg.Pool(loadPgConfig())
  const authConfig = loadAuthConfig()

  const dialect = new PostgresDialect({ pool })

  const auth = betterAuth({
    secret: authConfig.secret,
    database: { dialect, type: 'postgres', schemaName: 'auth' },
    emailAndPassword: { enabled: true },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const client = await pool.connect()
            try {
              const existing = await client.query(
                'SELECT id FROM usuarios WHERE email = $1',
                [user.email],
              )
              let usuarioId: number
              if (existing.rows.length > 0) {
                usuarioId = existing.rows[0].id
                console.log(`[spike] usuarios.id ya existía para ${user.email}: ${usuarioId}`)
              } else {
                const inserted = await client.query(
                  `INSERT INTO usuarios (email, firestore_id) VALUES ($1, $2) RETURNING id`,
                  [user.email, FIRESTORE_ID_PRUEBA],
                )
                usuarioId = inserted.rows[0].id
                console.log(`[spike] usuarios.id creado para ${user.email}: ${usuarioId}`)
              }
              console.log(`[spike] hook user.create.before devuelve { data: { id: '${String(usuarioId)}' } }`)
              return { data: { id: String(usuarioId) } }
            } finally {
              client.release()
            }
          },
        },
      },
    },
  })

  console.log('\n[spike] Llamando a auth.api.signUpEmail (flujo real de alta, no una llamada interna sintética)...')
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: EMAIL_PRUEBA,
      password: 'contrasena-de-spike-12345',
      name: 'Usuario de prueba (spike identidad)',
    },
  })
  console.log('[spike] Resultado de signUpEmail:', JSON.stringify(signUpResult, null, 2))

  // Evidencia real: leer directamente de las tablas, no confiar solo en la
  // respuesta de la API.
  const authUserRow = await pool.query(
    'SELECT id, email, "createdAt" FROM auth."user" WHERE email = $1',
    [EMAIL_PRUEBA],
  )
  const usuariosRow = await pool.query(
    'SELECT id, email, firestore_id FROM usuarios WHERE email = $1',
    [EMAIL_PRUEBA],
  )

  console.log('\n=== EVIDENCIA: fila real en auth."user" ===')
  console.table(authUserRow.rows)
  console.log('=== EVIDENCIA: fila real en public.usuarios ===')
  console.table(usuariosRow.rows)

  const authUserId = authUserRow.rows[0]?.id
  const usuariosId = usuariosRow.rows[0]?.id

  const coincide = authUserId !== undefined && String(usuariosId) === String(authUserId)

  console.log(`\n[spike] auth."user".id = ${JSON.stringify(authUserId)}`)
  console.log(`[spike] String(public.usuarios.id) = ${JSON.stringify(String(usuariosId))}`)
  console.log(`\n[spike] RESULTADO: ${coincide ? 'GO — coinciden, el hook fija el id correctamente' : 'NO-GO — NO coinciden'}`)

  // Limpieza: esto es un spike, no debe dejar datos de prueba en la base real.
  await pool.query('DELETE FROM auth.session WHERE "userId" = $1', [authUserId])
  await pool.query('DELETE FROM auth.account WHERE "userId" = $1', [authUserId])
  await pool.query('DELETE FROM auth."user" WHERE email = $1', [EMAIL_PRUEBA])
  await pool.query('DELETE FROM usuarios WHERE email = $1', [EMAIL_PRUEBA])
  console.log('\n[spike] Limpieza: filas de prueba eliminadas de auth.* y public.usuarios.')

  await pool.end()
  process.exit(coincide ? 0 : 1)
}

main().catch((err) => {
  console.error('[spike] ERROR:', err)
  process.exit(2)
})
