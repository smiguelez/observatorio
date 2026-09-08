# Quickstart: crear el esquema, migrar y reconciliar

**Feature**: 001-modelo-datos-relacional | **Fecha**: 2026-09-07

Guía de validación end-to-end del modelo y su migración. Prueba que el esquema
se crea, que los datos de Firestore llegan a PostgreSQL, y que la reconciliación
evidencia cero pérdida. No incluye el cuerpo de la herramienta de migración (eso
es `/speckit-tasks` + implementación); referencia el contrato en
[contracts/schema.sql](./contracts/schema.sql) y el modelo en
[data-model.md](./data-model.md).

## Prerrequisitos

- PostgreSQL 17 self-hosted accesible; un rol con permiso de `CREATE`.
- Acceso administrativo de solo-lectura a Firestore (respaldo — FR-033).
- Credenciales cargadas desde variables de entorno / gestor de secretos, **sin
  rutas hardcodeadas** (Principio XIII). P. ej.:
  - `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` para el destino.
  - `GOOGLE_APPLICATION_CREDENTIALS` (o equivalente del gestor de secretos) para
    el origen. No usar rutas absolutas en el código (contraste con
    `importar_denominaciones.cjs:5`).
- Node.js 20 LTS para la herramienta de migración.

## Paso 1 — Crear el esquema

```bash
psql "$PG_DSN" -f specs/001-modelo-datos-relacional/contracts/schema.sql
```

**Esperado**: el script corre dentro de una transacción y termina con `COMMIT`.
Verificar que existen las tablas, la vista y los enums:

```bash
psql "$PG_DSN" -c "\dt"     # tablas: provincias..migracion_reconciliacion
psql "$PG_DSN" -c "\dv"     # vista: vista_fuero_simplificado
psql "$PG_DSN" -c "\dT"     # tipos: estado_fueros_enum, modo_jueces_enum
```

## Paso 2 — Sembrar los vocabularios controlados

Cargar las semillas de catálogos (FR-024) antes de migrar entidades, porque las
FK dependen de ellas:

- `provincias` (24), `tipos_oficina` (4), `denominaciones_simplificadas` (10),
  `tipos_uf` (3), `fueros` (4: penal/civil/familia/laboral), `roles` (2),
  `taxonomia_codigos` (etiquetas por dimensión).

**Esperado** (conteos de referencia):

```bash
psql "$PG_DSN" -c "SELECT count(*) FROM provincias;"                 -- 24
psql "$PG_DSN" -c "SELECT count(*) FROM denominaciones_simplificadas;" -- 10
psql "$PG_DSN" -c "SELECT count(*) FROM fueros;"                     -- 4
```

## Paso 3 — Correr la migración por entidad

La herramienta migra en este orden (dependencias de FK), y por cada entidad
resuelve las FK vía `firestore_id` → id subrogado:

1. `usuarios` (+ `usuario_roles` desde el array `rol`)
2. `localidades`
3. `pools_jueces`
4. `organismos` (resuelve `propietario_id` desde `usuario_google`; setea
   `estado_fueros` desde `fuero_simplificado`)
5. `organismo_editores` (desde `editores[]`)
6. `organismo_fueros` (fueros concretos conocidos)
7. `unidades_funcionales` (asigna `modo_jueces`; extrae `anio_implementacion`
   por regla D7; resuelve `localidad_id`/`pool_jueces_id`)
8. `evaluaciones_taxonomicas` (aplana `taxonomia/v1`)

Canonicalización aplicada en tránsito (FR-027): parseo del único `actualizado_a`
en string ISO; extracción de año de `anio_implementacion`; normalización de
`email` a minúscula.

## Paso 4 — Reconciliación (cero pérdida, Principio X)

La herramienta emite un log de reconciliación conforme a
[contracts/reconciliacion-log.schema.json](./contracts/reconciliacion-log.schema.json)
y lo persiste en `migracion_reconciliacion`. Verificar conteos destino contra
los conteos de origen fechados del 2026-09-07:

```bash
psql "$PG_DSN" -c "SELECT entidad, conteo_origen, conteo_destino, resultado
                   FROM migracion_reconciliacion ORDER BY entidad;"
```

**Esperado (conteos de origen 2026-09-07)**:

| entidad | conteo esperado |
|---|---|
| `usuarios` | 46 |
| `organismos` | 116 |
| `unidades_funcionales` | 277 |
| `localidades` | 129 |
| `pools_jueces` | 30 |
| `evaluaciones_taxonomicas` | 89 |

Todas las filas deben tener `resultado = 'coincide'`. Si alguna entidad quedara
en `discrepancia_abierta`, su migración se detiene hasta resolver (FR-032): "corrió
sin error" no es evidencia de completitud.

## Paso 5 — Validar integridad y reglas del modelo

Estas consultas prueban las garantías clave. Todas deben devolver **0 filas**
(salvo donde se indica un valor):

```sql
-- SC-003: 0 referencias rotas. Las FK del esquema lo hacen imposible por diseño;
-- estas consultas confirman que no quedó nada huérfano tras la carga.
SELECT count(*) FROM unidades_funcionales uf
  LEFT JOIN localidades l ON l.id = uf.localidad_id WHERE l.id IS NULL;      -- 0

-- SC-004: 0 propietarios/editores por email suelto (son FK a usuarios.id).
SELECT count(*) FROM organismos o
  LEFT JOIN usuarios u ON u.id = o.propietario_id WHERE u.id IS NULL;        -- 0

-- SC-005: 0 emails duplicados (garantizado por UNIQUE citext).
SELECT email, count(*) FROM usuarios GROUP BY email HAVING count(*) > 1;     -- 0 filas

-- SC-007: los tres estados de jueces son excluyentes; exactamente 2 no_aplica.
SELECT modo_jueces, count(*) FROM unidades_funcionales GROUP BY modo_jueces;
--   -> no_aplica = 2  (las 2 UF administrativas)

-- SC-006 / D3: fuero_simplificado derivado. 20 multifuero, 0 sin asignar hoy.
SELECT count(*) FROM organismos WHERE estado_fueros = 'multifuero_sin_detalle'; -- 20
SELECT count(*) FROM organismos WHERE estado_fueros = 'sin_fueros_asignados';   -- 0
SELECT count(*) FROM vista_fuero_simplificado WHERE fuero_simplificado = 'multifuero'; -- 20

-- SC-010: canonicalización de anio_implementacion (D7). "9"/"" -> NULL; el año se extrae.
SELECT count(*) FROM unidades_funcionales
  WHERE anio_implementacion IS NOT NULL
    AND (anio_implementacion < 1900 OR anio_implementacion > 2100);          -- 0
```

Intento negativo (debe **fallar** por el `CHECK` de exclusividad, prueba de que
el modelo rechaza estados imposibles):

```sql
-- Debe dar error: cantidad_directa no puede tener pool_jueces_id.
INSERT INTO unidades_funcionales
  (organismo_id, denominacion_unidad, localidad_id, tipo_uf_id,
   modo_jueces, jueces_asistidos, pool_jueces_id, firestore_id)
VALUES (1, 'X', 1, 1, 'cantidad_directa', 3, 1, 'test');   -- ERROR esperado
```

## Paso 6 — Respaldo de solo-lectura (FR-033, SC-009)

Confirmar que Firestore queda accesible en modo solo-lectura como respaldo
verificable hasta el cierre formal del proyecto: la migración **no escribe** en
el origen, y cada fila migrada conserva su `firestore_id` para auditar contra el
respaldo.

## Criterios de aceptación cubiertos

| Success Criteria | Validado en |
|---|---|
| SC-001 (cobertura de colecciones/campos) | data-model.md §"Cobertura" + Paso 3 |
| SC-002 (conteos origen=destino) | Paso 4 |
| SC-003 (0 referencias rotas) | Paso 5 + FK del esquema |
| SC-004 (propiedad/edición por id) | Paso 5 |
| SC-005 (0 emails duplicados) | Paso 5 + `citext UNIQUE` |
| SC-006 (fuero_simplificado determinable) | Paso 5 + vista |
| SC-007 (tres estados de jueces) | Paso 5 + `CHECK` |
| SC-008 (log de reconciliación) | Paso 4 + tabla |
| SC-009 (Firestore solo-lectura) | Paso 6 |
| SC-010 (canonicalización) | Paso 5 |
