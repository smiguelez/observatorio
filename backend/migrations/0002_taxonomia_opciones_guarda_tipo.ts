// Migración 0002 — Guarda de integridad en taxonomia_opciones (FR-004)
// (003-taxonomia-parametrizable). Contrato autoritativo:
// specs/003-taxonomia-parametrizable/contracts/migration-0002-taxonomia-opciones-guarda.sql
// (dry run BEGIN/ROLLBACK ya probado contra la base real).
//
// Corrige un gap real encontrado al verificar T014 (US2): taxonomia_opciones
// no tenía guarda propia contra FR-004 — se pudo insertar una opción
// "colgada" de una pregunta numérica sin rechazo. El trigger de la
// migración 0001 (validar_respuesta_taxonomia) protege las RESPUESTAS, no
// el catálogo de opciones en sí. Migración NUEVA en vez de un ajuste a
// 0001: ver research.md, Decisión 5 — 0001 ya está aplicada y trackeada en
// migrations.kysely_migration, editarla no re-ejecutaría nada en esta base
// y dejaría el archivo desincronizado del historial real.
import { Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE FUNCTION validar_opcion_tipo_pregunta() RETURNS trigger AS $$
    DECLARE
      v_tipo_respuesta text;
    BEGIN
      SELECT tipo_respuesta INTO v_tipo_respuesta
      FROM taxonomia_preguntas WHERE id = NEW.pregunta_id;

      IF v_tipo_respuesta IS NULL THEN
        RAISE EXCEPTION 'taxonomia_opciones: pregunta_id % no existe', NEW.pregunta_id;
      END IF;

      IF v_tipo_respuesta NOT IN ('opcion_unica', 'opcion_multiple') THEN
        RAISE EXCEPTION
          'taxonomia_opciones: la pregunta % es % — no admite opciones (FR-004)',
          NEW.pregunta_id, v_tipo_respuesta;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_opcion_tipo_pregunta_valido
      BEFORE INSERT OR UPDATE ON taxonomia_opciones
      FOR EACH ROW EXECUTE FUNCTION validar_opcion_tipo_pregunta()
  `.execute(db)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_opcion_tipo_pregunta_valido ON taxonomia_opciones`.execute(db)
  await sql`DROP FUNCTION IF EXISTS validar_opcion_tipo_pregunta()`.execute(db)
}
