// Migración 0013 — da de baja las 4 vistas agregadas viejas del dashboard 1, ahora que el
// dashboard nuevo (sobre las vistas de detalle: vista_organismos_detalle, vista_jueces_por_grupo,
// vista_unidades_funcionales_detalle, vista_usuarios_por_provincia) lo reemplaza por completo.
// `vista_kpis_generales` (0005) y `vista_organismos_por_tipo`/`vista_organismos_por_fuero`/
// `vista_organismos_por_provincia` (0005, borradas y restauradas por 0007/0008) ya no hacen falta.
//
// `config.ts` (scripts/reportes-sheets/) ya no las sincroniza — se sacaron de la lista de reportes
// en el mismo cambio que esta migración, no antes (mientras existieran en Postgres pero no en
// config.ts, el script simplemente no las habría tocado más, dejándolas con datos viejos
// congelados; mejor borrarlas de una vez).
//
// Las PESTAÑAS correspondientes en la planilla de Google Sheets ("KPIs generales", "Organismos por
// tipo", "Organismos por fuero", "Organismos por provincia") NO se borran solas — el script de
// sincronización nunca borra una pestaña (no decide qué vistas existen). Quedan en la planilla con
// los últimos datos que tenían; borrarlas a mano es un paso aparte, fuera de esta migración.
//
// down(): recrea las 4 vistas tal como estaban (mismo texto que 0005/0008) y vuelve a otorgarles
// SELECT a metabase_ro (DROP VIEW se lleva los permisos existentes).
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
  for (const vista of VISTAS) {
    await sql`DROP VIEW IF EXISTS ${sql.ref(vista)}`.execute(db)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE VIEW vista_kpis_generales AS
    SELECT
      (SELECT count(DISTINCT provincia_id) FROM organismos) AS provincias_con_organismo,
      (SELECT count(DISTINCT localidad_id) FROM unidades_funcionales) AS localidades_con_organismo,
      (SELECT count(*) FROM usuarios) AS usuarios,
      (SELECT count(*) FROM organismos) AS organismos,
      (SELECT count(*) FROM unidades_funcionales) AS unidades_funcionales,
      (SELECT COALESCE(SUM(g.total_jueces), 0)
         FROM grupos_jueces g
        WHERE EXISTS (SELECT 1 FROM unidad_funcional_grupo_jueces u WHERE u.grupo_jueces_id = g.id)
      ) AS jueces_asistidos
  `.execute(db)

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
