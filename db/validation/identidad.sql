-- T030 (US4): identidad por id subrogado (FR-004/005/009/010, Principio V).
-- Corre contra los datos ya migrados. Tres verificaciones:
--   (1) usuarios.id (bigint) es la PK real; email es UNIQUE citext, no PK.
--   (2) 0 colisiones de email por casing entre los usuarios migrados (SC-005).
--   (3) organismos.propietario_id y organismo_editores.usuario_id son FK
--       bigint -> usuarios.id, no el email en texto.

-- (1) PK real de usuarios: debe ser 'id' (bigint). email debe ser UNIQUE, no PK.
SELECT tc.constraint_type, kcu.column_name, c.data_type, c.udt_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.columns c
  ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name AND c.table_schema = kcu.table_schema
WHERE tc.table_name = 'usuarios' AND tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
ORDER BY tc.constraint_type, kcu.column_name;

-- (2) 0 colisiones de email por casing sobre los usuarios REALMENTE migrados
-- (no solo confiar en el UNIQUE citext del esquema): agrupar por lower(email)
-- y listar cualquier grupo con más de un id. Se espera 0 filas.
SELECT lower(email::text) AS email_normalizado, count(*) AS cantidad,
       array_agg(id ORDER BY id) AS ids, array_agg(email::text ORDER BY id) AS variantes_casing
FROM usuarios
GROUP BY lower(email::text)
HAVING count(*) > 1;

-- Total de usuarios migrados y total de valores lower(email) distintos:
-- deben coincidir (47 = 47) para que (2) sea concluyente sobre el universo completo.
SELECT count(*) AS total_usuarios, count(DISTINCT lower(email::text)) AS emails_normalizados_distintos
FROM usuarios;

-- El usuario nuevo posterior al 2026-09-07 (auditoría original tenía 46, hoy
-- hay 47): ubicarlo y confirmar que no rompe (2). La auditoría previa
-- (docs/verificacion-datos-firestore.md) señalaba a Misiones como provincia
-- faltante en el snapshot de origen.
SELECT u.id, u.email, u.firestore_id, p.nombre AS provincia, u.creado_a
FROM usuarios u
LEFT JOIN provincias p ON p.id = u.provincia_id
WHERE p.nombre = 'Misiones'
ORDER BY u.id;

-- (3) organismos.propietario_id y organismo_editores.usuario_id son bigint
-- FK -> usuarios.id, NO texto/email. Confirmar tipo de columna + que el join
-- por id resuelve al 100% (conteo, no solo "sin errores").
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE (table_name = 'organismos' AND column_name = 'propietario_id')
   OR (table_name = 'organismo_editores' AND column_name = 'usuario_id')
   OR (table_name = 'usuarios' AND column_name = 'id')
ORDER BY table_name, column_name;

-- Cobertura real: 100% de organismos con propietario resuelto por id (no NULL,
-- no huérfano) y 100% de filas de organismo_editores resueltas por id.
SELECT count(*) AS total_organismos,
       count(*) FILTER (WHERE o.propietario_id IS NOT NULL) AS con_propietario_id,
       count(*) FILTER (WHERE u.id IS NOT NULL) AS propietario_id_resuelto_por_id
FROM organismos o
LEFT JOIN usuarios u ON u.id = o.propietario_id;

SELECT count(*) AS total_organismo_editores,
       count(*) FILTER (WHERE u.id IS NOT NULL) AS usuario_id_resuelto_por_id
FROM organismo_editores oe
LEFT JOIN usuarios u ON u.id = oe.usuario_id;

-- 0 emails duplicados en sentido literal (además del check de casing en (2)).
SELECT email, count(*) FROM usuarios GROUP BY email HAVING count(*) > 1;
