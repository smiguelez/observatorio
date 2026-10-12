// Migración 0016 — corrige 4 nombres de provincia que `db/seeds/01_provincias.sql` sembraba
// distintos de como están en la base real hoy (corregidos a mano por `psql`, nunca capturados en
// ningún script — ver docs/runbook-corte-produccion.md, "Cambios manuales en la base fuera de
// migraciones"). `UPDATE` por `id`, no por nombre — el id es estable, el nombre es justo lo que
// cambia.
//
// NO se tocan los seeds: `db/seeds/01_provincias.sql` sigue sembrando los nombres viejos a
// propósito. Verificado (2026-10-12) que `migration/` (la herramienta Firestore→Postgres) cruza
// provincias por NOMBRE, no por id (`buildNameIdMap(client, 'provincias')` en
// `migration/src/load/{localidades,grupos-jueces,organismos,usuarios}.js`, contra el string
// `data.provincia` que viene de Firestore) — si los seeds tuvieran ya el nombre corregido, esa
// herramienta fallaría con "provincia desconocida" en cada organismo/localidad/usuario/grupo de
// estas 4 provincias, porque Firestore sigue teniendo el nombre viejo. Por eso esta corrección va
// ACÁ, en una migración Kysely — que en el orden real de reconstrucción (ver el runbook) corre
// DESPUÉS de `migration/` (paso 4, después del paso 3) — nunca en los seeds (paso 2, antes del
// paso 3).
//
// Mapeo (id → nombre viejo del seed → nombre corregido):
//   2  | "CABA"             → "Ciudad Autónoma de Buenos Aires"
//   8  | "Entre Rios"       → "Entre Ríos"
//   16 | "Rio Negro"        → "Río Negro"
//   23 | "Tierra del Fuego" → "Tierra del Fuego, Antártida e Islas del Atlántico Sur"
//
// Idempotente: el `UPDATE` siempre fija el mismo valor final, sin importar cuántas veces corra. En
// la base real es un no-op (ya tiene estos 4 nombres corregidos).
import { Kysely, sql } from 'kysely'

const NOMBRES_NUEVOS: [number, string][] = [
  [2, 'Ciudad Autónoma de Buenos Aires'],
  [8, 'Entre Ríos'],
  [16, 'Río Negro'],
  [23, 'Tierra del Fuego, Antártida e Islas del Atlántico Sur'],
]

const NOMBRES_VIEJOS: [number, string][] = [
  [2, 'CABA'],
  [8, 'Entre Rios'],
  [16, 'Rio Negro'],
  [23, 'Tierra del Fuego'],
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  for (const [id, nombre] of NOMBRES_NUEVOS) {
    await sql`UPDATE provincias SET nombre = ${nombre} WHERE id = ${id}`.execute(db)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const [id, nombre] of NOMBRES_VIEJOS) {
    await sql`UPDATE provincias SET nombre = ${nombre} WHERE id = ${id}`.execute(db)
  }
}
