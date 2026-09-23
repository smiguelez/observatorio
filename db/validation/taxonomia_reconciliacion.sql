-- T012 (US1, 003-taxonomia-parametrizable): confirmar contra la base REAL
-- ya migrada (no fixtures, no ROLLBACK — esto lee el resultado persistido
-- de la migración 0001) los conteos que quickstart.md Pasos 3-4 declaran
-- esperables: 9 preguntas, 18 filas en taxonomia_pregunta_tipos_oficina
-- (9 preguntas × 2 tipos de oficina), 32 opciones, 801 respuestas, y que
-- la última fila de reconciliación para esta entidad diga 'coincide' con
-- origen=destino=801.
--
-- Solo lectura — no inserta ni modifica nada, así que no lleva
-- BEGIN/ROLLBACK (a diferencia de taxonomia_pregunta_nueva.sql y
-- taxonomia_respuestas_*.sql, que sí prueban fixtures hipotéticos).

DO $$
DECLARE
  v_preguntas integer;
  v_tipos_oficina integer;
  v_opciones integer;
  v_respuestas integer;
  v_reconciliacion record;
BEGIN
  SELECT count(*) INTO v_preguntas FROM taxonomia_preguntas;
  IF v_preguntas != 9 THEN
    RAISE EXCEPTION 'FALLO: se esperaban 9 preguntas, hay %', v_preguntas;
  END IF;
  RAISE NOTICE 'OK: taxonomia_preguntas tiene 9 filas';

  SELECT count(*) INTO v_tipos_oficina FROM taxonomia_pregunta_tipos_oficina;
  IF v_tipos_oficina != 18 THEN
    RAISE EXCEPTION 'FALLO: se esperaban 18 filas en taxonomia_pregunta_tipos_oficina, hay %', v_tipos_oficina;
  END IF;
  RAISE NOTICE 'OK: taxonomia_pregunta_tipos_oficina tiene 18 filas (9 preguntas × 2 tipos de oficina)';

  SELECT count(*) INTO v_opciones FROM taxonomia_opciones;
  IF v_opciones != 32 THEN
    RAISE EXCEPTION 'FALLO: se esperaban 32 opciones, hay %', v_opciones;
  END IF;
  RAISE NOTICE 'OK: taxonomia_opciones tiene 32 filas';

  SELECT count(*) INTO v_respuestas FROM evaluaciones_taxonomicas;
  IF v_respuestas != 801 THEN
    RAISE EXCEPTION 'FALLO: se esperaban 801 respuestas, hay %', v_respuestas;
  END IF;
  RAISE NOTICE 'OK: evaluaciones_taxonomicas tiene 801 filas';

  SELECT entidad, conteo_origen, conteo_destino, resultado
    INTO v_reconciliacion
    FROM migracion_reconciliacion
   WHERE entidad = 'evaluaciones_taxonomicas_respuestas'
   ORDER BY corrida_a DESC LIMIT 1;

  IF v_reconciliacion IS NULL THEN
    RAISE EXCEPTION 'FALLO: no hay ninguna fila de reconciliación para evaluaciones_taxonomicas_respuestas';
  END IF;

  IF v_reconciliacion.resultado != 'coincide'
     OR v_reconciliacion.conteo_origen != 801
     OR v_reconciliacion.conteo_destino != 801 THEN
    RAISE EXCEPTION 'FALLO: reconciliación no coincide — origen=% destino=% resultado=%',
      v_reconciliacion.conteo_origen, v_reconciliacion.conteo_destino, v_reconciliacion.resultado;
  END IF;
  RAISE NOTICE 'OK: migracion_reconciliacion — origen=801 destino=801 resultado=coincide';
END $$;
