// Migración 0009 — agrega `jueces_contables` a `vista_jueces_por_grupo` (0007). `CREATE OR REPLACE
// VIEW` agregando una columna al final: no se edita 0007 (convención de este proyecto), y Postgres
// permite esto porque las columnas existentes no cambian de posición ni de tipo.
//
// Por qué hace falta: `vista_jueces_por_grupo` es detalle (una fila por asignación UF↔grupo, a
// propósito — ver docs/runbook-reportes-sheets.md, "Patrón: mandar detalle, no agregado"), así que
// un grupo compartido entre varias UF aparece repetido, cada fila con el mismo `total_jueces`. Eso
// es correcto para filtrar por organismo/UF, pero rompe cualquier gráfico de Looker Studio que haga
// `SUM(total_jueces)` sin que alguien recuerde deduplicar por `grupo_jueces_id` primero — sobrecuenta
// exactamente el problema que ya documentaba 0005/0007 para jueces_asistidos.
//
// `jueces_contables`: igual a `total_jueces` en UNA sola fila por `grupo_jueces_id` (la de menor
// `unidad_funcional_id` — orden determinístico, no "la primera que devuelva la base") y 0 en las
// demás filas del mismo grupo. Así `SUM(jueces_contables)` da el total correcto con CUALQUIER
// filtro que no excluya esa fila "contable" (por organismo, por provincia, sin filtro) — sin que el
// autor del gráfico en Looker tenga que saber de la trampa de grupos compartidos. `total_jueces`
// sigue existiendo sin tocar, para quien quiera ver el total real del grupo fila por fila.
//
// Verificado contra la base real al escribir esta migración (2026-10-04):
//   - SUM(jueces_contables) = 1975, igual a `vista_kpis_generales.jueces_asistidos` (D8/FR-018e).
//   - Por cada provincia, SUM(jueces_contables) filtrado coincide con el total de jueces de esa
//     provincia calculado por grupo (sin filtrar) — ningún grupo compartido cruza provincias
//     (0 discrepancias, coincide con V3.11 de 001-modelo-datos-relacional): la provincia de la UF
//     (`localidades.provincia_id`) es siempre la misma que `grupos_jueces.provincia_id` del grupo
//     que esa UF usa, para los 266 registros de la vista. Si esto dejara de darse (un grupo
//     compartido entre UF de provincias distintas), atribuir `jueces_contables` a una sola fila
//     rompería el desglose por provincia — no pasa hoy, pero es la condición que hay que volver a
//     chequear si se repite esta verificación más adelante.
import { Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE OR REPLACE VIEW vista_jueces_por_grupo AS
    SELECT
      g.id AS grupo_jueces_id,
      g.total_jueces,
      uf.id AS unidad_funcional_id,
      uf.denominacion_unidad,
      o.id AS organismo_id,
      o.denominacion AS organismo,
      p.id AS provincia_id,
      p.nombre AS provincia,
      CASE
        WHEN row_number() OVER (PARTITION BY g.id ORDER BY uf.id) = 1 THEN g.total_jueces
        ELSE 0
      END AS jueces_contables
      FROM unidad_funcional_grupo_jueces ufg
      JOIN grupos_jueces g ON g.id = ufg.grupo_jueces_id
      JOIN unidades_funcionales uf ON uf.id = ufg.unidad_funcional_id
      JOIN organismos o ON o.id = uf.organismo_id
      JOIN localidades l ON l.id = uf.localidad_id
      JOIN provincias p ON p.id = l.provincia_id
     ORDER BY g.id, uf.id
  `.execute(db)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  // `CREATE OR REPLACE VIEW` no permite QUITAR una columna del final (solo agregar) — hay que
  // volver a crearla desde cero con la definición original de 0007.
  await sql`DROP VIEW vista_jueces_por_grupo`.execute(db)
  await sql`
    CREATE VIEW vista_jueces_por_grupo AS
    SELECT
      g.id AS grupo_jueces_id,
      g.total_jueces,
      uf.id AS unidad_funcional_id,
      uf.denominacion_unidad,
      o.id AS organismo_id,
      o.denominacion AS organismo,
      p.id AS provincia_id,
      p.nombre AS provincia
      FROM unidad_funcional_grupo_jueces ufg
      JOIN grupos_jueces g ON g.id = ufg.grupo_jueces_id
      JOIN unidades_funcionales uf ON uf.id = ufg.unidad_funcional_id
      JOIN organismos o ON o.id = uf.organismo_id
      JOIN localidades l ON l.id = uf.localidad_id
      JOIN provincias p ON p.id = l.provincia_id
     ORDER BY g.id, uf.id
  `.execute(db)

  if (await existeRolMetabaseRo(db)) {
    await sql`GRANT SELECT ON vista_jueces_por_grupo TO metabase_ro`.execute(db)
  }
}

async function existeRolMetabaseRo(db: Kysely<unknown>): Promise<boolean> {
  const { rows } = await sql<{ existe: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_ro') AS existe
  `.execute(db)
  return rows[0]?.existe ?? false
}
