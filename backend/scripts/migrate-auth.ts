// Migración del esquema `auth.*` por la vía oficial (research.md Decisión 3,
// actualización 2026-09-19): getMigrations/runMigrations de
// better-auth/db/migration, NO @better-auth/cli (deprecado, y depende de
// better-sqlite3 — build nativo que puede fallar según el entorno, como
// ocurrió acá por falta de `make`). Mismo motor que usaría el CLI si
// funcionara, sin esa dependencia.
//
// Uso: `npm run migrate:auth` (backend/package.json). Idempotente: solo
// crea lo que falta (toBeCreated/toBeAdded), no repite lo que ya existe.

import { getMigrations } from 'better-auth/db/migration'
import { auth } from '../src/auth/index.js'
import { closePgPool } from '../src/db/pool.js'

async function main() {
  const { toBeCreated, toBeAdded, runMigrations, compileMigrations } = await getMigrations(auth.options)

  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    console.log('[migrate:auth] Nada que migrar — el esquema auth.* ya está al día.')
    return
  }

  console.log('[migrate:auth] Tablas a crear:', toBeCreated.map((t) => t.table))
  console.log('[migrate:auth] Columnas a agregar:', toBeAdded)
  console.log('\n[migrate:auth] SQL a ejecutar:\n')
  console.log(await compileMigrations())

  await runMigrations()
  console.log('\n[migrate:auth] Listo.')
}

main()
  .catch((err) => {
    console.error('[migrate:auth] ERROR:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    // auth/index.ts instancia el pool vía getPgPool() (singleton,
    // backend/src/db/pool.ts) — es el mismo que usó esta migración.
    await closePgPool()
  })
