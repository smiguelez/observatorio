// Migración 0014 — agrega columnas de domicilio/coordenadas a `vista_unidades_funcionales_detalle`
// (0010, con `localidad_id` ya agregado por 0012), al final de la lista, vía `CREATE OR REPLACE
// VIEW` — ninguna migración aplicada se edita (0010/0012 quedan como estaban).
//
// Para armar el mapa de UF en Looker Studio con el detalle de calle que da `unidades_funcionales`,
// sin exponer datos de contacto de personas (`telefono`/`mail`/`responsable` — la planilla es una
// copia de los datos fuera de Postgres, no entran acá, a propósito):
//
//   - `domicilio_completo`: `domicilio, localidad, provincia` (la provincia DE LA LOCALIDAD de la
//     UF, vía `localidades.provincia_id` — no la del organismo; mismo criterio ya usado para
//     `localidad`/`localidad_id`, aunque en los datos de hoy ambas siempre coinciden, ver 0007/0009).
//     NULL si `domicilio` es NULL **o vacío** (no solo si falta la columna) — un domicilio en blanco
//     no es una dirección real aunque localidad y provincia sí se conozcan.
//   - `latitud_localidad` / `longitud_localidad`: pasan `localidades.latitud`/`longitud` tal cual
//     (ya son `double precision` en el dominio) — el respaldo cuando no hay `domicilio_completo`
//     (una UF sin domicilio cargado todavía tiene la coordenada de su localidad).
//   - `lat_long_localidad`: texto `"lat,long"` — formato que pide el tipo geográfico "Latitud,
//     Longitud" de Looker Studio (una sola columna, no dos).
//
// Verificado contra la base real al escribir esta migración (2026-10-05):
//   - De las 279 filas, 275 tienen `domicilio_completo` no nulo y 4 nulo: la fila del organismo sin
//     ninguna UF (Poder Judicial Misiones) más 3 UF reales sin domicilio utilizable (UF 586, 827 y
//     1035 — `domicilio` NULL o vacío en `unidades_funcionales`).
//   - El resto de 0010/0012 no cambió: 279 filas, 278 UF distintas, 118 organismos distintos,
//     `SUM(jueces_prorrateados) = 1975` (redondeado), `COUNT(DISTINCT localidad_id) = 122`.
//   - `metabase_ro` sigue con `SELECT` sobre la vista (no se le revocó nada).
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // `CREATE OR REPLACE VIEW` no permite QUITAR columnas del final (solo agregar) — hay que volver a
  // crearla desde cero con la definición exacta de 0012, y re-otorgar el grant (DROP VIEW se lleva
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
      loc.id AS localidad_id
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
