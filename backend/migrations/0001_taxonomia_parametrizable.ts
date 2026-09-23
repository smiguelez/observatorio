// Migración 0001 — Taxonomía parametrizable por preguntas
// (003-taxonomia-parametrizable). Contrato autoritativo:
// specs/003-taxonomia-parametrizable/contracts/migration-0001-taxonomia.sql
// (ya probado con un dry run BEGIN/ROLLBACK contra la base real durante
// /speckit-plan). Este archivo reproduce ese mismo SQL, sección por
// sección, vía `sql` de Kysely (el query builder no expresa funciones ni
// triggers) — el Migrator de Kysely envuelve cada migración en una
// transacción real de Postgres (Principio X: todo o nada), así que NO hay
// BEGIN/COMMIT explícito acá.
//
// Toca EXCLUSIVAMENTE: evaluaciones_taxonomicas (renombra + recrea),
// taxonomia_preguntas, taxonomia_pregunta_tipos_oficina, taxonomia_opciones
// (nuevas). Nada de organismos/usuarios/UF/pools_jueces/auth.* se toca.
import { Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // ====================================================== T004 (DDL) ======
  await sql`ALTER TABLE evaluaciones_taxonomicas RENAME TO evaluaciones_taxonomicas_v1_legacy`.execute(db)

  await sql`
    CREATE TABLE taxonomia_preguntas (
      id             bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      codigo         text     NOT NULL UNIQUE,
      texto          text     NOT NULL,
      grupo          text     NOT NULL CHECK (grupo IN ('gestion', 'institucional', 'organizacion', 'implementacion')),
      tipo_respuesta text     NOT NULL CHECK (tipo_respuesta IN ('opcion_unica', 'opcion_multiple', 'numerica', 'texto_libre')),
      orden          smallint
    )
  `.execute(db)

  await sql`
    CREATE TABLE taxonomia_pregunta_tipos_oficina (
      pregunta_id     bigint   NOT NULL REFERENCES taxonomia_preguntas (id) ON DELETE CASCADE,
      tipo_oficina_id smallint NOT NULL REFERENCES tipos_oficina (id),
      PRIMARY KEY (pregunta_id, tipo_oficina_id)
    )
  `.execute(db)

  await sql`
    CREATE TABLE taxonomia_opciones (
      id          bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pregunta_id bigint   NOT NULL REFERENCES taxonomia_preguntas (id) ON DELETE CASCADE,
      codigo      text     NOT NULL,
      etiqueta    text     NOT NULL,
      orden       smallint,
      UNIQUE (pregunta_id, codigo)
    )
  `.execute(db)

  await sql`
    CREATE TABLE evaluaciones_taxonomicas (
      id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      organismo_id  bigint      NOT NULL REFERENCES organismos (id) ON DELETE CASCADE,
      pregunta_id   bigint      NOT NULL REFERENCES taxonomia_preguntas (id),
      opcion_id     bigint      REFERENCES taxonomia_opciones (id),
      valor_texto   text,
      valor_numero  numeric,
      creado_a      timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (opcion_id IS NOT NULL)::int
        + (valor_texto IS NOT NULL)::int
        + (valor_numero IS NOT NULL)::int
        = 1
      )
    )
  `.execute(db)

  await sql`CREATE INDEX ix_evaluaciones_taxonomicas_organismo ON evaluaciones_taxonomicas (organismo_id)`.execute(db)
  await sql`CREATE INDEX ix_evaluaciones_taxonomicas_pregunta ON evaluaciones_taxonomicas (pregunta_id)`.execute(db)

  // =================================================== T005 (trigger) =====
  await sql`
    CREATE FUNCTION validar_respuesta_taxonomia() RETURNS trigger AS $$
    DECLARE
      v_tipo_respuesta text;
      v_opcion_pregunta_id bigint;
      v_ya_existe boolean;
    BEGIN
      SELECT tipo_respuesta INTO v_tipo_respuesta
      FROM taxonomia_preguntas WHERE id = NEW.pregunta_id;

      IF v_tipo_respuesta IS NULL THEN
        RAISE EXCEPTION 'evaluaciones_taxonomicas: pregunta_id % no existe', NEW.pregunta_id;
      END IF;

      IF NEW.opcion_id IS NOT NULL THEN
        SELECT pregunta_id INTO v_opcion_pregunta_id
        FROM taxonomia_opciones WHERE id = NEW.opcion_id;

        IF v_opcion_pregunta_id IS DISTINCT FROM NEW.pregunta_id THEN
          RAISE EXCEPTION
            'evaluaciones_taxonomicas: la opción % pertenece a la pregunta %, no a la pregunta % de esta respuesta (FR-007)',
            NEW.opcion_id, v_opcion_pregunta_id, NEW.pregunta_id;
        END IF;
      END IF;

      IF v_tipo_respuesta IN ('opcion_unica', 'opcion_multiple') THEN
        IF NEW.opcion_id IS NULL OR NEW.valor_texto IS NOT NULL OR NEW.valor_numero IS NOT NULL THEN
          RAISE EXCEPTION
            'evaluaciones_taxonomicas: la pregunta % es % — la respuesta debe traer opcion_id y nada más (FR-004/FR-008)',
            NEW.pregunta_id, v_tipo_respuesta;
        END IF;
      ELSIF v_tipo_respuesta = 'numerica' THEN
        IF NEW.valor_numero IS NULL OR NEW.opcion_id IS NOT NULL OR NEW.valor_texto IS NOT NULL THEN
          RAISE EXCEPTION
            'evaluaciones_taxonomicas: la pregunta % es numerica — la respuesta debe traer valor_numero y nada más (FR-008)',
            NEW.pregunta_id;
        END IF;
      ELSIF v_tipo_respuesta = 'texto_libre' THEN
        IF NEW.valor_texto IS NULL OR NEW.opcion_id IS NOT NULL OR NEW.valor_numero IS NOT NULL THEN
          RAISE EXCEPTION
            'evaluaciones_taxonomicas: la pregunta % es texto_libre — la respuesta debe traer valor_texto y nada más (FR-008)',
            NEW.pregunta_id;
        END IF;
      END IF;

      IF v_tipo_respuesta != 'opcion_multiple' THEN
        SELECT EXISTS (
          SELECT 1 FROM evaluaciones_taxonomicas
          WHERE organismo_id = NEW.organismo_id
            AND pregunta_id = NEW.pregunta_id
            AND id IS DISTINCT FROM NEW.id
        ) INTO v_ya_existe;

        IF v_ya_existe THEN
          RAISE EXCEPTION
            'evaluaciones_taxonomicas: ya existe una respuesta de organismo % a la pregunta % (no es opcion_multiple — FR-006)',
            NEW.organismo_id, NEW.pregunta_id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_respuesta_taxonomia_valida
      BEFORE INSERT OR UPDATE ON evaluaciones_taxonomicas
      FOR EACH ROW EXECUTE FUNCTION validar_respuesta_taxonomia()
  `.execute(db)

  // ============================================== T007 (US1 — preguntas) ==
  await sql`
    INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden) VALUES
      ('insercion_institucional',   'insercion_institucional',   'institucional',  'opcion_unica', 1),
      ('jerarquia_normativa',       'jerarquia_normativa',       'institucional',  'opcion_unica', 2),
      ('dependencia',               'dependencia',               'organizacion',   'opcion_unica', 3),
      ('asistencia_jurisdiccional', 'asistencia_jurisdiccional', 'organizacion',   'opcion_unica', 4),
      ('autonomia',                 'autonomia',                 'gestion',        'opcion_unica', 5),
      ('alcance_proceso',           'alcance_proceso',           'implementacion', 'opcion_unica', 6),
      ('alcance_fuero',             'alcance_fuero',             'implementacion', 'opcion_unica', 7),
      ('presencia_territorial',     'presencia_territorial',     'implementacion', 'opcion_unica', 8),
      ('grado_implementacion',      'grado_implementacion',      'implementacion', 'opcion_unica', 9)
  `.execute(db)

  await sql`
    INSERT INTO taxonomia_pregunta_tipos_oficina (pregunta_id, tipo_oficina_id)
    SELECT p.id, t.id
    FROM taxonomia_preguntas p
    CROSS JOIN tipos_oficina t
    WHERE t.nombre IN ('oficina judicial', 'oficina judicial especializada')
  `.execute(db)

  // ================================================ T008 (US1 — opciones) =
  await sql`
    INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
    SELECT p.id, tc.codigo, tc.etiqueta, tc.orden
    FROM taxonomia_codigos tc
    JOIN taxonomia_preguntas p ON p.codigo = tc.dimension
  `.execute(db)

  // ============================================== T009 (US1 — respuestas) =
  await sql`
    INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
    SELECT v.organismo_id, p.id, o.id
    FROM evaluaciones_taxonomicas_v1_legacy v
    CROSS JOIN LATERAL (VALUES
      ('autonomia',                 v.autonomia),
      ('insercion_institucional',   v.insercion_institucional),
      ('jerarquia_normativa',       v.jerarquia_normativa),
      ('dependencia',               v.dependencia),
      ('asistencia_jurisdiccional', v.asistencia_jurisdiccional),
      ('alcance_proceso',           v.alcance_proceso),
      ('alcance_fuero',             v.alcance_fuero),
      ('presencia_territorial',     v.presencia_territorial),
      ('grado_implementacion',      v.grado_implementacion)
    ) AS respuesta(codigo_pregunta, codigo_opcion)
    JOIN taxonomia_preguntas p ON p.codigo = respuesta.codigo_pregunta
    JOIN taxonomia_opciones  o ON o.pregunta_id = p.id AND o.codigo = respuesta.codigo_opcion
  `.execute(db)

  // ============================================ T010 (US1 — reconciliación)
  // No estaba en el rango T001-T009 pedido explícitamente, pero es lo que
  // hace verificable "origen=801=destino" contra migracion_reconciliacion
  // después de aplicar en firme — sin esto no hay nada que consultar ahí.
  await sql`
    DO $$
    DECLARE
      v_origen  integer;
      v_destino integer;
      v_resultado text;
    BEGIN
      SELECT
        count(autonomia) + count(insercion_institucional) + count(jerarquia_normativa)
        + count(dependencia) + count(asistencia_jurisdiccional) + count(alcance_proceso)
        + count(alcance_fuero) + count(presencia_territorial) + count(grado_implementacion)
      INTO v_origen
      FROM evaluaciones_taxonomicas_v1_legacy;

      SELECT count(*) INTO v_destino FROM evaluaciones_taxonomicas;

      v_resultado := CASE WHEN v_origen = v_destino THEN 'coincide' ELSE 'discrepancia_abierta' END;

      INSERT INTO migracion_reconciliacion (entidad, conteo_origen, conteo_destino, resultado, detalle)
      VALUES (
        'evaluaciones_taxonomicas_respuestas',
        v_origen,
        v_destino,
        v_resultado,
        CASE WHEN v_resultado = 'coincide' THEN NULL
             ELSE format('Migración 0001 taxonomía: origen=%s destino=%s', v_origen, v_destino) END
      );

      IF v_resultado != 'coincide' THEN
        RAISE EXCEPTION
          'Migración 0001 taxonomía: reconciliación abierta (origen=% destino=%) — abortando (Principio X)',
          v_origen, v_destino;
      END IF;
    END $$
  `.execute(db)
}

// ======================================================= T006 (down) ======
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_respuesta_taxonomia_valida ON evaluaciones_taxonomicas`.execute(db)
  await sql`DROP FUNCTION IF EXISTS validar_respuesta_taxonomia()`.execute(db)
  await sql`DROP TABLE IF EXISTS evaluaciones_taxonomicas`.execute(db)
  await sql`DROP TABLE IF EXISTS taxonomia_opciones`.execute(db)
  await sql`DROP TABLE IF EXISTS taxonomia_pregunta_tipos_oficina`.execute(db)
  await sql`DROP TABLE IF EXISTS taxonomia_preguntas`.execute(db)
  await sql`ALTER TABLE evaluaciones_taxonomicas_v1_legacy RENAME TO evaluaciones_taxonomicas`.execute(db)
}
