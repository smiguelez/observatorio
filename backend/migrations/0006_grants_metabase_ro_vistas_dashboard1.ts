// Migración 0006 — falta corregida de 0005: `metabase_ro` (el rol de solo lectura que ya usa
// Metabase, D21 en docs/decisiones-pendientes.md) tiene permisos otorgados POR OBJETO, no un
// `GRANT ... ON ALL TABLES IN SCHEMA` ni una `ALTER DEFAULT PRIVILEGES` (verificado: 0 filas en
// default privileges para el esquema) — cada tabla/vista existente recibió su propio `GRANT SELECT`
// cuando se configuró el rol, y las 4 vistas que agregó 0005 nunca lo recibieron. Encontrado al
// correr de verdad `scripts/reportes-sheets/sincronizar.ts` (Fase D): "permission denied for view
// vista_kpis_generales" con la conexión real de `metabase_ro`.
//
// 0005 ya está aplicada: no se edita (convención de este proyecto, ver comentario de 0004) — se
// corrige acá, en una migración nueva.
//
// El `GRANT` es CONDICIONAL: `metabase_ro` lo crea un script aparte, no una migración de este
// runner — en un ambiente nuevo donde las migraciones corran ANTES de que el rol exista, un `GRANT`
// incondicional rompería la migración entera por "el rol no existe". Si el rol todavía no existe
// acá, no hay nada que otorgar todavía (y no hace falta: nadie sin el rol puede pedir el permiso).
import { Kysely, sql } from 'kysely'

const VISTAS = [
  'vista_kpis_generales',
  'vista_organismos_por_tipo',
  'vista_organismos_por_fuero',
  'vista_organismos_por_provincia',
]

async function existeRolMetabaseRo(db: Kysely<unknown>): Promise<boolean> {
  const { rows } = await sql<{ existe: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_ro') AS existe
  `.execute(db)
  return rows[0]?.existe ?? false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  if (!(await existeRolMetabaseRo(db))) return
  for (const vista of VISTAS) {
    await sql`GRANT SELECT ON ${sql.ref(vista)} TO metabase_ro`.execute(db)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  if (!(await existeRolMetabaseRo(db))) return
  for (const vista of VISTAS) {
    await sql`REVOKE SELECT ON ${sql.ref(vista)} FROM metabase_ro`.execute(db)
  }
}
