-- T015 (US3, 003-taxonomia-parametrizable): "integridad garantizada por el
-- esquema" — el Independent Test de esta historia (spec.md) pide demostrar
-- que el modelo RECHAZA POR DISEÑO, no que un INSERT manual bien portado
-- respeta la regla (eso ya lo cubrió T014/US2, desde la perspectiva de
-- "agregar una pregunta nueva no rompe nada"). Esta corrida es la prueba
-- formal de US3, con una diferencia deliberada respecto de T014: cubre
-- los 3 casos de rechazo (FR-007, FR-004/FR-008, FR-006) tanto por INSERT
-- como por UPDATE (el trigger es BEFORE INSERT OR UPDATE — T014 solo
-- había probado el camino INSERT), y agrega un caso de INSERT en LOTE
-- (varias filas en un solo VALUES) para confirmar que una sola fila mala
-- aborta el lote entero, no que la fila mala se descarta en silencio.
--
-- Por qué a nivel de base y no de API: hoy no existe un endpoint de
-- aplicación funcional contra el esquema nuevo — el único que toca esta
-- tabla (`PUT /api/organismos/:orgId/taxonomia`, 002-backend-api-carga-datos)
-- quedó roto por esta migración (referencia columnas que ya no existen:
-- `column "autonomia" of relation "evaluaciones_taxonomicas" does not
-- exist", verificado aparte) y exponer el modelo nuevo es explícitamente
-- una feature de backend futura (spec.md, "Fuera de alcance explícito").
-- La prueba real de "ningún camino de la aplicación puede saltarse estas
-- reglas" no puede ser hoy "probé el endpoint" (no hay uno funcional) sino
-- "el trigger corre para CUALQUIER INSERT/UPDATE ordinario emitido con el
-- mismo rol que usa la aplicación (`observatorio_app`, la conexión de
-- DATABASE_URL con la que corre este mismo archivo) — no hay una capa de
-- aplicación que decida invocar una validación; Postgres la aplica antes
-- de que cualquier fila llegue a existir, sin importar qué código la
-- escriba, mientras use INSERT/UPDATE ordinarios (no una sentencia DDL
-- deliberada como ALTER TABLE ... DISABLE TRIGGER, que requiere ser
-- dueño de la tabla y es categóricamente distinta a cualquier operación
-- que un endpoint de escritura de datos emitiría alguna vez)".
--
-- Mismo patrón que db/validation/reglas_asignacion.sql (001) y
-- taxonomia_pregunta_nueva.sql (T014): fixtures por subquery de `codigo`
-- único, termina en ROLLBACK, no persiste nada.

BEGIN;

SELECT current_user \gset

DO $$
BEGIN
  RAISE NOTICE 'Corriendo como rol: % (debe ser el mismo rol que usa DATABASE_URL en la aplicación)', current_user;
END $$;

-- Fixtures: una pregunta opcion_unica de prueba (además de las 9
-- migradas, para no depender de datos de otra corrida) con 2 opciones, y
-- una numérica de prueba.
INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_us3_categorica', 'Prueba US3 (categórica)', 'gestion', 'opcion_unica', 300);

INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
SELECT id, 'SI', 'Sí', 1 FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica'
UNION ALL
SELECT id, 'NO', 'No', 2 FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica';

INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_us3_numerica', 'Prueba US3 (numérica)', 'gestion', 'numerica', 301);

-- ===========================================================================
-- (a) FR-007 por INSERT — opción de otra pregunta.
-- ===========================================================================
DO $$
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica'),
         (SELECT o.id FROM taxonomia_opciones o
            JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
           WHERE p.codigo = 'autonomia' LIMIT 1);
  RAISE EXCEPTION 'FALLO (a): se esperaba rechazo';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%pertenece a la pregunta%' THEN
      RAISE NOTICE 'OK (a) INSERT: opción de otra pregunta — rechazada (FR-007)';
    ELSE
      RAISE;
    END IF;
END $$;

-- ===========================================================================
-- (a-update) FR-007 por UPDATE — una fila válida se corrompe con opcion_id
-- de otra pregunta. El trigger es BEFORE INSERT *OR UPDATE*: T014 nunca
-- probó el camino UPDATE.
-- ===========================================================================
DO $$
DECLARE
  v_fila_id bigint;
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica'),
         (SELECT o.id FROM taxonomia_opciones o
            JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
           WHERE p.codigo = 'prueba_us3_categorica' AND o.codigo = 'SI')
  RETURNING id INTO v_fila_id;

  UPDATE evaluaciones_taxonomicas
  SET opcion_id = (SELECT o.id FROM taxonomia_opciones o
                      JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
                     WHERE p.codigo = 'autonomia' LIMIT 1)
  WHERE id = v_fila_id;

  RAISE EXCEPTION 'FALLO (a-update): se esperaba rechazo';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%pertenece a la pregunta%' THEN
      RAISE NOTICE 'OK (a-update): UPDATE que corrompe una fila válida con opción de otra pregunta — rechazado (FR-007, camino UPDATE del trigger)';
    ELSE
      RAISE;
    END IF;
END $$;

-- ===========================================================================
-- (b) FR-004/FR-008 por INSERT — respuesta con forma equivocada para una
-- pregunta numérica (valor_texto en vez de valor_numero). Nota: NO se
-- puede armar este caso reusando `opcion_id` de otra pregunta — desde la
-- migración 0002 (taxonomia_opciones ya rechaza crear una opción que
-- pertenezca de verdad a una pregunta numérica/texto_libre), cualquier
-- `opcion_id` que se use acá pertenece necesariamente a OTRA pregunta, lo
-- que dispara primero FR-007 (visto en la corrida original de este
-- archivo) y nunca llega a probar la rama de forma FR-008. Por eso el
-- caso correcto para FR-008 es uno que no toque `opcion_id` en absoluto.
-- ===========================================================================
DO $$
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_texto)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_numerica'),
         'texto en vez de número';
  RAISE EXCEPTION 'FALLO (b): se esperaba rechazo';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%es numerica%' THEN
      RAISE NOTICE 'OK (b) INSERT: respuesta con valor_texto para una pregunta numérica — rechazada (FR-004/FR-008)';
    ELSE
      RAISE;
    END IF;
END $$;

-- ===========================================================================
-- (b-update) FR-004/FR-008 por UPDATE — una respuesta numérica válida se
-- actualiza para llevar valor_texto en vez de valor_numero (forma
-- equivocada para su pregunta, aunque el CHECK de columna "exactamente
-- uno de tres" siga cumpliéndose).
-- ===========================================================================
DO $$
DECLARE
  v_fila_id bigint;
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, valor_numero)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_numerica'),
         7
  RETURNING id INTO v_fila_id;

  UPDATE evaluaciones_taxonomicas
  SET valor_numero = NULL, valor_texto = 'no debería aceptarse'
  WHERE id = v_fila_id;

  RAISE EXCEPTION 'FALLO (b-update): se esperaba rechazo';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%es numerica%' THEN
      RAISE NOTICE 'OK (b-update): UPDATE que cambia una respuesta numérica válida a valor_texto — rechazado (FR-004/FR-008, camino UPDATE del trigger)';
    ELSE
      RAISE;
    END IF;
END $$;

-- ===========================================================================
-- (c) FR-006 por INSERT — segunda respuesta al mismo par (organismo,
-- pregunta) en una pregunta que no es opcion_multiple.
-- ===========================================================================
-- Nota de diseño: el bloque EXCEPTION de PL/pgSQL revierte, a su punto de
-- guardado implícito, TODO lo hecho dentro del mismo BEGIN...END al
-- capturar una excepción — incluido un INSERT válido anterior en el mismo
-- bloque (se comprobó al correr este archivo: sin este anidamiento, la
-- primera respuesta válida desaparecía junto con el rechazo de la
-- segunda, y el caso "duplicado" nunca encontraba con qué chocar). Por
-- eso la respuesta de setup va en el nivel externo (sin manejo de
-- excepción, persiste en la transacción real) y solo el intento que debe
-- fallar queda en un bloque anidado.
DO $$
BEGIN
  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica'),
         (SELECT o.id FROM taxonomia_opciones o
            JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
           WHERE p.codigo = 'prueba_us3_categorica' AND o.codigo = 'SI');

  BEGIN
    INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
    SELECT (SELECT id FROM organismos ORDER BY id LIMIT 1),
           (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica'),
           (SELECT o.id FROM taxonomia_opciones o
              JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
             WHERE p.codigo = 'prueba_us3_categorica' AND o.codigo = 'NO');
    RAISE EXCEPTION 'FALLO (c): se esperaba rechazo';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%no es opcion_multiple%' THEN
        RAISE NOTICE 'OK (c) INSERT: segunda respuesta al mismo par organismo-pregunta (no opcion_multiple) — rechazada (FR-006)';
      ELSE
        RAISE;
      END IF;
  END;
END $$;

-- ===========================================================================
-- (c-update) FR-006 por UPDATE — dos filas válidas para DOS organismos
-- distintos a la misma pregunta (válido); un UPDATE que mueve la segunda
-- al mismo organismo de la primera debe ser rechazado por duplicar el par.
-- ===========================================================================
DO $$
DECLARE
  v_organismo_1 bigint;
  v_organismo_2 bigint;
  v_fila_2_id bigint;
BEGIN
  SELECT id INTO v_organismo_1 FROM organismos ORDER BY id LIMIT 1;
  SELECT id INTO v_organismo_2 FROM organismos WHERE id != v_organismo_1 ORDER BY id LIMIT 1;

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT v_organismo_1,
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica'),
         (SELECT o.id FROM taxonomia_opciones o
            JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
           WHERE p.codigo = 'prueba_us3_categorica' AND o.codigo = 'SI');

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  SELECT v_organismo_2,
         (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica'),
         (SELECT o.id FROM taxonomia_opciones o
            JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
           WHERE p.codigo = 'prueba_us3_categorica' AND o.codigo = 'NO')
  RETURNING id INTO v_fila_2_id;

  RAISE NOTICE 'OK (c-update, setup): dos respuestas válidas de dos organismos distintos a la misma pregunta — ambas aceptadas';

  UPDATE evaluaciones_taxonomicas SET organismo_id = v_organismo_1 WHERE id = v_fila_2_id;

  RAISE EXCEPTION 'FALLO (c-update): se esperaba rechazo';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%no es opcion_multiple%' THEN
      RAISE NOTICE 'OK (c-update): UPDATE que mueve una respuesta al organismo que ya tenía otra respuesta a la misma pregunta — rechazado (FR-006, camino UPDATE del trigger)';
    ELSE
      RAISE;
    END IF;
END $$;

-- ===========================================================================
-- (d) INSERT en LOTE — una sola sentencia con varias filas, una de ellas
-- inválida (FR-007). El trigger es FOR EACH ROW: confirma que el lote
-- entero se aborta (ninguna fila queda insertada), no que la fila mala se
-- descarta y las buenas quedan — la garantía es transaccional, no
-- fila-por-fila silenciosa.
-- ===========================================================================
DO $$
DECLARE
  v_antes integer;
  v_despues integer;
BEGIN
  SELECT count(*) INTO v_antes FROM evaluaciones_taxonomicas;

  INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
  VALUES
    ((SELECT id FROM organismos ORDER BY id LIMIT 1 OFFSET 2),
     (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica'),
     (SELECT o.id FROM taxonomia_opciones o JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
       WHERE p.codigo = 'prueba_us3_categorica' AND o.codigo = 'SI')),
    ((SELECT id FROM organismos ORDER BY id LIMIT 1 OFFSET 3),
     (SELECT id FROM taxonomia_preguntas WHERE codigo = 'prueba_us3_categorica'),
     (SELECT o.id FROM taxonomia_opciones o JOIN taxonomia_preguntas p ON p.id = o.pregunta_id
       WHERE p.codigo = 'autonomia' LIMIT 1));  -- fila mala: opción de otra pregunta

  RAISE EXCEPTION 'FALLO (d): se esperaba que el lote completo fuera rechazado';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%pertenece a la pregunta%' THEN
      SELECT count(*) INTO v_despues FROM evaluaciones_taxonomicas;
      IF v_despues != v_antes THEN
        RAISE EXCEPTION 'FALLO (d): el lote insertó % filas antes de rechazar la mala — no fue atómico', (v_despues - v_antes);
      END IF;
      RAISE NOTICE 'OK (d): INSERT en lote (2 filas, 1 inválida) — el lote entero se rechaza, 0 filas quedan (conteo antes=% después=%)', v_antes, v_despues;
    ELSE
      RAISE;
    END IF;
END $$;

ROLLBACK;
