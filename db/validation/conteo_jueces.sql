-- T014 (US1): valida el modelo de asignaciones de jueces (D8/FR-017/FR-018e)
-- con fixtures SINTÉTICOS (no datos reales). Reproduce el ejemplo de D8:
--   UF1 = 5 exclusivos + pool A completo (5) + subconjunto de 3 de pool B (10)
--   UF2 = pool A completo (5)
--   UF3 = pool B completo (10)
-- Por UF (sin deduplicar): UF1=13, UF2=5, UF3=10.
-- Agregado (cada grupo una vez por su total_jueces): 5+5+10 = 20, NUNCA 28
-- (28 = suma ingenua de las 5 filas de asignación: 5+5+3+5+10).
--
-- Todo corre dentro de una transacción que termina en ROLLBACK: no persiste
-- datos de fixture en la base.

BEGIN;

INSERT INTO usuarios (email, firestore_id)
VALUES ('fixture.jueces@example.com', 'fixture-jueces-usuario');

INSERT INTO organismos (denominacion, denominacion_simplificada_id, tipo_oficina_id,
                         provincia_id, propietario_id, estado_fueros, actualizado_a, firestore_id)
SELECT 'Organismo fixture D8',
       (SELECT id FROM denominaciones_simplificadas LIMIT 1),
       (SELECT id FROM tipos_oficina LIMIT 1),
       (SELECT id FROM provincias LIMIT 1),
       (SELECT id FROM usuarios WHERE firestore_id = 'fixture-jueces-usuario'),
       'sin_fueros_asignados', now(), 'fixture-jueces-organismo';

INSERT INTO localidades (nombre, provincia_id, latitud, longitud, firestore_id)
SELECT 'Localidad fixture D8', (SELECT id FROM provincias LIMIT 1), 0, 0, 'fixture-jueces-localidad';

INSERT INTO unidades_funcionales (organismo_id, denominacion_unidad, localidad_id, tipo_uf_id, firestore_id)
SELECT (SELECT id FROM organismos WHERE firestore_id = 'fixture-jueces-organismo'),
       uf.denominacion,
       (SELECT id FROM localidades WHERE firestore_id = 'fixture-jueces-localidad'),
       (SELECT id FROM tipos_uf LIMIT 1),
       uf.firestore_id
FROM (VALUES
        ('UF1 fixture', 'fixture-jueces-uf1'),
        ('UF2 fixture', 'fixture-jueces-uf2'),
        ('UF3 fixture', 'fixture-jueces-uf3')
     ) AS uf(denominacion, firestore_id);

-- grupos_jueces: 1 exclusivo derivado (firestore_id NULL, sin descripción) + 2 pools.
INSERT INTO grupos_jueces (descripcion, total_jueces, provincia_id, firestore_id) VALUES
  (NULL,            5,  (SELECT id FROM provincias LIMIT 1), NULL),
  ('Pool A fixture', 5,  (SELECT id FROM provincias LIMIT 1), 'fixture-pool-a'),
  ('Pool B fixture', 10, (SELECT id FROM provincias LIMIT 1), 'fixture-pool-b');

INSERT INTO unidad_funcional_grupo_jueces (unidad_funcional_id, grupo_jueces_id, cantidad_asignada) VALUES
  ((SELECT id FROM unidades_funcionales WHERE firestore_id = 'fixture-jueces-uf1'),
   (SELECT id FROM grupos_jueces WHERE firestore_id IS NULL), 5),
  ((SELECT id FROM unidades_funcionales WHERE firestore_id = 'fixture-jueces-uf1'),
   (SELECT id FROM grupos_jueces WHERE firestore_id = 'fixture-pool-a'), 5),
  ((SELECT id FROM unidades_funcionales WHERE firestore_id = 'fixture-jueces-uf1'),
   (SELECT id FROM grupos_jueces WHERE firestore_id = 'fixture-pool-b'), 3),
  ((SELECT id FROM unidades_funcionales WHERE firestore_id = 'fixture-jueces-uf2'),
   (SELECT id FROM grupos_jueces WHERE firestore_id = 'fixture-pool-a'), 5),
  ((SELECT id FROM unidades_funcionales WHERE firestore_id = 'fixture-jueces-uf3'),
   (SELECT id FROM grupos_jueces WHERE firestore_id = 'fixture-pool-b'), 10);

-- Por UF, sin deduplicar (FR-018e).
DO $$
DECLARE
  uf1 integer; uf2 integer; uf3 integer;
BEGIN
  SELECT COALESCE(SUM(a.cantidad_asignada), 0) INTO uf1
    FROM unidades_funcionales uf JOIN unidad_funcional_grupo_jueces a ON a.unidad_funcional_id = uf.id
    WHERE uf.firestore_id = 'fixture-jueces-uf1';
  SELECT COALESCE(SUM(a.cantidad_asignada), 0) INTO uf2
    FROM unidades_funcionales uf JOIN unidad_funcional_grupo_jueces a ON a.unidad_funcional_id = uf.id
    WHERE uf.firestore_id = 'fixture-jueces-uf2';
  SELECT COALESCE(SUM(a.cantidad_asignada), 0) INTO uf3
    FROM unidades_funcionales uf JOIN unidad_funcional_grupo_jueces a ON a.unidad_funcional_id = uf.id
    WHERE uf.firestore_id = 'fixture-jueces-uf3';

  IF (uf1, uf2, uf3) IS DISTINCT FROM (13, 5, 10) THEN
    RAISE EXCEPTION 'Conteo por UF esperado (13,5,10), obtenido (%,%,%)', uf1, uf2, uf3;
  END IF;
  RAISE NOTICE 'OK: conteo por UF = %/%/%', uf1, uf2, uf3;
END $$;

-- Agregado: cada grupo referenciado cuenta una sola vez por su total_jueces
-- (nunca sumando las cantidad_asignada por-UF -> nunca 28).
DO $$
DECLARE
  agregado integer;
BEGIN
  SELECT SUM(g.total_jueces) INTO agregado
  FROM grupos_jueces g
  WHERE (g.firestore_id IS NULL OR g.firestore_id IN ('fixture-pool-a', 'fixture-pool-b'))
    AND EXISTS (SELECT 1 FROM unidad_funcional_grupo_jueces a WHERE a.grupo_jueces_id = g.id);

  IF agregado != 20 THEN
    RAISE EXCEPTION 'Agregado esperado 20, obtenido %', agregado;
  END IF;
  RAISE NOTICE 'OK: agregado = % (nunca 28)', agregado;
END $$;

ROLLBACK;
