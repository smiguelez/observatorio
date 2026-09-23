-- T013 (US4, 004-fix-taxonomia-endpoint): Protección A — una respuesta
-- nueva no puede guardarse para una pregunta que no aplica al tipo actual
-- del organismo. Mismo patrón que db/validation/taxonomia_pregunta_nueva.sql
-- y taxonomia_respuestas_*.sql (003): fixtures, termina en ROLLBACK.
--
-- Caso real que originó esta protección: organismo id=311 ("OGA MEDIACIÓN"),
-- unidad operativa con las 9 respuestas migradas de 003 para preguntas que
-- solo aplican a oficina judicial / oficina judicial especializada. Esta
-- migración (0003) NO revalida ni toca esa fila histórica — solo protege
-- escrituras nuevas de acá en adelante. Cada caso de este archivo confirma
-- eso explícitamente con un conteo antes/después de organismo_id=311.

BEGIN;

DO $$
DECLARE
  v_conteo_311_antes integer;
  v_conteo_311_despues integer;
BEGIN
  SELECT count(*) INTO v_conteo_311_antes FROM evaluaciones_taxonomicas WHERE organismo_id = 311;
  IF v_conteo_311_antes = 0 THEN
    RAISE EXCEPTION 'fixture: organismo id=311 no tiene ninguna respuesta — no se puede probar esta protección sin él';
  END IF;
  RAISE NOTICE 'Punto de partida: organismo id=311 tiene % respuesta(s) (caso histórico OGA MEDIACIÓN)', v_conteo_311_antes;
END $$;

-- ===========================================================================
-- (a) NEGATIVO — escritura nueva para un organismo de tipo 'unidad
-- operativa' (tipo_oficina_id=4) a una pregunta que solo aplica a
-- 'oficina judicial'/'oficina judicial especializada' (las 9 migradas).
-- ===========================================================================
DO $$
DECLARE
  v_organismo_unidad_operativa bigint;
BEGIN
  SELECT id INTO v_organismo_unidad_operativa FROM organismos WHERE tipo_oficina_id = 4 LIMIT 1;
  IF v_organismo_unidad_operativa IS NULL THEN
    RAISE EXCEPTION 'fixture: no hay ningún organismo real de tipo_oficina_id=4 (unidad operativa)';
  END IF;

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT v_organismo_unidad_operativa,
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'autonomia'),
         (SELECT o.id FROM taxonomia_opciones o
            JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
           WHERE p.codigo = 'autonomia' LIMIT 1);

  RAISE EXCEPTION 'FALLO (a): se esperaba rechazo';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%no aplica al tipo de organismo actual%' THEN
      RAISE NOTICE 'OK (a): escritura nueva para una pregunta que no aplica al tipo del organismo — RECHAZADA (Protección A)';
    ELSE
      RAISE;
    END IF;
END $$;

-- ===========================================================================
-- (b) POSITIVO — sin falso positivo: una escritura nueva para una
-- pregunta que SÍ aplica al tipo real del organismo se sigue aceptando.
-- Ninguna de las 9 migradas aplica a 'unidad operativa', así que se da de
-- alta una pregunta de prueba aplicable a 'oficina judicial' (id=1).
-- ===========================================================================
INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_us4_positivo', 'Prueba US4 control positivo', 'gestion', 'numerica', 600);

INSERT INTO taxonomia_pregunta_tipos_oficina (pregunta_id, tipo_oficina_id)
SELECT id, 1 FROM taxonomia_preguntas WHERE codigo = 'prueba_us4_positivo';

DO $$
DECLARE
  v_organismo_oficina_judicial bigint;
BEGIN
  SELECT id INTO v_organismo_oficina_judicial FROM organismos WHERE tipo_oficina_id = 1 LIMIT 1;

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_numero)
  SELECT v_organismo_oficina_judicial, (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us4_positivo'), 1;

  RAISE NOTICE 'OK (b): escritura nueva para una pregunta que SÍ aplica al tipo del organismo — aceptada, sin falso positivo';
END $$;

-- ===========================================================================
-- (c) Confirmación explícita — organismo id=311 sigue intacto después de
-- (a) y (b). Ninguna de las dos operaciones anteriores lo tocó (ni
-- debería: (a) usó otro organismo, (b) usó otro organismo también), pero
-- se confirma el conteo explícitamente, no se asume.
-- ===========================================================================
DO $$
DECLARE
  v_conteo_311_despues integer;
BEGIN
  SELECT count(*) INTO v_conteo_311_despues FROM evaluaciones_taxonomicas WHERE organismo_id = 311;
  IF v_conteo_311_despues != 9 THEN
    RAISE EXCEPTION 'FALLO (c): organismo id=311 tiene % respuestas, se esperaban 9 — algo lo tocó', v_conteo_311_despues;
  END IF;
  RAISE NOTICE 'OK (c): organismo id=311 (OGA MEDIACIÓN) sigue con sus 9 respuestas históricas intactas — Protección A no lo tocó';
END $$;

ROLLBACK;
