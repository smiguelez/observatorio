-- T013 (US1, 003-taxonomia-parametrizable): el Independent Test real de
-- esta historia — no el conteo agregado de T012, sino que, para cada uno
-- de los 89 organismos con evaluación, las 9 respuestas nuevas
-- (organismo_id, pregunta.codigo, opcion.codigo) sean IDÉNTICAS valor por
-- valor a las 9 columnas de evaluaciones_taxonomicas_v1_legacy, en las dos
-- direcciones:
--   (A) "nada de más": ninguna fila nueva existe sin un valor viejo
--       correspondiente (o con un valor distinto al viejo).
--   (B) "nada de menos": ningún valor viejo se quedó sin su fila nueva
--       correspondiente.
-- Un chequeo de conteo total (801=801, T012/SC-002) NO alcanza para esto:
-- dos organismos podrían haber intercambiado una respuesta entre sí (o una
-- respuesta podría haber quedado en la pregunta equivocada) sin que el
-- conteo total lo note. Esta comparación es fila por fila, con el mismo
-- unpivot que usó la migración (T009) para poder comparar como si el viejo
-- ya estuviera en la forma nueva.
--
-- Solo lectura — no inserta ni modifica nada, no lleva BEGIN/ROLLBACK.
-- evaluaciones_taxonomicas_v1_legacy no tiene columnas nullable (las 9 son
-- NOT NULL con CHECK — confirmado por \d), así que las 89 filas aportan
-- exactamente 89×9=801 valores, sin necesidad de filtrar nulos; se filtra
-- igual por robustez, sin asumirlo.

DO $$
DECLARE
  v_organismos_legacy integer;
  v_organismos_nuevo integer;
  v_faltantes_en_nuevo integer;
  v_sobrantes_en_nuevo integer;
  v_organismos_con_conteo_distinto integer;
BEGIN
  -- Universo: los 89 organismos con fila en la tabla vieja.
  SELECT count(*) INTO v_organismos_legacy FROM evaluaciones_taxonomicas_v1_legacy;
  IF v_organismos_legacy != 89 THEN
    RAISE EXCEPTION 'FALLO: se esperaban 89 organismos en evaluaciones_taxonomicas_v1_legacy, hay %', v_organismos_legacy;
  END IF;
  RAISE NOTICE 'OK: evaluaciones_taxonomicas_v1_legacy tiene 89 organismos (universo de esta comparación)';

  -- Mismo universo de organismos representado del lado nuevo, restringido
  -- a las 9 preguntas migradas (no a cualquier pregunta de prueba que
  -- pudiera existir de otras corridas — todas esas terminan en ROLLBACK,
  -- pero se filtra explícito para no depender de eso).
  SELECT count(DISTINCT e.organismo_id) INTO v_organismos_nuevo
  FROM evaluaciones_taxonomicas e
  JOIN taxonomia_preguntas p ON p.id = e.pregunta_id
  WHERE p.codigo IN (
    'autonomia', 'insercion_institucional', 'jerarquia_normativa', 'dependencia',
    'asistencia_jurisdiccional', 'alcance_proceso', 'alcance_fuero',
    'presencia_territorial', 'grado_implementacion'
  );
  IF v_organismos_nuevo != 89 THEN
    RAISE EXCEPTION 'FALLO: se esperaban 89 organismos representados en evaluaciones_taxonomicas (preguntas migradas), hay %', v_organismos_nuevo;
  END IF;
  RAISE NOTICE 'OK: evaluaciones_taxonomicas tiene exactamente los mismos 89 organismos representados (preguntas migradas)';

  -- (B) "nada de menos": todo valor viejo tiene su fila nueva idéntica
  -- (mismo organismo, misma pregunta por código, mismo valor de opción
  -- por código) del otro lado.
  WITH viejo_unpivotado AS (
    SELECT v.organismo_id, r.codigo_pregunta, r.valor
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
    ) AS r(codigo_pregunta, valor)
    WHERE r.valor IS NOT NULL
  ),
  nuevo_normalizado AS (
    SELECT e.organismo_id, p.codigo AS codigo_pregunta, o.codigo AS valor
    FROM evaluaciones_taxonomicas e
    JOIN taxonomia_preguntas p ON p.id = e.pregunta_id
    JOIN taxonomia_opciones o ON o.id = e.opcion_id
    WHERE p.codigo IN (
      'autonomia', 'insercion_institucional', 'jerarquia_normativa', 'dependencia',
      'asistencia_jurisdiccional', 'alcance_proceso', 'alcance_fuero',
      'presencia_territorial', 'grado_implementacion'
    )
  )
  SELECT count(*) INTO v_faltantes_en_nuevo
  FROM viejo_unpivotado vi
  LEFT JOIN nuevo_normalizado nu
    ON nu.organismo_id = vi.organismo_id
   AND nu.codigo_pregunta = vi.codigo_pregunta
   AND nu.valor = vi.valor
  WHERE nu.organismo_id IS NULL;

  IF v_faltantes_en_nuevo != 0 THEN
    RAISE EXCEPTION 'FALLO (nada de menos): % valores de la tabla vieja no tienen una fila nueva idéntica (organismo, pregunta, opción)', v_faltantes_en_nuevo;
  END IF;
  RAISE NOTICE 'OK (nada de menos): los 801 valores de evaluaciones_taxonomicas_v1_legacy tienen su fila nueva idéntica en evaluaciones_taxonomicas';

  -- (A) "nada de más": toda fila nueva (de las 9 preguntas migradas)
  -- corresponde a un valor real de la tabla vieja — ninguna aparece de la
  -- nada, ninguna quedó asignada a la pregunta equivocada.
  WITH viejo_unpivotado AS (
    SELECT v.organismo_id, r.codigo_pregunta, r.valor
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
    ) AS r(codigo_pregunta, valor)
    WHERE r.valor IS NOT NULL
  ),
  nuevo_normalizado AS (
    SELECT e.organismo_id, p.codigo AS codigo_pregunta, o.codigo AS valor
    FROM evaluaciones_taxonomicas e
    JOIN taxonomia_preguntas p ON p.id = e.pregunta_id
    JOIN taxonomia_opciones o ON o.id = e.opcion_id
    WHERE p.codigo IN (
      'autonomia', 'insercion_institucional', 'jerarquia_normativa', 'dependencia',
      'asistencia_jurisdiccional', 'alcance_proceso', 'alcance_fuero',
      'presencia_territorial', 'grado_implementacion'
    )
  )
  SELECT count(*) INTO v_sobrantes_en_nuevo
  FROM nuevo_normalizado nu
  LEFT JOIN viejo_unpivotado vi
    ON vi.organismo_id = nu.organismo_id
   AND vi.codigo_pregunta = nu.codigo_pregunta
   AND vi.valor = nu.valor
  WHERE vi.organismo_id IS NULL;

  IF v_sobrantes_en_nuevo != 0 THEN
    RAISE EXCEPTION 'FALLO (nada de más): % filas nuevas (organismo, pregunta, opción) no corresponden a ningún valor real de la tabla vieja', v_sobrantes_en_nuevo;
  END IF;
  RAISE NOTICE 'OK (nada de más): las 801 filas de evaluaciones_taxonomicas (preguntas migradas) corresponden todas a un valor real de evaluaciones_taxonomicas_v1_legacy';

  -- Chequeo adicional por organismo: ningún organismo individual tiene un
  -- conteo de respuestas nuevas distinto de 9 (detecta un intercambio
  -- entre dos organismos que el conteo agregado no vería: si el organismo
  -- X perdiera una respuesta y el Y ganara una de más, el total seguiría
  -- dando 801, pero acá aparecería como discrepancia puntual).
  SELECT count(*) INTO v_organismos_con_conteo_distinto
  FROM (
    SELECT e.organismo_id, count(*) AS cantidad
    FROM evaluaciones_taxonomicas e
    JOIN taxonomia_preguntas p ON p.id = e.pregunta_id
    WHERE p.codigo IN (
      'autonomia', 'insercion_institucional', 'jerarquia_normativa', 'dependencia',
      'asistencia_jurisdiccional', 'alcance_proceso', 'alcance_fuero',
      'presencia_territorial', 'grado_implementacion'
    )
    GROUP BY e.organismo_id
  ) t
  WHERE t.cantidad != 9;

  IF v_organismos_con_conteo_distinto != 0 THEN
    RAISE EXCEPTION 'FALLO: % organismos tienen una cantidad de respuestas distinta de 9', v_organismos_con_conteo_distinto;
  END IF;
  RAISE NOTICE 'OK: los 89 organismos tienen exactamente 9 respuestas cada uno, ninguno de más ni de menos';
END $$;
