// Migración 0010 — vista de detalle a nivel de UNIDAD FUNCIONAL, para dashboards donde todo filtra
// por UF/organismo/provincia (a diferencia de `vista_jueces_por_grupo`, pensada para filtrar por
// organismo/UF pero con el valor real a nivel de grupo — ver docs/runbook-reportes-sheets.md,
// "Patrón: mandar detalle, no agregado", sección de este modelo).
//
// Granularidad: una fila por (unidad funcional, asignación a grupo de jueces). Base con DOS
// `LEFT JOIN` encadenados, a propósito, para que nada desaparezca:
//   organismos LEFT JOIN unidades_funcionales LEFT JOIN unidad_funcional_grupo_jueces
// — un organismo sin ninguna UF aparece una vez (UF nula); una UF sin ninguna asignación de jueces
// aparece una vez (grupo nulo, jueces_prorrateados = 0).
//
// `jueces_prorrateados`: la alternativa a `jueces_contables` (0009) para este modelo. Mismo
// problema de fondo (D8/FR-018e: un grupo compartido entre varias UF no se puede sumar a lo bruto
// sin sobrecontar) pero otra solución — en vez de concentrar el total completo en UNA fila
// "contable" y poner 0 en el resto (0009, pensado para filtrar solo por organismo/provincia),
// acá el total de cada grupo se reparte en partes IGUALES entre las UF DISTINTAS que lo usan
// (`total_jueces / ufs_del_grupo`, sin ponderar por `cantidad_asignada` — una UF con una asignación
// chica no "merece" menos que una con una asignación grande, a los fines de este reparto). Esto
// mantiene el total correcto con cualquier filtro por UF individual, no solo por organismo/provincia
// completos — a costa de un número no entero (`numeric`, sin redondear: redondear rompería la suma
// exacta). `ufs_del_grupo` queda expuesto aparte para que quien lea el dato pueda ver el denominador.
// Un grupo sin ninguna UF asignada no suma nada (mismo criterio que ya usa `vista_kpis_generales`
// para `jueces_asistidos` — un pool cargado pero nunca asignado no es "jueces asistidos").
//
// Verificado contra la base real al escribir esta migración (2026-10-04):
//   - SUM(jueces_prorrateados) = 1975 (igual a `vista_kpis_generales.jueces_asistidos` y a
//     `vista_jueces_por_grupo.jueces_contables` — dos reglas de reparto distintas, mismo total).
//   - COUNT(DISTINCT unidad_funcional_id) y COUNT(DISTINCT organismo_id) de esta vista coinciden
//     con el total real de UF y de organismos de la base (ninguno se perdió por los LEFT JOIN).
//   - Por cada provincia, SUM(jueces_prorrateados) coincide con el total por grupo de esa provincia
//     (misma comparación que ya se hizo para `jueces_contables` en 0009 — ningún grupo compartido
//     cruza provincias, V3.11 de 001-modelo-datos-relacional).
//   - Un organismo con un grupo compartido entre sus propias UF: las fracciones de ese grupo, SUMADAS
//     sobre TODAS las UF que lo usan (no solo las de ese organismo), dan exactamente `total_jueces`
//     del grupo — la condición básica de que el reparto no pierde ni inventa jueces.
import { Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  if (await existeRolMetabaseRo(db)) {
    await sql`REVOKE SELECT ON vista_unidades_funcionales_detalle FROM metabase_ro`.execute(db)
  }
  await sql`DROP VIEW IF EXISTS vista_unidades_funcionales_detalle`.execute(db)
}

async function existeRolMetabaseRo(db: Kysely<unknown>): Promise<boolean> {
  const { rows } = await sql<{ existe: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_ro') AS existe
  `.execute(db)
  return rows[0]?.existe ?? false
}
