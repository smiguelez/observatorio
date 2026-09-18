-- T015 (US1): valida las reglas de FR-018 con intentos NEGATIVOS que deben
-- fallar (quickstart.md Paso 5): (a) cantidad_asignada > 0 (CHECK); (b) a lo
-- sumo una asignación por (UF, grupo) (UNIQUE); (c) trigger
-- trg_asignacion_fuero_dentro_de_uf: un fuero de asignación no puede exceder
-- los fueros del organismo de la UF (FR-018f). Fixtures SINTÉTICOS; termina en
-- ROLLBACK, no persiste datos.

BEGIN;

INSERT INTO usuarios (email, firestore_id)
VALUES ('fixture.reglas@example.com', 'fixture-reglas-usuario');

-- Organismo que SOLO atiende el fuero 'penal'.
INSERT INTO organismos (denominacion, denominacion_simplificada_id, tipo_oficina_id,
                         provincia_id, propietario_id, estado_fueros, actualizado_a, firestore_id)
SELECT 'Organismo fixture reglas',
       (SELECT id FROM denominaciones_simplificadas LIMIT 1),
       (SELECT id FROM tipos_oficina LIMIT 1),
       (SELECT id FROM provincias LIMIT 1),
       (SELECT id FROM usuarios WHERE firestore_id = 'fixture-reglas-usuario'),
       'cargado', now(), 'fixture-reglas-organismo';

INSERT INTO organismo_fueros (organismo_id, fuero_id)
SELECT (SELECT id FROM organismos WHERE firestore_id = 'fixture-reglas-organismo'),
       (SELECT id FROM fueros WHERE nombre = 'penal');

INSERT INTO localidades (nombre, provincia_id, latitud, longitud, firestore_id)
SELECT 'Localidad fixture reglas', (SELECT id FROM provincias LIMIT 1), 0, 0, 'fixture-reglas-localidad';

INSERT INTO unidades_funcionales (organismo_id, denominacion_unidad, localidad_id, tipo_uf_id, firestore_id)
SELECT (SELECT id FROM organismos WHERE firestore_id = 'fixture-reglas-organismo'),
       'UF fixture reglas',
       (SELECT id FROM localidades WHERE firestore_id = 'fixture-reglas-localidad'),
       (SELECT id FROM tipos_uf LIMIT 1),
       'fixture-reglas-uf';

-- Dos grupos: A (usado en la asignación base) y B (libre, para el intento (a)).
INSERT INTO grupos_jueces (descripcion, total_jueces, provincia_id, firestore_id) VALUES
  ('Grupo A fixture', 3, (SELECT id FROM provincias LIMIT 1), 'fixture-reglas-grupo-a'),
  ('Grupo B fixture', 3, (SELECT id FROM provincias LIMIT 1), 'fixture-reglas-grupo-b');

-- Asignación base válida (UF, grupo A) -> usada para probar (b) y (c).
INSERT INTO unidad_funcional_grupo_jueces (unidad_funcional_id, grupo_jueces_id, cantidad_asignada)
SELECT (SELECT id FROM unidades_funcionales WHERE firestore_id = 'fixture-reglas-uf'),
       (SELECT id FROM grupos_jueces WHERE firestore_id = 'fixture-reglas-grupo-a'),
       2;

-- (a) cantidad_asignada > 0 (CHECK) — par (UF, grupo B), nunca insertado antes.
DO $$
BEGIN
  INSERT INTO unidad_funcional_grupo_jueces (unidad_funcional_id, grupo_jueces_id, cantidad_asignada)
  SELECT (SELECT id FROM unidades_funcionales WHERE firestore_id = 'fixture-reglas-uf'),
         (SELECT id FROM grupos_jueces WHERE firestore_id = 'fixture-reglas-grupo-b'),
         0;
  RAISE EXCEPTION 'FALLO: se esperaba que cantidad_asignada = 0 violara el CHECK';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'OK (a): cantidad_asignada = 0 rechazada por CHECK';
END $$;

-- (b) UNIQUE (unidad_funcional_id, grupo_jueces_id) — repetir el par base.
DO $$
BEGIN
  INSERT INTO unidad_funcional_grupo_jueces (unidad_funcional_id, grupo_jueces_id, cantidad_asignada)
  SELECT (SELECT id FROM unidades_funcionales WHERE firestore_id = 'fixture-reglas-uf'),
         (SELECT id FROM grupos_jueces WHERE firestore_id = 'fixture-reglas-grupo-a'),
         1;
  RAISE EXCEPTION 'FALLO: se esperaba que el par (UF, grupo) duplicado violara UNIQUE';
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'OK (b): par (UF, grupo) duplicado rechazado por UNIQUE';
END $$;

-- (c) trigger trg_asignacion_fuero_dentro_de_uf (FR-018f): 'civil' no está en
-- organismo_fueros de este organismo (solo tiene 'penal') -> debe rechazar.
DO $$
BEGIN
  INSERT INTO asignacion_fueros (asignacion_id, fuero_id)
  SELECT a.id, (SELECT id FROM fueros WHERE nombre = 'civil')
  FROM unidad_funcional_grupo_jueces a
  JOIN unidades_funcionales uf ON uf.id = a.unidad_funcional_id
  WHERE uf.firestore_id = 'fixture-reglas-uf';
  RAISE EXCEPTION 'FALLO: se esperaba que el fuero ajeno (civil) violara el trigger';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%excede los fueros del organismo%' THEN
      RAISE NOTICE 'OK (c): fuero ajeno a organismo_fueros rechazado por el trigger';
    ELSE
      RAISE;
    END IF;
END $$;

-- Control positivo: 'penal' SÍ está en organismo_fueros -> debe aceptarse.
DO $$
BEGIN
  INSERT INTO asignacion_fueros (asignacion_id, fuero_id)
  SELECT a.id, (SELECT id FROM fueros WHERE nombre = 'penal')
  FROM unidad_funcional_grupo_jueces a
  JOIN unidades_funcionales uf ON uf.id = a.unidad_funcional_id
  WHERE uf.firestore_id = 'fixture-reglas-uf';
  RAISE NOTICE 'OK (control): fuero propio del organismo (penal) aceptado';
END $$;

ROLLBACK;
