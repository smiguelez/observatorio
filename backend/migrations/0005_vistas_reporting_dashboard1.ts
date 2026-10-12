// Migración 0005 — vistas de reporting para el primer tablero de la Fase D, "Datos Generales del
// Observatorio" (docs/inventario-tableros-actuales.md, dashboard 1; docs/plan-camino-a-produccion.md,
// Fase D). Cuatro vistas de SOLO LECTURA, sin tocar ninguna tabla ni dato del esquema de dominio —
// nada que reconciliar (Principio X).
//
// vista_kpis_generales — una sola fila con los 6 KPI del dashboard:
//   - provincias_con_organismo / organismos / unidades_funcionales / usuarios: conteos directos.
//   - localidades_con_organismo: `unidades_funcionales.localidad_id` es la única columna de
//     localidad que existe (organismos NO tiene localidad propia) — "localidad con organismo"
//     significa, en este esquema, "localidad con al menos una UF" (toda UF pertenece a un
//     organismo por FK NOT NULL).
//   - jueces_asistidos: el cálculo CORRECTO de D8, no la suma ingenua por UF. Verificado contra
//     `specs/001-modelo-datos-relacional/data-model.md` (FR-018e): el agregado cuenta cada
//     `grupos_jueces` UNA VEZ por su `total_jueces` (nunca sumando `cantidad_asignada` por
//     asignación, que sobrecuenta un grupo compartido entre varias UF — ejemplo de FR-018e: por UF
//     13/5/10, agregado 5+5+10=20, no 28). Un grupo sin ninguna asignación (pool cargado pero nunca
//     asignado a una UF) no suma — "asistido" implica al menos una UF real.
//     Verificado contra la base real al escribir esta migración (2026-09-30): el cálculo correcto
//     da 1975 — la suma ingenua por asignación (`SUM(cantidad_asignada)`) da 2189. Son números
//     DISTINTOS a propósito: el reemplazo de este dashboard es justamente dejar de usar el segundo.
//
// vista_organismos_por_tipo / vista_organismos_por_fuero / vista_organismos_por_provincia —
// reemplazan, respectivamente, "organismos por tipo", "organismos por fuero simplificado" y el
// mapa coroplético del dashboard 1. La de fuero reusa `vista_fuero_simplificado` (D3) tal cual —
// no reimplementa su cálculo. Las de tipo y provincia parten del catálogo (`tipos_oficina`,
// `provincias`) con `LEFT JOIN` a `organismos`, no al revés: un tipo o una provincia sin ningún
// organismo todavía aparece con `organismos = 0`, en vez de faltar de la vista — importa para el
// mapa (una provincia sin organismos no debe desaparecer del coroplético) y para que un gráfico de
// barras no cambie de categorías de una corrida a otra. La de provincia incluye `codigo_iso`
// (`provincias.codigo_iso`, ISO 3166-2) porque el mapa lo necesita para cruzar contra el GeoJSON
// (ver Fase D del plan — el mapeo id-numérico↔`codigo_iso` del GeoJSON ya se resolvió aparte).
//
// EXCEPCIÓN DELIBERADA a "una migración aplicada no se edita" (2026-10-12, pedido explícito del
// usuario, docs/runbook-corte-produccion.md tiene el detalle completo): esta migración YA está
// aplicada en la base real, y `provincias.codigo_iso` ya existe ahí — agregado a mano por `psql`,
// nunca por ningún script (verificado: ni `db/schema.sql`, ni `db/seeds/`, ni ninguna migración lo
// crea). El problema no es la base real (que ya tiene la columna) sino CUALQUIER reconstrucción
// desde cero: en el orden real (`db/schema.sql` → `db/seeds/` → `migration/` → `backend/migrations/`,
// ver el runbook), esta migración es la PRIMERA que usa `codigo_iso` — sin el `ALTER TABLE` de
// abajo, `up()` falla acá con `column p.codigo_iso does not exist` (reproducido en una base
// descartable antes de este cambio). Editar el archivo es seguro: en la base real, Kysely ya tiene
// esta migración trackeada en `migrations.kysely_migration` y nunca la vuelve a correr — el único
// efecto de este cambio es en una reconstrucción futura que todavía no llegó a este punto. El
// `ALTER`/`UPDATE` de abajo son idempotentes (`IF NOT EXISTS`, mismos valores siempre) — en la base
// real, si alguna vez se re-auditara manualmente, son no-ops.
import { Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // Ver "EXCEPCIÓN DELIBERADA" arriba. Mismo mapeo ISO 3166-2 que ya tiene la base real
  // (verificado por id antes de este cambio, no por nombre — los nombres de 4 provincias se
  // corrigen aparte, en 0016, después de que `migration/` haya cargado Firestore).
  await sql`ALTER TABLE provincias ADD COLUMN IF NOT EXISTS codigo_iso text`.execute(db)
  await sql`
    UPDATE provincias AS p SET codigo_iso = v.codigo_iso
      FROM (VALUES
        (1, 'AR-B'), (2, 'AR-C'), (3, 'AR-K'), (4, 'AR-H'), (5, 'AR-U'), (6, 'AR-X'),
        (7, 'AR-W'), (8, 'AR-E'), (9, 'AR-P'), (10, 'AR-Y'), (11, 'AR-L'), (12, 'AR-F'),
        (13, 'AR-M'), (14, 'AR-N'), (15, 'AR-Q'), (16, 'AR-R'), (17, 'AR-A'), (18, 'AR-J'),
        (19, 'AR-D'), (20, 'AR-Z'), (21, 'AR-S'), (22, 'AR-G'), (23, 'AR-V'), (24, 'AR-T')
      ) AS v(id, codigo_iso)
     WHERE p.id = v.id
  `.execute(db)

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP VIEW IF EXISTS vista_organismos_por_provincia`.execute(db)
  await sql`DROP VIEW IF EXISTS vista_organismos_por_fuero`.execute(db)
  await sql`DROP VIEW IF EXISTS vista_organismos_por_tipo`.execute(db)
  await sql`DROP VIEW IF EXISTS vista_kpis_generales`.execute(db)
}
