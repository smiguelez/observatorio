-- T014 (US2, 003-taxonomia-parametrizable): agregar una pregunta de
-- taxonomía nueva es una operación de DATOS, no de esquema — cero
-- ALTER TABLE. Fixtures sintéticos; termina en ROLLBACK, no persiste nada
-- (mismo patrón que db/validation/reglas_asignacion.sql de
-- 001-modelo-datos-relacional: las referencias entre fixtures se resuelven
-- por subquery contra un código único, no por variables de psql — las
-- variables `:var` de psql NO se sustituyen dentro de bloques
-- `DO $$ ... $$`, dollar-quoting es opaco para esa interpolación).
--
-- Cubre el Independent Test de US2 (spec.md) — (a)/(b) abajo — y además,
-- a pedido explícito, el caso negativo de US3/FR-007 aplicado
-- específicamente a una pregunta recién creada por esta misma corrida,
-- no solo a las 9 preguntas ya sembradas por la migración: confirma que
-- el trigger protege también los datos nuevos, no únicamente los
-- migrados.

BEGIN;

-- (a) Pregunta categórica nueva + 2 opciones + una respuesta válida a un
-- organismo REAL ya existente. Ninguna sentencia de cambio de esquema.
INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_us2_categorica', '¿Pregunta de prueba US2 (categórica)?', 'gestion', 'opcion_unica', 100);

INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
SELECT id, 'SI', 'Sí', 1 FROM taxonomia_preguntas WHERE codigo = 'prueba_us2_categorica'
UNION ALL
SELECT id, 'NO', 'No', 2 FROM taxonomia_preguntas WHERE codigo = 'prueba_us2_categorica';

DO $$
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us2_categorica'),
         (SELECT o.id FROM taxonomia_opciones o
            JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
           WHERE p.codigo = 'prueba_us2_categorica' AND o.codigo = 'SI');
  RAISE NOTICE 'OK (a): pregunta categórica nueva + opciones + respuesta a organismo real — aceptado, sin ALTER TABLE';
END $$;

-- (b) Pregunta numérica y pregunta de texto libre, SIN ninguna fila en
-- taxonomia_opciones (FR-004: no admiten opciones).
INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_us2_numerica', '¿Pregunta de prueba US2 (numérica)?', 'gestion', 'numerica', 101);

INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_us2_texto', '¿Pregunta de prueba US2 (texto libre)?', 'gestion', 'texto_libre', 102);

DO $$
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_numero)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us2_numerica'),
         42;
  RAISE NOTICE 'OK (b1): pregunta numérica sin ninguna opción — respuesta con valor_numero aceptada';
END $$;

DO $$
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_texto)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us2_texto'),
         'Respuesta libre de prueba';
  RAISE NOTICE 'OK (b2): pregunta texto_libre sin ninguna opción — respuesta con valor_texto aceptada';
END $$;

-- (c) NEGATIVO — pedido explícito: una respuesta a la pregunta categórica
-- NUEVA que use la opción de OTRA pregunta (una de las 9 ya migradas, no
-- relacionada) debe ser rechazada por el trigger, no aceptada por
-- descuido (FR-007). Confirma que la protección alcanza a preguntas
-- creadas dinámicamente, no solo a las sembradas por la migración.
DO $$
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us2_categorica'),
         (SELECT o.id FROM taxonomia_opciones o
            JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
           WHERE p.codigo = 'autonomia' LIMIT 1);

  RAISE EXCEPTION 'FALLO: se esperaba que la opción de "autonomia" fuera rechazada para la pregunta "prueba_us2_categorica"';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%pertenece a la pregunta%' THEN
      RAISE NOTICE 'OK (c): respuesta con opción de una pregunta distinta — rechazada por el trigger (FR-007)';
    ELSE
      RAISE;
    END IF;
END $$;

-- (d) NEGATIVO adicional — defensa en profundidad, no solo FR-007.
-- HALLAZGO de la corrida original de este archivo (ya CORREGIDO por la
-- migración 0002, ver caso (e) más abajo): en su momento el esquema no
-- impedía crear una opción "colgada" de una pregunta numérica en
-- taxonomia_opciones — FR-004 se cumplía solo del lado de las RESPUESTAS
-- (evaluaciones_taxonomicas), no del catálogo. Este test sigue existiendo
-- porque, aunque hoy (e) ya bloquea la causa raíz, la segunda capa de
-- defensa (el trigger de respuestas, FR-008) es igual de real y vale
-- seguir probándola: si alguna vez una opción colgada existiera igual
-- (dato legado previo a la migración 0002, restaurado desde un backup
-- viejo, etc.), la respuesta que intente usarla debe ser rechazada IGUAL,
-- no solo la creación de la opción. Como ya no se puede crear esa opción
-- por el camino normal (ver (e)), este test deshabilita el trigger nuevo
-- SOLO para simular ese escenario de dato preexistente — no es el camino
-- de creación real, es la forma de aislar y seguir probando esta segunda
-- capa de defensa.
DO $$
DECLARE
  v_opcion_colgada_id bigint;
BEGIN
  ALTER TABLE taxonomia_opciones DISABLE TRIGGER trg_opcion_tipo_pregunta_valido;

  INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
  SELECT id, 'X', 'Opción colgada de una pregunta numérica (simulando dato preexistente a la migración 0002)', 1
  FROM taxonomia_preguntas WHERE codigo = 'prueba_us2_numerica'
  RETURNING id INTO v_opcion_colgada_id;

  ALTER TABLE taxonomia_opciones ENABLE TRIGGER trg_opcion_tipo_pregunta_valido;

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us2_numerica'),
         v_opcion_colgada_id;

  RAISE EXCEPTION 'FALLO: se esperaba que una pregunta numerica rechazara una respuesta con opcion_id, aunque la opción SÍ pertenezca a esa pregunta';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%es numerica%' THEN
      RAISE NOTICE 'OK (d): pregunta numérica rechaza una respuesta con opcion_id incluso cuando la opción pertenece a ella — segunda capa de defensa (FR-008)';
    ELSE
      RAISE;
    END IF;
END $$;

-- (e) NEGATIVO — cierre del hallazgo de (d): desde la migración 0002
-- (backend/migrations/0002_taxonomia_opciones_guarda_tipo.ts,
-- research.md Decisión 5), taxonomia_opciones tiene su propia guarda
-- (trg_opcion_tipo_pregunta_valido) contra FR-004. La opción "colgada" que
-- (d) lograba crear sin rechazo ahora debe fallar en el INSERT de la
-- opción misma, antes de llegar siquiera a existir para una respuesta.
DO $$
BEGIN
  INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
  SELECT id, 'X', 'Opción colgada de una pregunta numérica (no debería existir — FR-004)', 1
  FROM taxonomia_preguntas WHERE codigo = 'prueba_us2_numerica';

  RAISE EXCEPTION 'FALLO: se esperaba que taxonomia_opciones rechazara una opción para una pregunta numerica (gap de FR-004 ya no debería existir)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%no admite opciones%' THEN
      RAISE NOTICE 'OK (e): opción colgada de una pregunta numérica — RECHAZADA por taxonomia_opciones directamente (FR-004, migración 0002) — el gap de (d) está cerrado';
    ELSE
      RAISE;
    END IF;
END $$;

ROLLBACK;
