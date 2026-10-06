// Migración 0015 — agrega `denominacion_simplificada` a `vista_unidades_funcionales_detalle`
// (0010, con `localidad_id` de 0012 y domicilio/coordenadas de 0014), al final de la lista, vía
// `CREATE OR REPLACE VIEW` — ninguna migración aplicada se edita (0010/0012/0014 quedan como
// estaban).
//
// `denominacion_simplificada`: el nombre del catálogo `denominaciones_simplificadas` al que
// apunta `organismos.denominacion_simplificada_id` (FK `NOT NULL` en el dominio — todo organismo
// tiene una). La base de la vista es `organismos`, así que toda fila tiene organismo — esta
// columna solo podría dar NULL si algún organismo quedara sin `denominacion_simplificada_id`
// resuelto, algo que la constraint `NOT NULL` del dominio no permite hoy.
import { Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE OR REPLACE VIEW vista_unidades_funcionales_detalle AS
    WITH ufs_por_grupo AS (
      SELECT grupo_jueces_id, count(DISTINCT unidad_funcional_id) AS ufs_del_grupo
        FROM unidad_funcional_grupo_jueces
       GROUP BY grupo_jueces_id
    )
    SELECT
      o.id AS organismo_id,
      o.denominacion AS organismo,
      t.nombre AS tipo_oficina,
      vfs.fuero_simplificado,
      p.nombre AS provincia,
      p.codigo_iso,
      uf.id AS unidad_funcional_id,
      uf.denominacion_unidad,
      tuf.nombre AS tipo_uf,
      loc.nombre AS localidad,
      g.id AS grupo_jueces_id,
      g.total_jueces,
      ufg_count.ufs_del_grupo,
      CASE
        WHEN ufg.id IS NULL THEN 0
        ELSE g.total_jueces::numeric / ufg_count.ufs_del_grupo
      END AS jueces_prorrateados,
      loc.id AS localidad_id,
      CASE
        WHEN uf.domicilio IS NULL OR btrim(uf.domicilio) = '' THEN NULL
        ELSE uf.domicilio || ', ' || loc.nombre || ', ' || p_loc.nombre
      END AS domicilio_completo,
      loc.latitud AS latitud_localidad,
      loc.longitud AS longitud_localidad,
      CASE
        WHEN loc.id IS NULL THEN NULL
        ELSE loc.latitud::text || ',' || loc.longitud::text
      END AS lat_long_localidad,
      ds.nombre AS denominacion_simplificada
      FROM organismos o
      LEFT JOIN unidades_funcionales uf ON uf.organismo_id = o.id
      LEFT JOIN unidad_funcional_grupo_jueces ufg ON ufg.unidad_funcional_id = uf.id
      LEFT JOIN grupos_jueces g ON g.id = ufg.grupo_jueces_id
      LEFT JOIN ufs_por_grupo ufg_count ON ufg_count.grupo_jueces_id = g.id
      LEFT JOIN tipos_oficina t ON t.id = o.tipo_oficina_id
      LEFT JOIN vista_fuero_simplificado vfs ON vfs.organismo_id = o.id
      LEFT JOIN provincias p ON p.id = o.provincia_id
      LEFT JOIN tipos_uf tuf ON tuf.id = uf.tipo_uf_id
      LEFT JOIN localidades loc ON loc.id = uf.localidad_id
      LEFT JOIN provincias p_loc ON p_loc.id = loc.provincia_id
      LEFT JOIN denominaciones_simplificadas ds ON ds.id = o.denominacion_simplificada_id
     ORDER BY o.id, uf.id, g.id
  `.execute(db)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // `CREATE OR REPLACE VIEW` no permite QUITAR columnas del final (solo agregar) — hay que volver a
  // crearla desde cero con la definición exacta de 0014, y re-otorgar el grant (DROP VIEW se lleva
  // los permisos existentes).
  await sql`DROP VIEW vista_unidades_funcionales_detalle`.execute(db)
  await sql`
    CREATE VIEW vista_unidades_funcionales_detalle AS
    WITH ufs_por_grupo AS (
      SELECT grupo_jueces_id, count(DISTINCT unidad_funcional_id) AS ufs_del_grupo
        FROM unidad_funcional_grupo_jueces
       GROUP BY grupo_jueces_id
    )
    SELECT
      o.id AS organismo_id,
      o.denominacion AS organismo,
      t.nombre AS tipo_oficina,
      vfs.fuero_simplificado,
      p.nombre AS provincia,
      p.codigo_iso,
      uf.id AS unidad_funcional_id,
      uf.denominacion_unidad,
      tuf.nombre AS tipo_uf,
      loc.nombre AS localidad,
      g.id AS grupo_jueces_id,
      g.total_jueces,
      ufg_count.ufs_del_grupo,
      CASE
        WHEN ufg.id IS NULL THEN 0
        ELSE g.total_jueces::numeric / ufg_count.ufs_del_grupo
      END AS jueces_prorrateados,
      loc.id AS localidad_id,
      CASE
        WHEN uf.domicilio IS NULL OR btrim(uf.domicilio) = '' THEN NULL
        ELSE uf.domicilio || ', ' || loc.nombre || ', ' || p_loc.nombre
      END AS domicilio_completo,
      loc.latitud AS latitud_localidad,
      loc.longitud AS longitud_localidad,
      CASE
        WHEN loc.id IS NULL THEN NULL
        ELSE loc.latitud::text || ',' || loc.longitud::text
      END AS lat_long_localidad
      FROM organismos o
      LEFT JOIN unidades_funcionales uf ON uf.organismo_id = o.id
      LEFT JOIN unidad_funcional_grupo_jueces ufg ON ufg.unidad_funcional_id = uf.id
      LEFT JOIN grupos_jueces g ON g.id = ufg.grupo_jueces_id
      LEFT JOIN ufs_por_grupo ufg_count ON ufg_count.grupo_jueces_id = g.id
      LEFT JOIN tipos_oficina t ON t.id = o.tipo_oficina_id
      LEFT JOIN vista_fuero_simplificado vfs ON vfs.organismo_id = o.id
      LEFT JOIN provincias p ON p.id = o.provincia_id
      LEFT JOIN tipos_uf tuf ON tuf.id = uf.tipo_uf_id
      LEFT JOIN localidades loc ON loc.id = uf.localidad_id
      LEFT JOIN provincias p_loc ON p_loc.id = loc.provincia_id
     ORDER BY o.id, uf.id, g.id
  `.execute(db)

  if (await existeRolMetabaseRo(db)) {
    await sql`GRANT SELECT ON vista_unidades_funcionales_detalle TO metabase_ro`.execute(db)
  }
}

async function existeRolMetabaseRo(db: Kysely<unknown>): Promise<boolean> {
  const { rows } = await sql<{ existe: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_ro') AS existe
  `.execute(db)
  return rows[0]?.existe ?? false
}
