-- T026 (US3): el esquema rechaza referencias rotas POR DISEÑO (FR-025,
-- Principio VIII) — no solo "no hay huérfanos hoy" (T025), sino "es
-- imposible crear uno". Intentos NEGATIVOS de insertar un id inexistente en
-- cada FK crítica; cada uno debe fallar con foreign_key_violation (SQLSTATE
-- 23503). Usa filas EXISTENTES de datos ya migrados como ancla y un id
-- inexistente (-1) del lado roto. Termina en ROLLBACK: no persiste nada.

BEGIN;

-- (a) unidades_funcionales.localidad_id -> localidades.id
DO $$
BEGIN
  INSERT INTO unidades_funcionales (organismo_id, denominacion_unidad, localidad_id, tipo_uf_id, firestore_id)
  SELECT (SELECT id FROM organismos LIMIT 1),
         'UF fixture rechazo (localidad rota)',
         -1,
         (SELECT id FROM tipos_uf LIMIT 1),
         'fixture-rechazo-uf-localidad';
  RAISE EXCEPTION 'FALLO: se esperaba que localidad_id=-1 violara la FK a localidades';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK (a): unidades_funcionales.localidad_id inexistente rechazado por FK';
END $$;

-- (b) unidad_funcional_grupo_jueces.unidad_funcional_id -> unidades_funcionales.id
DO $$
BEGIN
  INSERT INTO unidad_funcional_grupo_jueces (unidad_funcional_id, grupo_jueces_id, cantidad_asignada)
  SELECT -1, (SELECT id FROM grupos_jueces LIMIT 1), 1;
  RAISE EXCEPTION 'FALLO: se esperaba que unidad_funcional_id=-1 violara la FK a unidades_funcionales';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK (b): unidad_funcional_grupo_jueces.unidad_funcional_id inexistente rechazado por FK';
END $$;

-- (c) unidad_funcional_grupo_jueces.grupo_jueces_id -> grupos_jueces.id
DO $$
BEGIN
  INSERT INTO unidad_funcional_grupo_jueces (unidad_funcional_id, grupo_jueces_id, cantidad_asignada)
  SELECT (SELECT id FROM unidades_funcionales LIMIT 1), -1, 1;
  RAISE EXCEPTION 'FALLO: se esperaba que grupo_jueces_id=-1 violara la FK a grupos_jueces';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK (c): unidad_funcional_grupo_jueces.grupo_jueces_id inexistente rechazado por FK';
END $$;

-- (d) organismos.propietario_id -> usuarios.id
DO $$
BEGIN
  INSERT INTO organismos (denominacion, denominacion_simplificada_id, tipo_oficina_id,
                           provincia_id, propietario_id, estado_fueros, actualizado_a, firestore_id)
  SELECT 'Organismo fixture rechazo (propietario roto)',
         (SELECT id FROM denominaciones_simplificadas LIMIT 1),
         (SELECT id FROM tipos_oficina LIMIT 1),
         (SELECT id FROM provincias LIMIT 1),
         -1,
         'sin_fueros_asignados', now(), 'fixture-rechazo-organismo-propietario';
  RAISE EXCEPTION 'FALLO: se esperaba que propietario_id=-1 violara la FK a usuarios';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK (d): organismos.propietario_id inexistente rechazado por FK';
END $$;

-- (e) organismo_editores.usuario_id -> usuarios.id
DO $$
BEGIN
  INSERT INTO organismo_editores (organismo_id, usuario_id)
  SELECT (SELECT id FROM organismos LIMIT 1), -1;
  RAISE EXCEPTION 'FALLO: se esperaba que usuario_id=-1 violara la FK a usuarios';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK (e): organismo_editores.usuario_id inexistente rechazado por FK';
END $$;

-- (f) organismo_editores.organismo_id -> organismos.id
DO $$
BEGIN
  INSERT INTO organismo_editores (organismo_id, usuario_id)
  SELECT -1, (SELECT id FROM usuarios LIMIT 1);
  RAISE EXCEPTION 'FALLO: se esperaba que organismo_id=-1 violara la FK a organismos';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK (f): organismo_editores.organismo_id inexistente rechazado por FK';
END $$;

-- (g) organismo_fueros.fuero_id -> fueros.id
DO $$
BEGIN
  INSERT INTO organismo_fueros (organismo_id, fuero_id)
  SELECT (SELECT id FROM organismos LIMIT 1), -1;
  RAISE EXCEPTION 'FALLO: se esperaba que fuero_id=-1 violara la FK a fueros';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK (g): organismo_fueros.fuero_id inexistente rechazado por FK';
END $$;

-- (h) organismo_fueros.organismo_id -> organismos.id
DO $$
BEGIN
  INSERT INTO organismo_fueros (organismo_id, fuero_id)
  SELECT -1, (SELECT id FROM fueros LIMIT 1);
  RAISE EXCEPTION 'FALLO: se esperaba que organismo_id=-1 violara la FK a organismos';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK (h): organismo_fueros.organismo_id inexistente rechazado por FK';
END $$;

ROLLBACK;
