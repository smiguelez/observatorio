// Migración 0012 — agrega `localidad_id` a `vista_unidades_funcionales_detalle` (0010), al final de
// la lista de columnas, vía `CREATE OR REPLACE VIEW` (0010 ya está aplicada: no se edita). Postgres
// permite esto porque las columnas existentes no cambian de posición ni de tipo — igual criterio
// que ya usó 0009 para `jueces_contables`.
//
// Por qué hace falta: la vista ya traía `localidad` (el NOMBRE, vía `loc.nombre`), pero el nombre de
// una localidad no es único en el país — hay varias "Mercedes", "Santa Rosa", "San Martín" en
// provincias distintas. Agrupar o contar por el nombre de columna `localidad` sobrecuenta o
// subcuenta: dos localidades homónimas en provincias distintas aparecerían como una sola categoría
// en un gráfico de Looker Studio que agrupe por ese campo. `localidad_id` es la clave real
// (`localidades.id`) — agrupar o contar por ahí da el número correcto, igual que ya hace
// `vista_kpis_generales.localidades_con_organismo` (que cuenta por `localidad_id`, no por nombre).
//
// Verificado contra la base real al escribir esta migración (2026-10-04):
//   - COUNT(DISTINCT localidad_id) = 122, igual a `vista_kpis_generales.localidades_con_organismo`.
//   - El resto de 0010 no cambió: 279 filas, 278 UF distintas, 118 organismos distintos,
//     SUM(jueces_prorrateados) = 1975 redondeado (mismo resto de precisión de `numeric` ya
//     documentado en 0010 — agregar una columna no afecta esa cuenta).
//   - `metabase_ro` sigue con SELECT sobre la vista (`CREATE OR REPLACE VIEW` no le quita permisos
//     a un rol que ya los tenía sobre el nombre de vista).
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // `CREATE OR REPLACE VIEW` no permite QUITAR una columna del final (solo agregar) — hay que
  // volver a crearla desde cero con la definición exacta de 0010, y re-otorgar el grant (DROP VIEW
  // se lleva los permisos existentes).
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
      END AS jueces_prorrateados
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
