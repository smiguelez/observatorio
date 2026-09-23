-- T016 (US3, 003-taxonomia-parametrizable): control positivo — el trigger
-- rechaza lo inválido (taxonomia_respuestas_rechazo.sql, T015), pero no
-- todo. Prueba que una respuesta válida se acepta para cada uno de los 4
-- tipos de pregunta (opcion_unica, opcion_multiple, numerica, texto_libre),
-- incluida más de una respuesta válida para una pregunta opcion_multiple
-- (el único caso donde FR-006 no aplica), un INSERT en lote 100% válido
-- (contraste directo del lote parcialmente inválido de T015-d), y un
-- UPDATE válido sobre una fila existente (contraste de T015 b-update/
-- c-update, que probaban UPDATE inválidos).
--
-- Ninguna de las 9 preguntas migradas es opcion_multiple — se crea una de
-- prueba para poder probar ese camino. Mismo patrón que T014/T015:
-- fixtures por subquery de código único, termina en ROLLBACK.

BEGIN;

INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_us3_multiple', 'Prueba US3 (opcion_multiple)', 'gestion', 'opcion_multiple', 302);

INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
SELECT id, 'A', 'Opción A', 1 FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_multiple'
UNION ALL
SELECT id, 'B', 'Opción B', 2 FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_multiple'
UNION ALL
SELECT id, 'C', 'Opción C', 3 FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_multiple';

INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_us3_categorica_ok', 'Prueba US3 control positivo (categórica)', 'gestion', 'opcion_unica', 303);

INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
SELECT id, 'SI', 'Sí', 1 FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica_ok';

INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_us3_numerica_ok', 'Prueba US3 control positivo (numérica)', 'gestion', 'numerica', 304);

INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_us3_texto_ok', 'Prueba US3 control positivo (texto_libre)', 'gestion', 'texto_libre', 305);

-- ===========================================================================
-- (a) Respuesta válida para cada uno de los 4 tipos.
-- ===========================================================================
DO $$
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica_ok'),
         (SELECT o.id FROM taxonomia_opciones o JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
           WHERE p.codigo = 'prueba_us3_categorica_ok' AND o.codigo = 'SI');

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_numero)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_numerica_ok'),
         12345;

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_texto)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_texto_ok'),
         'Respuesta libre válida';

  RAISE NOTICE 'OK (a): respuesta válida aceptada para opcion_unica, numerica y texto_libre';
END $$;

-- ===========================================================================
-- (b) opcion_multiple — varias filas para el MISMO par (organismo,
-- pregunta), una por opción seleccionada. Es el único caso donde FR-006
-- (T015-c) no aplica: el trigger excluye explícitamente opcion_multiple de
-- esa regla.
-- ===========================================================================
DO $$
DECLARE
  v_cantidad integer;
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_multiple'),
         o.id
  FROM taxonomia_opciones o
  JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
  WHERE p.codigo = 'prueba_us3_multiple' AND o.codigo IN ('A', 'B');

  SELECT count(*) INTO v_cantidad
  FROM evaluaciones_taxonomicas e
  JOIN taxonomia_preguntas p ON p.id = e.pregunta_id
  WHERE p.codigo = 'prueba_us3_multiple'
    AND e.organismo_id = (SELECT id FROM organismos ORDER BY id LIMIT 1);

  IF v_cantidad != 2 THEN
    RAISE EXCEPTION 'FALLO (b): se esperaban 2 filas para opcion_multiple, hay %', v_cantidad;
  END IF;

  RAISE NOTICE 'OK (b): 2 respuestas válidas para el mismo par (organismo, pregunta) en una pregunta opcion_multiple — ambas aceptadas (FR-006 no aplica)';
END $$;

-- ===========================================================================
-- (c) INSERT en LOTE 100% válido — contraste directo de T015-d (lote con
-- una fila mala se rechaza entero). Confirma que un lote todo-válido se
-- acepta entero en una sola sentencia, no fila por fila.
-- ===========================================================================
DO $$
DECLARE
  v_antes integer;
  v_despues integer;
BEGIN
  SELECT count(*) INTO v_antes FROM evaluaciones_taxonomicas;

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  VALUES
    ((SELECT id FROM organismos ORDER BY id LIMIT 1 OFFSET 4),
     (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica_ok'),
     (SELECT o.id FROM taxonomia_opciones o JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
       WHERE p.codigo = 'prueba_us3_categorica_ok' AND o.codigo = 'SI')),
    ((SELECT id FROM organismos ORDER BY id LIMIT 1 OFFSET 5),
     (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica_ok'),
     (SELECT o.id FROM taxonomia_opciones o JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
       WHERE p.codigo = 'prueba_us3_categorica_ok' AND o.codigo = 'SI'));

  SELECT count(*) INTO v_despues FROM evaluaciones_taxonomicas;

  IF v_despues - v_antes != 2 THEN
    RAISE EXCEPTION 'FALLO (c): se esperaban 2 filas nuevas, hubo %', (v_despues - v_antes);
  END IF;

  RAISE NOTICE 'OK (c): INSERT en lote (2 filas, ambas válidas) — aceptado entero (conteo antes=% después=%)', v_antes, v_despues;
END $$;

-- ===========================================================================
-- (d) UPDATE válido — cambiar una respuesta numérica existente por otro
-- valor numérico también válido. Contraste de T015 b-update/c-update, que
-- probaban UPDATE inválidos.
-- ===========================================================================
DO $$
DECLARE
  v_fila_id bigint;
  v_valor_final numeric;
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_numero)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1 OFFSET 6),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_numerica_ok'),
         1
  RETURNING id INTO v_fila_id;

  UPDATE evaluaciones_taxonomicas SET valor_numero = 99 WHERE id = v_fila_id;

  SELECT valor_numero INTO v_valor_final FROM evaluaciones_taxonomicas WHERE id = v_fila_id;

  IF v_valor_final != 99 THEN
    RAISE EXCEPTION 'FALLO (d): se esperaba valor_numero=99, quedó %', v_valor_final;
  END IF;

  RAISE NOTICE 'OK (d): UPDATE válido (valor_numero 1 → 99) sobre una fila existente — aceptado';
END $$;

ROLLBACK;
