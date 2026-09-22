// T002 (Foundational, 003-taxonomia-parametrizable): instancia Kysely para
// public.* — SOLO para correr migraciones versionadas (Migrator, T003).
// Separada de la instancia Kysely interna de Better Auth (auth/index.ts),
// que apunta a schemaName: 'auth'. El código de aplicación (rutas de
// 002-backend-api-carga-datos) sigue usando `pg` directo — research.md de
// esa feature, Decisión 6 — esta instancia no se usa para queries de
// negocio, solo para DDL versionado.
import { Kysely, PostgresDialect } from 'kysely'
import { getPgPool } from './pool.js'

// `any` es el tipo que la propia documentación de Kysely usa para una
// instancia dedicada a migraciones (no a queries tipadas de negocio).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: Kysely<any> | undefined

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPublicKysely(): Kysely<any> {
  if (!db) {
    db = new Kysely({
      dialect: new PostgresDialect({ pool: getPgPool() }),
    })
  }
  return db
}
