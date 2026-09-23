// T003 (Foundational, 003-taxonomia-parametrizable): corredor de
// migraciones versionadas para public.* — primera vez que este proyecto
// tiene una (research.md Decisión 1: Migrator + FileMigrationProvider de
// Kysely, ya dependencia directa del backend, sin paquete nuevo). Separado
// del mecanismo de auth.* (migrate-auth.ts, que usa el motor interno de
// Better Auth) — dos esquemas, dos dueños, dos corredores.
//
// migrationTableSchema: 'migrations' — corrección menor (research.md
// Decisión 1, actualización 2026-09-22): sin esto, el Migrator crea sus
// dos tablas de tracking (kysely_migration/kysely_migration_lock) en
// public por default, mezcladas con las tablas de dominio. Mismo criterio
// que auth.* (esquema propio para infraestructura, no domain data).
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FileMigrationProvider, Migrator } from 'kysely'
import { getPublicKysely } from '../src/db/kysely.js'
import { closePgPool } from '../src/db/pool.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const db = getPublicKysely()
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, '..', 'migrations'),
    }),
    migrationTableSchema: 'migrations',
  })

  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`[migrate:public] "${it.migrationName}" ejecutada correctamente`)
    } else if (it.status === 'Error') {
      console.error(`[migrate:public] "${it.migrationName}" FALLÓ`)
    } else {
      console.log(`[migrate:public] "${it.migrationName}" no se ejecutó (${it.status})`)
    }
  })

  if (error) {
    console.error('[migrate:public] ERROR al correr las migraciones:')
    console.error(error)
    process.exitCode = 1
  } else if (!results || results.length === 0) {
    console.log('[migrate:public] Nada que migrar — public.* ya está al día.')
  } else {
    console.log('[migrate:public] Listo.')
  }
}

main()
  .catch((err) => {
    console.error('[migrate:public] ERROR inesperado:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePgPool()
  })
