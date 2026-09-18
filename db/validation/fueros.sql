-- T032 (US5): fuero_simplificado como vista calculada (D3, FR-012/013/014).
-- Corre contra los 117 organismos ya migrados. Cuatro verificaciones:
--   (1) vista_fuero_simplificado devuelve solo los 5 valores esperados
--       (penal, civil, laboral, familia, multifuero) para los 117 organismos,
--       sin valores inesperados (y sin NULL, dado que se espera 0
--       sin_fueros_asignados reales).
--   (2) distribución de estado_fueros (enum) sobre los 117 organismos.
--   (3) el organismo nuevo de Misiones tiene un valor coherente en la vista.
--   (4) 0 sin_fueros_asignados reales; multifuero_sin_detalle = organismos con
--       más de un fuero en origen (20 según auditoría 2026-09-07, hoy 20 o 21
--       con el alta nueva).

-- (1) Valores devueltos por la vista para los 117 organismos: deben ser
-- exactamente el subconjunto de {penal, civil, laboral, familia, multifuero}.
SELECT fuero_simplificado, count(*) AS cantidad
FROM vista_fuero_simplificado
GROUP BY fuero_simplificado
ORDER BY fuero_simplificado NULLS FIRST;

-- Total de filas de la vista (debe ser 117, uno por organismo) y valores
-- fuera del conjunto esperado (debe dar 0 filas).
SELECT count(*) AS total_filas_vista FROM vista_fuero_simplificado;

SELECT fuero_simplificado, count(*)
FROM vista_fuero_simplificado
WHERE fuero_simplificado IS NULL
   OR fuero_simplificado NOT IN ('penal', 'civil', 'laboral', 'familia', 'multifuero')
GROUP BY fuero_simplificado;

-- (2) Distribución real de estado_fueros (enum) sobre los 117 organismos.
SELECT estado_fueros, count(*) AS cantidad
FROM organismos
GROUP BY estado_fueros
ORDER BY estado_fueros;

-- (3) Organismo nuevo de Misiones: ubicarlo (por propietario = usuario de
-- Misiones, id=109, confirmado en T030) y mostrar su fuero_simplificado.
SELECT o.id, o.denominacion, o.firestore_id, o.estado_fueros,
       v.fuero_simplificado,
       (SELECT array_agg(f.nombre ORDER BY f.nombre)
          FROM organismo_fueros ofu JOIN fueros f ON f.id = ofu.fuero_id
          WHERE ofu.organismo_id = o.id) AS fueros_concretos_cargados
FROM organismos o
JOIN vista_fuero_simplificado v ON v.organismo_id = o.id
WHERE o.propietario_id = 109
ORDER BY o.id;

-- (4a) 0 sin_fueros_asignados reales.
SELECT count(*) AS total_sin_fueros_asignados
FROM organismos WHERE estado_fueros = 'sin_fueros_asignados';

-- (4b) multifuero_sin_detalle: cuántos organismos y coincide con >1 fuero
-- cargado en origen (organismo_fueros) para ESOS organismos específicamente
-- (no basta con el conteo total: confirmar que son los mismos organismos).
SELECT count(*) AS total_multifuero_sin_detalle
FROM organismos WHERE estado_fueros = 'multifuero_sin_detalle';

-- Cruce: de los organismos marcados multifuero_sin_detalle, cuántos fueros
-- concretos tienen cargados en organismo_fueros (0 esperado: "sin_detalle"
-- significa que el estado se preserva sin desglosar los fueros concretos).
SELECT o.estado_fueros, count(DISTINCT o.id) AS organismos,
       count(ofu.fuero_id) AS fueros_concretos_cargados
FROM organismos o
LEFT JOIN organismo_fueros ofu ON ofu.organismo_id = o.id
WHERE o.estado_fueros = 'multifuero_sin_detalle'
GROUP BY o.estado_fueros;

-- Cruce inverso: de los organismos 'cargado' (deberían tener exactamente 1
-- fuero concreto cada uno, para que la vista devuelva ese fuero y no 'multifuero').
SELECT count(*) AS organismos_cargado,
       count(*) FILTER (WHERE cantidad_fueros = 1) AS con_exactamente_1_fuero,
       count(*) FILTER (WHERE cantidad_fueros <> 1) AS con_cantidad_distinta_de_1
FROM (
  SELECT o.id, count(ofu.fuero_id) AS cantidad_fueros
  FROM organismos o
  LEFT JOIN organismo_fueros ofu ON ofu.organismo_id = o.id
  WHERE o.estado_fueros = 'cargado'
  GROUP BY o.id
) x;

-- Total de organismos (debe ser 117, cruza con la reconciliación de US2).
SELECT count(*) AS total_organismos FROM organismos;
