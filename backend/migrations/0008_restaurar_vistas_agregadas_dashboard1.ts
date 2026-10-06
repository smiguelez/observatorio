// Migración 0008 — corrige el alcance de 0007 (0007 ya está aplicada: no se edita, convención de
// este proyecto, ver comentario de 0004/0006).
//
// 0007 agregó `vista_organismos_detalle` / `vista_jueces_por_grupo` (correcto, se mantienen) pero
// de paso ELIMINÓ `vista_organismos_por_tipo`, `vista_organismos_por_fuero` y
// `vista_organismos_por_provincia` — error: esas tres siguen activas, conectadas al reporte de
// Looker Studio ACTUAL (el que se va a reemplazar, no el que ya está reemplazado). Hasta que el
// dashboard nuevo (con filtros cruzados, sobre las vistas de detalle) esté terminado y reemplace
// por completo al actual, ambos conjuntos de vistas tienen que convivir. Esta migración las
// recrea tal cual estaban en 0005 — mismo texto, no una versión nueva — y vuelve a otorgarles
// `SELECT` a `metabase_ro` (0007 se lo había revocado al borrarlas).
//
// Las vistas agregadas viejas se eliminarán en una tarea aparte, cuando el dashboard nuevo esté
// listo y el actual se dé de baja — no en esta migración.
import { Kysely, sql } from 'kysely'

const VISTAS = ['vista_organismos_por_tipo', 'vista_organismos_por_fuero', 'vista_organismos_por_provincia']

async function existeRolMetabaseRo(db: Kysely<unknown>): Promise<boolean> {
  const { rows } = await sql<{ existe: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_ro') AS existe
  `.execute(db)
  return rows[0]?.existe ?? false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE VIEW vista_organismos_por_tipo AS
    SELECT t.id AS tipo_oficina_id, t.nombre AS tipo_oficina, count(o.id) AS organismos
      FROM tipos_oficina t
      LEFT JOIN organismos o ON o.tipo_oficina_id = t.id
     GROUP BY t.id, t.nombre
     ORDER BY t.id
  `.execute(db)

  await sql`
    CREATE VIEW vista_organismos_por_fuero AS
    SELECT vfs.fuero_simplificado, count(*) AS organismos
      FROM vista_fuero_simplificado vfs
     GROUP BY vfs.fuero_simplificado
     ORDER BY vfs.fuero_simplificado NULLS LAST
  `.execute(db)

  await sql`
    CREATE VIEW vista_organismos_por_provincia AS
    SELECT p.id AS provincia_id, p.nombre AS provincia, p.codigo_iso, count(o.id) AS organismos
      FROM provincias p
      LEFT JOIN organismos o ON o.provincia_id = p.id
     GROUP BY p.id, p.nombre, p.codigo_iso
     ORDER BY p.nombre
  `.execute(db)

  if (await existeRolMetabaseRo(db)) {
    for (const vista of VISTAS) {
      await sql`GRANT SELECT ON ${sql.ref(vista)} TO metabase_ro`.execute(db)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  if (await existeRolMetabaseRo(db)) {
    for (const vista of VISTAS) {
      await sql`REVOKE SELECT ON ${sql.ref(vista)} FROM metabase_ro`.execute(db)
    }
  }
  for (const vista of VISTAS) {
    await sql`DROP VIEW IF EXISTS ${sql.ref(vista)}`.execute(db)
  }
}
