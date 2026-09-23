-- Contrato autoritativo de la migración 0001 — Taxonomía parametrizable
-- (feature 003-taxonomia-parametrizable). `backend/migrations/0001_taxonomia_parametrizable.ts`
-- (tarea de implementación) envuelve este mismo DDL/DML con el Migrator de
-- Kysely (research.md Decisión 1) — este archivo es el contrato, no el
-- código final; mismo criterio que contracts/schema.sql en
-- 001-modelo-datos-relacional.
--
-- Toca EXCLUSIVAMENTE: evaluaciones_taxonomicas (renombra + recrea),
-- taxonomia_preguntas (nueva), taxonomia_pregunta_tipos_oficina (nueva),
-- taxonomia_opciones (nueva). Nada de organismos/usuarios/UF/pools_jueces/
-- auth.* se toca. Corre dentro de una transacción (Principio X: todo o
-- nada) — el Migrator de Kysely ya envuelve cada migración en una si el
-- dialecto la soporta (Postgres la soporta).

BEGIN;

-- ============================================================ 1. Preservar
-- la tabla vieja renombrada (research.md Decisión 4) — no se borra en esta
-- migración, queda como respaldo auditable.
ALTER TABLE evaluaciones_taxonomicas RENAME TO evaluaciones_taxonomicas_v1_legacy;

-- ============================================================ 2. Preguntas
CREATE TABLE taxonomia_preguntas (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo         text     NOT NULL UNIQUE,
  texto          text     NOT NULL,
  grupo          text     NOT NULL CHECK (grupo IN ('gestion', 'institucional', 'organizacion', 'implementacion')),
  tipo_respuesta text     NOT NULL CHECK (tipo_respuesta IN ('opcion_unica', 'opcion_multiple', 'numerica', 'texto_libre')),
  orden          smallint
);

-- "A qué tipo(s) de organismo aplica" — informativo (FR-012), NUNCA se lee
-- para validar una respuesta ya existente (por diseño: ninguna FK conecta
-- evaluaciones_taxonomicas con esta tabla).
CREATE TABLE taxonomia_pregunta_tipos_oficina (
  pregunta_id     bigint   NOT NULL REFERENCES taxonomia_preguntas (id) ON DELETE CASCADE,
  tipo_oficina_id smallint NOT NULL REFERENCES tipos_oficina (id),
  PRIMARY KEY (pregunta_id, tipo_oficina_id)
);

-- ============================================================= 3. Opciones
-- Reemplaza taxonomia_codigos: cada opción pertenece a UNA pregunta, nunca
-- a un catálogo global compartido (FR-003).
CREATE TABLE taxonomia_opciones (
  id          bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pregunta_id bigint   NOT NULL REFERENCES taxonomia_preguntas (id) ON DELETE CASCADE,
  codigo      text     NOT NULL,
  etiqueta    text     NOT NULL,
  orden       smallint,
  UNIQUE (pregunta_id, codigo)
);

-- =================================================== 4. Tabla de respuestas
-- Reemplaza a la fila de 9 columnas por organismo. Un organismo tiene 0..N
-- respuestas (antes: a lo sumo 1 fila completa, PK sobre organismo_id).
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
);

CREATE INDEX ix_evaluaciones_taxonomicas_organismo ON evaluaciones_taxonomicas (organismo_id);
CREATE INDEX ix_evaluaciones_taxonomicas_pregunta  ON evaluaciones_taxonomicas (pregunta_id);

-- FR-004/FR-006/FR-007/FR-008 — mismo patrón que
-- trg_asignacion_fuero_dentro_de_uf (001-modelo-datos-relacional,
-- research.md Decisión 2): una referencia rota o una forma de respuesta
-- inválida para el tipo de pregunta es imposible por diseño, no por
-- convención de aplicación (Principio VIII).
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

  -- FR-007: la opción, si viene, debe pertenecer a ESTA pregunta.
  IF NEW.opcion_id IS NOT NULL THEN
    SELECT pregunta_id INTO v_opcion_pregunta_id
    FROM taxonomia_opciones WHERE id = NEW.opcion_id;

    IF v_opcion_pregunta_id IS DISTINCT FROM NEW.pregunta_id THEN
      RAISE EXCEPTION
        'evaluaciones_taxonomicas: la opción % pertenece a la pregunta %, no a la pregunta % de esta respuesta (FR-007)',
        NEW.opcion_id, v_opcion_pregunta_id, NEW.pregunta_id;
    END IF;
  END IF;

  -- FR-004/FR-008: la forma de la respuesta debe coincidir con el tipo de
  -- la pregunta.
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

  -- FR-006: a lo sumo una respuesta por (organismo, pregunta), salvo
  -- opcion_multiple.
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_respuesta_taxonomia_valida
  BEFORE INSERT OR UPDATE ON evaluaciones_taxonomicas
  FOR EACH ROW EXECUTE FUNCTION validar_respuesta_taxonomia();

-- ============================================ 5. Migrar las 9 preguntas
-- Mismo agrupamiento que GRUPO_POR_DIMENSION (migration/src/transform/taxonomia.js,
-- 001-modelo-datos-relacional) — no una reclasificación nueva.
INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden) VALUES
  ('insercion_institucional',   'insercion_institucional',   'institucional',  'opcion_unica', 1),
  ('jerarquia_normativa',       'jerarquia_normativa',       'institucional',  'opcion_unica', 2),
  ('dependencia',               'dependencia',               'organizacion',   'opcion_unica', 3),
  ('asistencia_jurisdiccional', 'asistencia_jurisdiccional', 'organizacion',   'opcion_unica', 4),
  ('autonomia',                 'autonomia',                 'gestion',        'opcion_unica', 5),
  ('alcance_proceso',           'alcance_proceso',           'implementacion', 'opcion_unica', 6),
  ('alcance_fuero',             'alcance_fuero',             'implementacion', 'opcion_unica', 7),
  ('presencia_territorial',     'presencia_territorial',     'implementacion', 'opcion_unica', 8),
  ('grado_implementacion',      'grado_implementacion',      'implementacion', 'opcion_unica', 9);

-- "Aplica a": los dos tipos que concentran 88 de las 89 evaluaciones reales
-- (verificado — no asumido). Informativo, no usado para validar
-- evaluaciones_taxonomicas_v1_legacy al migrarlas (research.md, FR-012).
INSERT INTO taxonomia_pregunta_tipos_oficina (pregunta_id, tipo_oficina_id)
SELECT p.id, t.id
FROM taxonomia_preguntas p
CROSS JOIN tipos_oficina t
WHERE t.nombre IN ('oficina judicial', 'oficina judicial especializada');

-- ============================================ 6. Migrar los 32 códigos
INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
SELECT p.id, tc.codigo, tc.etiqueta, tc.orden
FROM taxonomia_codigos tc
JOIN taxonomia_preguntas p ON p.codigo = tc.dimension;

-- ============================================ 7. Migrar las 89 evaluaciones
-- "Despivotea" las 9 columnas de cada fila vieja a 9 filas de respuesta.
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
JOIN taxonomia_opciones  o ON o.pregunta_id = p.id AND o.codigo = respuesta.codigo_opcion;

-- ============================================ 8. Reconciliación (Principio X)
-- research.md Decisión 3: conteo_origen calculado de verdad (suma de
-- valores no nulos en las 9 columnas viejas), no un 801 hardcodeado.
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
END $$;

COMMIT;
