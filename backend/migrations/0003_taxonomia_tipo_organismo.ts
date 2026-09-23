// Migración 0003 — Protección A: una respuesta nueva no puede guardarse
// para una pregunta que no aplica al tipo actual del organismo
// (004-fix-taxonomia-endpoint). Contrato autoritativo:
// specs/004-fix-taxonomia-endpoint/contracts/migration-0003-taxonomia-tipo-organismo.sql
// (ya probado con dry run BEGIN/ROLLBACK contra la base real: rechazo,
// control positivo, y confirmación de que no afecta al organismo id=311).
//
// Corrige un gap real: el trigger de 0001 (validar_respuesta_taxonomia)
// protege las RESPUESTAS contra forma/pertenencia/duplicado, pero nunca
// verificó que la pregunta aplique al tipo de organismo que responde —
// exactamente la situación del organismo id=311 ("OGA MEDIACIÓN"), que
// quedó con respuestas para preguntas que no aplican a su tipo actual
// (unidad operativa). Migración NUEVA, no ajuste a 0001/0002 — ya
// aplicadas y trackeadas, ver research.md Decisión 2 (mismo criterio que
// 003-taxonomia-parametrizable, Decisión 5).
//
// No revalida ni afecta ninguna fila ya existente — solo protege
// INSERT/UPDATE de acá en adelante (verificado: id=311 queda intacto).
import { Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE FUNCTION taxonomia_pregunta_aplica_a_tipo(p_pregunta_id bigint, p_tipo_oficina_id smallint)
    RETURNS boolean AS $$
      SELECT EXISTS (
        SELECT 1 FROM taxonomia_pregunta_tipos_oficina
        WHERE pregunta_id = p_pregunta_id AND tipo_oficina_id = p_tipo_oficina_id
      );
    $$ LANGUAGE sql STABLE
  `.execute(db)

  await sql`
    CREATE FUNCTION validar_pregunta_tipo_organismo() RETURNS trigger AS $$
    DECLARE
      v_tipo_oficina_id smallint;
    BEGIN
      SELECT tipo_oficina_id INTO v_tipo_oficina_id FROM organismos WHERE id = NEW.organismo_id;

      IF v_tipo_oficina_id IS NULL THEN
        RAISE EXCEPTION 'evaluaciones_taxonomicas: organismo_id % no existe', NEW.organismo_id;
      END IF;

      IF NOT taxonomia_pregunta_aplica_a_tipo(NEW.pregunta_id, v_tipo_oficina_id) THEN
        RAISE EXCEPTION
          'evaluaciones_taxonomicas: la pregunta % no aplica al tipo de organismo actual (tipo_oficina_id=%) del organismo % (Protección A)',
          NEW.pregunta_id, v_tipo_oficina_id, NEW.organismo_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_evaluacion_tipo_organismo_valido
      BEFORE INSERT OR UPDATE ON evaluaciones_taxonomicas
      FOR EACH ROW EXECUTE FUNCTION validar_pregunta_tipo_organismo()
  `.execute(db)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_evaluacion_tipo_organismo_valido ON evaluaciones_taxonomicas`.execute(db)
  await sql`DROP FUNCTION IF EXISTS validar_pregunta_tipo_organismo()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS taxonomia_pregunta_aplica_a_tipo(bigint, smallint)`.execute(db)
}
