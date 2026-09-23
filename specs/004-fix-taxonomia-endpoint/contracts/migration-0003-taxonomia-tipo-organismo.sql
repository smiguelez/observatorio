-- Migración 0003 — Protección A: una respuesta nueva no puede guardarse
-- para una pregunta que no aplica al tipo actual del organismo
-- (004-fix-taxonomia-endpoint). Mismo patrón que los triggers de
-- 003-taxonomia-parametrizable (validar_respuesta_taxonomia,
-- validar_opcion_tipo_pregunta). Migración NUEVA, no ajuste a 0001/0002 —
-- ver research.md, Decisión 2.
--
-- No revalida ni afecta ninguna fila ya existente (incluida la del
-- organismo id=311) — solo protege INSERT/UPDATE de acá en adelante.

BEGIN;

CREATE FUNCTION taxonomia_pregunta_aplica_a_tipo(p_pregunta_id bigint, p_tipo_oficina_id smallint)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM taxonomia_pregunta_tipos_oficina
    WHERE pregunta_id = p_pregunta_id AND tipo_oficina_id = p_tipo_oficina_id
  );
$$ LANGUAGE sql STABLE;

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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evaluacion_tipo_organismo_valido
  BEFORE INSERT OR UPDATE ON evaluaciones_taxonomicas
  FOR EACH ROW EXECUTE FUNCTION validar_pregunta_tipo_organismo();

-- Negativo: guardar una respuesta para una pregunta que no aplica al tipo
-- actual del organismo debe rechazarse.
DO $$
DECLARE
  v_organismo_tipo_4 bigint;  -- un organismo real de tipo 'unidad operativa' (id=4)
BEGIN
  SELECT id INTO v_organismo_tipo_4 FROM organismos WHERE tipo_oficina_id = 4 LIMIT 1;

  IF v_organismo_tipo_4 IS NULL THEN
    RAISE EXCEPTION 'fixture: no hay ningún organismo real de tipo_oficina_id=4 (unidad operativa) para probar';
  END IF;

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT v_organismo_tipo_4,
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'autonomia'),
         (SELECT o.id FROM taxonomia_opciones o
            JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
           WHERE p.codigo = 'autonomia' LIMIT 1);

  RAISE EXCEPTION 'FALLO: se esperaba que la escritura fuera rechazada (organismo de tipo unidad operativa, pregunta que solo aplica a oficina judicial)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%no aplica al tipo de organismo actual%' THEN
      RAISE NOTICE 'OK: respuesta nueva para una pregunta que no aplica al tipo del organismo — RECHAZADA (Protección A)';
    ELSE
      RAISE;
    END IF;
END $$;

-- Control positivo: el organismo histórico id=311 (unidad operativa con
-- taxonomía ya cargada) NO se ve afectado — su fila ya existente sigue
-- existiendo, y una respuesta NUEVA a una pregunta que SÍ aplica a su tipo
-- real (ninguna aplica a 'unidad operativa' hoy, así que se prueba con una
-- pregunta de prueba dada de alta con ese tipo aplicable) se acepta.
DO $$
DECLARE
  v_conteo_antes integer;
  v_conteo_despues integer;
BEGIN
  SELECT count(*) INTO v_conteo_antes FROM evaluaciones_taxonomicas WHERE organismo_id = 311;

  IF v_conteo_antes = 0 THEN
    RAISE EXCEPTION 'fixture: el organismo histórico id=311 no tiene ninguna respuesta — no se puede probar que esta protección no lo afecta';
  END IF;

  -- Ninguna escritura nueva se hace acá a propósito: la prueba es que el
  -- trigger, recién creado, no revalida ni toca filas existentes por sí
  -- solo (no hay ningún UPDATE masivo en esta migración).
  SELECT count(*) INTO v_conteo_despues FROM evaluaciones_taxonomicas WHERE organismo_id = 311;

  IF v_conteo_antes != v_conteo_despues THEN
    RAISE EXCEPTION 'FALLO: el organismo id=311 cambió de % a % respuestas solo por crear el trigger', v_conteo_antes, v_conteo_despues;
  END IF;

  RAISE NOTICE 'OK: organismo histórico id=311 — % respuesta(s) intacta(s), el trigger nuevo no las tocó', v_conteo_antes;
END $$;

-- Control positivo — sin falso positivo: una escritura NUEVA para una
-- pregunta que SÍ aplica al tipo real del organismo se sigue aceptando.
-- Ninguna de las 9 preguntas migradas aplica a 'unidad operativa' (tipo
-- de id=311), así que se da de alta una pregunta de prueba aplicable a
-- 'oficina judicial' (tipo_oficina_id=1) para probarlo con un organismo
-- real de ese tipo.
INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_positivo_0003', 'Prueba control positivo 0003', 'gestion', 'numerica', 400);

INSERT INTO taxonomia_pregunta_tipos_oficina (pregunta_id, tipo_oficina_id)
SELECT id, 1 FROM taxonomia_preguntas WHERE codigo = 'prueba_positivo_0003';

DO $$
DECLARE
  v_organismo_tipo_1 bigint;
BEGIN
  SELECT id INTO v_organismo_tipo_1 FROM organismos WHERE tipo_oficina_id = 1 LIMIT 1;

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_numero)
  SELECT v_organismo_tipo_1, (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_positivo_0003'), 1;

  RAISE NOTICE 'OK: escritura nueva para una pregunta que SÍ aplica al tipo del organismo — aceptada, sin falso positivo';
END $$;

ROLLBACK;
