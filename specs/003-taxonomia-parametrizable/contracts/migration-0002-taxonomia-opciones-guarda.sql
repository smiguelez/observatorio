-- Migración 0002 — Guarda de integridad en taxonomia_opciones (FR-004)
-- 003-taxonomia-parametrizable
--
-- Corrige un gap real encontrado al verificar T014 (US2): taxonomia_opciones
-- no tenía ninguna restricción propia contra crear una opción para una
-- pregunta cuyo tipo_respuesta no sea opcion_unica/opcion_multiple. El
-- trigger de la migración 0001 (validar_respuesta_taxonomia) protege las
-- RESPUESTAS, no el catálogo de opciones en sí — se pudo insertar una
-- opción "colgada" de una pregunta numérica sin ningún rechazo.
--
-- Decisión de ubicación (0002 nueva, no ajuste a 0001): ver research.md,
-- Decisión 5 — 0001 ya está aplicada y trackeada; editarla no re-ejecuta
-- nada en esta base y deja el archivo desincronizado del historial real.
--
-- Mismo patrón que validar_respuesta_taxonomia() (0001, Decisión 2): un
-- CHECK de columna no puede consultar taxonomia_preguntas.tipo_respuesta de
-- otra tabla, hace falta un trigger.

BEGIN;

CREATE FUNCTION validar_opcion_tipo_pregunta() RETURNS trigger AS $$
DECLARE
  v_tipo_respuesta text;
BEGIN
  SELECT tipo_respuesta INTO v_tipo_respuesta
  FROM taxonomia_preguntas WHERE id = NEW.pregunta_id;

  IF v_tipo_respuesta IS NULL THEN
    RAISE EXCEPTION 'taxonomia_opciones: pregunta_id % no existe', NEW.pregunta_id;
  END IF;

  IF v_tipo_respuesta NOT IN ('opcion_unica', 'opcion_multiple') THEN
    RAISE EXCEPTION
      'taxonomia_opciones: la pregunta % es % — no admite opciones (FR-004)',
      NEW.pregunta_id, v_tipo_respuesta;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_opcion_tipo_pregunta_valido
  BEFORE INSERT OR UPDATE ON taxonomia_opciones
  FOR EACH ROW EXECUTE FUNCTION validar_opcion_tipo_pregunta();

-- Negativo: intentar crear una opción para una pregunta numérica debe
-- fallar ANTES de llegar siquiera a existir la fila en taxonomia_opciones.
DO $$
BEGIN
  INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
  VALUES ('prueba_0002_numerica', 'Prueba 0002 (numérica)', 'gestion', 'numerica', 200);

  BEGIN
    INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
    SELECT id, 'X', 'No debería poder crearse', 1
    FROM taxonomia_preguntas WHERE codigo = 'prueba_0002_numerica';

    RAISE EXCEPTION 'FALLO: se esperaba que la guarda rechazara una opción para una pregunta numerica';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%no admite opciones%' THEN
        RAISE NOTICE 'OK: opción para pregunta numérica rechazada por trg_opcion_tipo_pregunta_valido (FR-004)';
      ELSE
        RAISE;
      END IF;
  END;
END $$;

-- Control positivo: una opción para una pregunta opcion_unica existente
-- sigue aceptándose sin cambios.
DO $$
BEGIN
  INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
  SELECT id, 'PRUEBA_0002_OK', 'Control positivo', 99
  FROM taxonomia_preguntas WHERE codigo = 'autonomia';
  RAISE NOTICE 'OK: opción para pregunta opcion_unica existente — aceptada sin cambios';
END $$;

ROLLBACK;
