// Migración 0011 — vista de detalle a nivel de USUARIO para el reporting de Fase D. Mismo patrón
// que el resto de las vistas de detalle (ver docs/runbook-reportes-sheets.md, "Patrón: mandar
// detalle, no agregado"): una fila por usuario, sin agrupar en SQL, para que Looker Studio filtre.
//
// SIN DATOS PERSONALES (Principio XIII / D15): ni `email`, ni `nombre_display`, ni `foto_url`, ni
// `firestore_id`, ni ninguna fecha de actividad — nada que identifique a una persona. Solo
// `usuario_id` (el id interno, numérico, sin significado fuera de esta base), `es_admin` y la
// provincia (nombre resuelto + `codigo_iso`, para poder cruzar con `vista_unidades_funcionales_detalle`
// u otra vista geográfica en el propio Looker Studio).
//
// `es_admin`: un usuario puede tener más de un rol (`usuario_roles` es una tabla puente,
// `usuario_id`+`rol_id`) — un `JOIN` directo contra `roles` duplicaría la fila del usuario una vez
// por rol. Se resuelve con un `EXISTS` (subconsulta, no `JOIN`): da exactamente una fila por usuario,
// `true` si tiene el rol 'admin' entre los que tenga, sin importar cuántos roles más tenga además.
//
// `provincia`: `usuarios.provincia_id` es NULLABLE (a diferencia de `organismos.provincia_id`, que
// no lo es) — un usuario puede no haber declarado provincia. `'Sin provincia'` (texto explícito, no
// NULL) para que un gráfico de Looker Studio por provincia tenga una categoría visible para ese caso
// en vez de que la fila desaparezca o quede con una celda vacía ambigua. `codigo_iso` sí queda NULL
// en ese caso (no hay un "código ISO de ningún lado" razonable para inventar).
import { Kysely, sql } from 'kysely'

async function existeRolMetabaseRo(db: Kysely<unknown>): Promise<boolean> {
  const { rows } = await sql<{ existe: boolean }>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_ro') AS existe
  `.execute(db)
  return rows[0]?.existe ?? false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE VIEW vista_usuarios_por_provincia AS
    SELECT
      u.id AS usuario_id,
      EXISTS (
        SELECT 1 FROM usuario_roles ur
          JOIN roles r ON r.id = ur.rol_id
         WHERE ur.usuario_id = u.id AND r.nombre = 'admin'
      ) AS es_admin,
      COALESCE(p.nombre, 'Sin provincia') AS provincia,
      p.codigo_iso
      FROM usuarios u
      LEFT JOIN provincias p ON p.id = u.provincia_id
     ORDER BY u.id
  `.execute(db)

  if (await existeRolMetabaseRo(db)) {
    await sql`GRANT SELECT ON vista_usuarios_por_provincia TO metabase_ro`.execute(db)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  if (await existeRolMetabaseRo(db)) {
    await sql`REVOKE SELECT ON vista_usuarios_por_provincia FROM metabase_ro`.execute(db)
  }
  await sql`DROP VIEW IF EXISTS vista_usuarios_por_provincia`.execute(db)
}
