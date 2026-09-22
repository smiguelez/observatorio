-- T013 (US1): toda relación implícita de Firestore (docs/auditoria-app-actual.md
-- §2) debe ser una FK explícita en el esquema (Principio VIII, FR-025).
-- Esperado: 0 filas (ninguna relación esperada falta como FK real).

WITH esperadas (tabla, columna, tabla_referenciada) AS (
  VALUES
    ('usuarios', 'provincia_id', 'provincias'),
    ('usuario_roles', 'usuario_id', 'usuarios'),
    ('usuario_roles', 'rol_id', 'roles'),
    ('organismos', 'denominacion_simplificada_id', 'denominaciones_simplificadas'),
    ('organismos', 'tipo_oficina_id', 'tipos_oficina'),
    ('organismos', 'provincia_id', 'provincias'),
    ('organismos', 'propietario_id', 'usuarios'),              -- reemplaza usuario_google (email)
    ('organismo_editores', 'organismo_id', 'organismos'),
    ('organismo_editores', 'usuario_id', 'usuarios'),           -- reemplaza editores[] (emails)
    ('organismo_fueros', 'organismo_id', 'organismos'),
    ('organismo_fueros', 'fuero_id', 'fueros'),
    ('localidades', 'provincia_id', 'provincias'),
    ('grupos_jueces', 'provincia_id', 'provincias'),
    ('unidades_funcionales', 'organismo_id', 'organismos'),
    ('unidades_funcionales', 'localidad_id', 'localidades'),
    ('unidades_funcionales', 'tipo_uf_id', 'tipos_uf'),
    ('unidad_funcional_grupo_jueces', 'unidad_funcional_id', 'unidades_funcionales'),
    ('unidad_funcional_grupo_jueces', 'grupo_jueces_id', 'grupos_jueces'),  -- UF <-> grupos de jueces (D8)
    ('asignacion_fueros', 'asignacion_id', 'unidad_funcional_grupo_jueces'),
    ('asignacion_fueros', 'fuero_id', 'fueros'),
    ('evaluaciones_taxonomicas', 'organismo_id', 'organismos')  -- 1:1, PK = organismo_id
),
actuales AS (
  SELECT
    tc.table_name AS tabla,
    kcu.column_name AS columna,
    ccu.table_name AS tabla_referenciada
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
)
SELECT e.*
FROM esperadas e
LEFT JOIN actuales a USING (tabla, columna, tabla_referenciada)
WHERE a.tabla IS NULL;
