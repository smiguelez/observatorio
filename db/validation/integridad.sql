-- T025 (US3): 0 referencias huérfanas post-migración, para TODAS las
-- relaciones del modelo (FR-025, Principio VIII, SC-003). A diferencia de
-- T013 (US1, que valida que la relación existe como FK en el esquema), esta
-- consulta corre contra los DATOS YA MIGRADOS (no fixtures) y reporta, por
-- relación, el total de filas del lado "hijo" y cuántas de ellas son
-- huérfanas (no deberían existir nunca: las FK ya lo impiden por diseño;
-- esta consulta es la evidencia post-hoc de que efectivamente no ocurrió).
--
-- Salida: una fila por relación con (total_hijas, huerfanas). Se espera
-- huerfanas = 0 en todas. El SELECT final filtra huerfanas <> 0 y debe
-- devolver 0 filas (quickstart.md Paso 5; SC-003).

WITH conteos (relacion, total_hijas, huerfanas) AS (
  VALUES
    ('unidades_funcionales.localidad_id -> localidades.id',
      (SELECT count(*) FROM unidades_funcionales),
      (SELECT count(*) FROM unidades_funcionales uf
         LEFT JOIN localidades l ON l.id = uf.localidad_id WHERE l.id IS NULL)),

    ('unidades_funcionales.organismo_id -> organismos.id',
      (SELECT count(*) FROM unidades_funcionales),
      (SELECT count(*) FROM unidades_funcionales uf
         LEFT JOIN organismos o ON o.id = uf.organismo_id WHERE o.id IS NULL)),

    ('unidades_funcionales.tipo_uf_id -> tipos_uf.id',
      (SELECT count(*) FROM unidades_funcionales),
      (SELECT count(*) FROM unidades_funcionales uf
         LEFT JOIN tipos_uf t ON t.id = uf.tipo_uf_id WHERE t.id IS NULL)),

    ('unidad_funcional_grupo_jueces.unidad_funcional_id -> unidades_funcionales.id',
      (SELECT count(*) FROM unidad_funcional_grupo_jueces),
      (SELECT count(*) FROM unidad_funcional_grupo_jueces a
         LEFT JOIN unidades_funcionales uf ON uf.id = a.unidad_funcional_id WHERE uf.id IS NULL)),

    ('unidad_funcional_grupo_jueces.grupo_jueces_id -> grupos_jueces.id',
      (SELECT count(*) FROM unidad_funcional_grupo_jueces),
      (SELECT count(*) FROM unidad_funcional_grupo_jueces a
         LEFT JOIN grupos_jueces g ON g.id = a.grupo_jueces_id WHERE g.id IS NULL)),

    ('asignacion_fueros.asignacion_id -> unidad_funcional_grupo_jueces.id',
      (SELECT count(*) FROM asignacion_fueros),
      (SELECT count(*) FROM asignacion_fueros af
         LEFT JOIN unidad_funcional_grupo_jueces a ON a.id = af.asignacion_id WHERE a.id IS NULL)),

    ('asignacion_fueros.fuero_id -> fueros.id',
      (SELECT count(*) FROM asignacion_fueros),
      (SELECT count(*) FROM asignacion_fueros af
         LEFT JOIN fueros f ON f.id = af.fuero_id WHERE f.id IS NULL)),

    ('organismos.propietario_id -> usuarios.id',
      (SELECT count(*) FROM organismos),
      (SELECT count(*) FROM organismos o
         LEFT JOIN usuarios u ON u.id = o.propietario_id WHERE u.id IS NULL)),

    ('organismos.provincia_id -> provincias.id',
      (SELECT count(*) FROM organismos),
      (SELECT count(*) FROM organismos o
         LEFT JOIN provincias p ON p.id = o.provincia_id WHERE p.id IS NULL)),

    ('organismos.tipo_oficina_id -> tipos_oficina.id',
      (SELECT count(*) FROM organismos),
      (SELECT count(*) FROM organismos o
         LEFT JOIN tipos_oficina t ON t.id = o.tipo_oficina_id WHERE t.id IS NULL)),

    ('organismos.denominacion_simplificada_id -> denominaciones_simplificadas.id',
      (SELECT count(*) FROM organismos),
      (SELECT count(*) FROM organismos o
         LEFT JOIN denominaciones_simplificadas d ON d.id = o.denominacion_simplificada_id WHERE d.id IS NULL)),

    ('organismo_editores.organismo_id -> organismos.id',
      (SELECT count(*) FROM organismo_editores),
      (SELECT count(*) FROM organismo_editores oe
         LEFT JOIN organismos o ON o.id = oe.organismo_id WHERE o.id IS NULL)),

    ('organismo_editores.usuario_id -> usuarios.id',
      (SELECT count(*) FROM organismo_editores),
      (SELECT count(*) FROM organismo_editores oe
         LEFT JOIN usuarios u ON u.id = oe.usuario_id WHERE u.id IS NULL)),

    ('organismo_fueros.organismo_id -> organismos.id',
      (SELECT count(*) FROM organismo_fueros),
      (SELECT count(*) FROM organismo_fueros ofu
         LEFT JOIN organismos o ON o.id = ofu.organismo_id WHERE o.id IS NULL)),

    ('organismo_fueros.fuero_id -> fueros.id',
      (SELECT count(*) FROM organismo_fueros),
      (SELECT count(*) FROM organismo_fueros ofu
         LEFT JOIN fueros f ON f.id = ofu.fuero_id WHERE f.id IS NULL)),

    ('evaluaciones_taxonomicas.organismo_id -> organismos.id',
      (SELECT count(*) FROM evaluaciones_taxonomicas),
      (SELECT count(*) FROM evaluaciones_taxonomicas et
         LEFT JOIN organismos o ON o.id = et.organismo_id WHERE o.id IS NULL)),

    ('usuarios.provincia_id -> provincias.id',
      (SELECT count(*) FROM usuarios),
      (SELECT count(*) FROM usuarios u
         LEFT JOIN provincias p ON p.id = u.provincia_id WHERE u.provincia_id IS NOT NULL AND p.id IS NULL)),

    ('usuario_roles.usuario_id -> usuarios.id',
      (SELECT count(*) FROM usuario_roles),
      (SELECT count(*) FROM usuario_roles ur
         LEFT JOIN usuarios u ON u.id = ur.usuario_id WHERE u.id IS NULL)),

    ('usuario_roles.rol_id -> roles.id',
      (SELECT count(*) FROM usuario_roles),
      (SELECT count(*) FROM usuario_roles ur
         LEFT JOIN roles r ON r.id = ur.rol_id WHERE r.id IS NULL)),

    ('localidades.provincia_id -> provincias.id',
      (SELECT count(*) FROM localidades),
      (SELECT count(*) FROM localidades l
         LEFT JOIN provincias p ON p.id = l.provincia_id WHERE p.id IS NULL)),

    ('grupos_jueces.provincia_id -> provincias.id',
      (SELECT count(*) FROM grupos_jueces),
      (SELECT count(*) FROM grupos_jueces g
         LEFT JOIN provincias p ON p.id = g.provincia_id WHERE p.id IS NULL))
)
SELECT * FROM conteos ORDER BY relacion;

-- Gate (SC-003): 0 filas esperadas. Cualquier fila acá es una regresión.
SELECT * FROM (
  WITH conteos (relacion, total_hijas, huerfanas) AS (
    VALUES
      ('unidades_funcionales.localidad_id -> localidades.id',
        (SELECT count(*) FROM unidades_funcionales),
        (SELECT count(*) FROM unidades_funcionales uf
           LEFT JOIN localidades l ON l.id = uf.localidad_id WHERE l.id IS NULL)),
      ('unidad_funcional_grupo_jueces.unidad_funcional_id -> unidades_funcionales.id',
        (SELECT count(*) FROM unidad_funcional_grupo_jueces),
        (SELECT count(*) FROM unidad_funcional_grupo_jueces a
           LEFT JOIN unidades_funcionales uf ON uf.id = a.unidad_funcional_id WHERE uf.id IS NULL)),
      ('unidad_funcional_grupo_jueces.grupo_jueces_id -> grupos_jueces.id',
        (SELECT count(*) FROM unidad_funcional_grupo_jueces),
        (SELECT count(*) FROM unidad_funcional_grupo_jueces a
           LEFT JOIN grupos_jueces g ON g.id = a.grupo_jueces_id WHERE g.id IS NULL)),
      ('organismos.propietario_id -> usuarios.id',
        (SELECT count(*) FROM organismos),
        (SELECT count(*) FROM organismos o
           LEFT JOIN usuarios u ON u.id = o.propietario_id WHERE u.id IS NULL)),
      ('organismo_editores.organismo_id -> organismos.id',
        (SELECT count(*) FROM organismo_editores),
        (SELECT count(*) FROM organismo_editores oe
           LEFT JOIN organismos o ON o.id = oe.organismo_id WHERE o.id IS NULL)),
      ('organismo_editores.usuario_id -> usuarios.id',
        (SELECT count(*) FROM organismo_editores),
        (SELECT count(*) FROM organismo_editores oe
           LEFT JOIN usuarios u ON u.id = oe.usuario_id WHERE u.id IS NULL)),
      ('organismo_fueros.organismo_id -> organismos.id',
        (SELECT count(*) FROM organismo_fueros),
        (SELECT count(*) FROM organismo_fueros ofu
           LEFT JOIN organismos o ON o.id = ofu.organismo_id WHERE o.id IS NULL)),
      ('organismo_fueros.fuero_id -> fueros.id',
        (SELECT count(*) FROM organismo_fueros),
        (SELECT count(*) FROM organismo_fueros ofu
           LEFT JOIN fueros f ON f.id = ofu.fuero_id WHERE f.id IS NULL))
  )
  SELECT * FROM conteos
) gate
WHERE huerfanas <> 0;
