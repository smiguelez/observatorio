// Migración 0007 — corrige el patrón de 0005 para el dashboard 1 ("Datos Generales del
// Observatorio"): Looker Studio filtra y cruza en el propio Looker, no en SQL — una vista ya
// agregada (GROUP BY) le da un número fijo que no puede recalcular al aplicar un filtro cruzado
// (p. ej. filtrar por provincia y ver cómo cambia "organismos por tipo" no funciona si esa vista ya
// vino agrupada solo por tipo). La corrección: mandar el DETALLE (una fila por entidad real) y dejar
// que Looker agregue. Documentado también en docs/runbook-reportes-sheets.md.
//
// Reemplaza vista_organismos_por_tipo / vista_organismos_por_fuero / vista_organismos_por_provincia
// (las tres agregaban en SQL) por UNA sola vista de detalle, vista_organismos_detalle: una fila por
// organismo con sus atributos de catálogo sin agrupar — tipo_oficina, fuero_simplificado (reusa
// vista_fuero_simplificado de D3 tal cual), provincia y codigo_iso (para el mapa).
//
// `vista_kpis_generales` (la única vista de 0005 que es un KPI genuinamente agregado, no un
// catálogo por entidad) NO se toca — un total no tiene "detalle" al que bajar.
//
// Agrega además vista_jueces_por_grupo: una fila por cada asignación real (grupo_jueces, unidad
// funcional que lo usa), con el total_jueces del GRUPO (no de la asignación — ver D8/FR-018e,
// mismo comentario que vista_kpis_generales) y el id del grupo, para que Looker pueda deduplicar
// por grupo si hace falta (un grupo compartido entre varias UF aparece en varias filas, cada una
// con el mismo total_jueces — sumarlas ingenuamente sobrecuenta, igual que ya advertía 0005).
// Caso aparte de "mandar el detalle y que Looker agregue": acá el valor real (total_jueces) vive en
// una entidad (el grupo) distinta de la que se usa para filtrar (organismo/UF) — por eso esta vista
// expone el id del grupo explícitamente, para que el autor del dashboard pueda optar por contar
// grupos únicos en vez de sumar la columna a lo bruto.
//
// IMPORTANTE (regresión conocida y aceptada): el mapa coroplético pierde el "0 explícito" para una
// provincia sin ningún organismo (hoy: La Rioja y Santa Cruz) — antes vista_organismos_por_provincia
// partía del catálogo de provincias con LEFT JOIN a organismos, así que esas dos aparecían con
// organismos=0; vista_organismos_detalle parte de organismos, así que esas provincias no tienen
// ninguna fila y quedan ausentes del mapa (Looker Studio las va a mostrar como "sin dato", no como
// cero — un color distinto al blanco documentado para el 0 explícito). Aceptado a cambio de que el
// resto de los gráficos del dashboard sí puedan filtrarse cruzado; si hace falta el 0 explícito de
// vuelta, es trabajo futuro (blend con el catálogo de provincias en el propio Looker Studio).
import { Kysely, sql } from 'kysely'

const VISTAS_NUEVAS = ['vista_organismos_detalle', 'vista_jueces_por_grupo']
const VISTAS_VIEJAS = ['vista_organismos_por_tipo', 'vista_organismos_por_fuero', 'vista_organismos_por_provincia']

async function existeRolMetabaseRo(db: Kysely<unknown>): Promise<boolean> {
  const { rows } = await sql<{ existe: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_ro') AS existe
  `.execute(db)
  return rows[0]?.existe ?? false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  for (const vista of VISTAS_VIEJAS) {
    await sql`DROP VIEW IF EXISTS ${sql.ref(vista)}`.execute(db)
  }

  await sql`
    CREATE VIEW vista_organismos_detalle AS
    SELECT
      o.id AS organismo_id,
      o.denominacion AS organismo,
      t.nombre AS tipo_oficina,
      vfs.fuero_simplificado,
      p.nombre AS provincia,
      p.codigo_iso
      FROM organismos o
      JOIN tipos_oficina t ON t.id = o.tipo_oficina_id
      JOIN provincias p ON p.id = o.provincia_id
      LEFT JOIN vista_fuero_simplificado vfs ON vfs.organismo_id = o.id
     ORDER BY o.id
  `.execute(db)

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
    for (const vista of VISTAS_NUEVAS) {
      await sql`GRANT SELECT ON ${sql.ref(vista)} TO metabase_ro`.execute(db)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  if (await existeRolMetabaseRo(db)) {
    for (const vista of VISTAS_NUEVAS) {
      await sql`REVOKE SELECT ON ${sql.ref(vista)} FROM metabase_ro`.execute(db)
    }
  }

  await sql`DROP VIEW IF EXISTS vista_jueces_por_grupo`.execute(db)
  await sql`DROP VIEW IF EXISTS vista_organismos_detalle`.execute(db)

  // Recrea las tres vistas de 0005 tal cual, para que la migración sea reversible.
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
    for (const vista of VISTAS_VIEJAS) {
      await sql`GRANT SELECT ON ${sql.ref(vista)} TO metabase_ro`.execute(db)
    }
  }
}
