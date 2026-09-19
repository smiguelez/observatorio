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
psql "$PG_DSN" -c "\dT"     # tipos: estado_fueros_enum (modo_jueces_enum eliminado por D8)
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
3. `grupos_jueces` (pools compartidos desde `pools_jueces`)
4. `organismos` (resuelve `propietario_id` desde `usuario_google`; setea
   `estado_fueros` desde `fuero_simplificado`)
5. `organismo_editores` (desde `editores[]`)
6. `organismo_fueros` (fueros concretos conocidos)
7. `unidades_funcionales` (extrae `anio_implementacion` por regla D7; resuelve
   `localidad_id`)
8. `unidad_funcional_grupo_jueces` (asignaciones de jueces, D8): pool presente →
   una asignación al grupo del pool con `cantidad_asignada = total_jueces`;
   `jueces_asistidos` numérico → crea un `grupos_jueces` exclusivo
   (`total_jueces = jueces_asistidos`, `firestore_id NULL`) y una asignación;
   ambos vacíos → cero asignaciones. `asignacion_fueros` queda vacía (sin
   acotamientos de fuero en los datos actuales).
9. `evaluaciones_taxonomicas` (aplana `taxonomia/v1`)

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

**Referencia original (conteos de origen 2026-09-07)**:

| entidad | conteo de referencia (2026-09-07) |
|---|---|
| `usuarios` | 46 |
| `organismos` | 116 |
| `unidades_funcionales` | 277 |
| `localidades` | 129 |
| `grupos_jueces` (pools de origen) | 30 |
| `unidad_funcional_grupo_jueces` (asignaciones) | 275 |
| `evaluaciones_taxonomicas` | 89 |

El gate real de SC-002/SC-008 es **origen = destino de la misma corrida**, no
estas cifras fijas: la app sigue operativa durante la migración (Principio IX),
así que el origen puede diferir del 2026-09-07 al momento de migrar. La corrida
real sobre el snapshot del 2026-09-16 reconcilió así (los 3 UF/organismos/1
usuario de más reflejan altas posteriores al 2026-09-07; el ajuste 275→266 se
explica en D-16):

| entidad | conteo real (corrida 2026-09-16) |
|---|---|
| `usuarios` | 47 |
| `usuario_roles` | 50 |
| `organismos` | 117 |
| `organismo_editores` | 80 |
| `organismo_fueros` | 97 |
| `unidades_funcionales` | 277 |
| `localidades` | 129 |
| `grupos_jueces` (pools de origen) | 30 |
| `unidad_funcional_grupo_jueces` (asignaciones) | 266 |
| `evaluaciones_taxonomicas` | 89 |

Todas las filas deben tener `resultado = 'coincide'` (o `discrepancia_resuelta`
con `detalle` explicando la resolución). Si alguna entidad quedara en
`discrepancia_abierta`, su migración se detiene hasta resolver (FR-032): "corrió
sin error" no es evidencia de completitud.

**Nota (D8)**: `grupos_jueces` reconcilia solo su subconjunto de **pools de
origen** (`firestore_id IS NOT NULL`) contra los 30 de `pools_jueces`. Los grupos
**exclusivos** derivados (`firestore_id IS NULL`, uno por UF con cantidad directa)
y las **asignaciones** (una por cada UF con jueces) no provienen de una colección
de origen: reconcilian contra conteos derivados de las UF, no contra Firestore.

**Nota (D-16)**: 9 UF traen `jueces_asistidos = "0"` explícito (no ausente, no
pool) — se tratan como "sin jueces" (FR-018c), igual que las 2 UF sin ningún
campo poblado. Total de UF sin asignación: 11 (no 2); total de asignaciones:
266 (no 275). Ver `research.md` D-16.

## Paso 5 — Validar integridad y reglas del modelo

Estas consultas prueban las garantías clave. Todas deben devolver **0 filas**
(salvo donde se indica un valor). Son la versión abreviada, para lectura
rápida; la versión completa y reproducible, tal como efectivamente se corrió,
vive en `db/validation/*.sql` (con conteos y evidencia registrada en
`docs/resultado-verificacion-*-2026091{7,8}.md`):

- `db/validation/relaciones.sql` (T013) — FK explícitas para toda relación implícita.
- `db/validation/conteo_jueces.sql` (T014) — modelo de asignaciones D8 con fixtures.
- `db/validation/reglas_asignacion.sql` (T015) — `CHECK`/`UNIQUE`/trigger de asignaciones, intentos negativos.
- `db/validation/integridad.sql` (T025) — 0 huérfanas post-migración, 21 relaciones, contra datos reales.
- `db/validation/integridad_rechazo.sql` (T026) — la FK rechaza referencias rotas por diseño (8 intentos negativos).
- `db/validation/identidad.sql` (T030) — `usuarios.id` como PK real, 0 colisiones de email por casing, propiedad/edición por id.
- `db/validation/fueros.sql` (T032) — `vista_fuero_simplificado` y distribución de `estado_fueros`.

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

-- SC-007 (spec.md describe la REGLA, no un número fijo: toda UF con cero
-- asignaciones cae en (a) administrativa por diseño (D6) o (b) jueces="0"
-- explícito confirmado caso por caso (D-16); el conteo por categoría varía
-- entre corridas). Evidencia puntual de ESTA corrida: 2 del caso (a) + 9 del
-- caso (b) = 11 con cero asignaciones, 266 con una o más.
SELECT count(*) FROM unidades_funcionales uf
  WHERE NOT EXISTS (SELECT 1 FROM unidad_funcional_grupo_jueces a
                    WHERE a.unidad_funcional_id = uf.id);                    -- 11 (D-16)
SELECT count(*) FROM unidades_funcionales uf
  WHERE EXISTS (SELECT 1 FROM unidad_funcional_grupo_jueces a
               WHERE a.unidad_funcional_id = uf.id);                         -- 266 (D-16)
-- Dos conteos de D8 (FR-018e). Por UF (sin deduplicar):
SELECT uf.id, COALESCE(SUM(a.cantidad_asignada), 0) AS jueces_por_uf
  FROM unidades_funcionales uf
  LEFT JOIN unidad_funcional_grupo_jueces a ON a.unidad_funcional_id = uf.id
  GROUP BY uf.id;
-- Agregado (cada grupo una sola vez por su total real, NO sumando por-UF):
SELECT COALESCE(SUM(g.total_jueces), 0) AS jueces_agregado
  FROM grupos_jueces g
  WHERE EXISTS (SELECT 1 FROM unidad_funcional_grupo_jueces a
               WHERE a.grupo_jueces_id = g.id);

-- SC-006 / D3: fuero_simplificado derivado. 20 multifuero, 0 sin asignar hoy.
SELECT count(*) FROM organismos WHERE estado_fueros = 'multifuero_sin_detalle'; -- 20
SELECT count(*) FROM organismos WHERE estado_fueros = 'sin_fueros_asignados';   -- 0
SELECT count(*) FROM vista_fuero_simplificado WHERE fuero_simplificado = 'multifuero'; -- 20

-- SC-010: canonicalización de anio_implementacion (D7). "9"/"" -> NULL; el año se extrae.
SELECT count(*) FROM unidades_funcionales
  WHERE anio_implementacion IS NOT NULL
    AND (anio_implementacion < 1900 OR anio_implementacion > 2100);          -- 0
```

Intentos negativos (deben **fallar**, prueba de que el modelo rechaza datos
inválidos por diseño). Los ejemplos abajo son ilustrativos (`id=1`,
`<fuero_ajeno>` son placeholders); la versión ejecutable real, con fixtures
propios y `ROLLBACK` al final (no toca datos migrados), es
`db/validation/reglas_asignacion.sql` (T015, para (a)/(b)/(c) sobre
`unidad_funcional_grupo_jueces`/`asignacion_fueros`) e
`db/validation/integridad_rechazo.sql` (T026, para FK rotas en
`unidades_funcionales`, `organismos`, `organismo_editores`, `organismo_fueros`):

```sql
-- (a) Una asignación no puede tener cantidad <= 0 (CHECK cantidad_asignada > 0).
INSERT INTO unidad_funcional_grupo_jueces
  (unidad_funcional_id, grupo_jueces_id, cantidad_asignada)
VALUES (1, 1, 0);                                          -- ERROR esperado (CHECK)

-- (b) No puede haber dos asignaciones para el mismo par (UF, grupo) — UNIQUE.
--     (Repetir un INSERT válido con el mismo par da conflicto.)

-- (c) FR-018f: una asignación no puede declarar un fuero que el organismo de la
--     UF no atiende. Con <fuero_ajeno> presente en `fueros` pero ausente de
--     `organismo_fueros` del organismo de esa UF:
INSERT INTO asignacion_fueros (asignacion_id, fuero_id)
VALUES (1, <fuero_ajeno>);                                 -- ERROR esperado (trigger)
```

## Paso 6 — Respaldo de solo-lectura (FR-033, SC-009)

Confirmar que Firestore queda accesible en modo solo-lectura como respaldo
verificable hasta el cierre formal del proyecto: la migración **no escribe** en
el origen, y cada fila migrada conserva su `firestore_id` para auditar contra el
respaldo.

## Criterios de aceptación cubiertos

| Success Criteria | Validado en | Evidencia registrada |
|---|---|---|
| SC-001 (cobertura de colecciones/campos) | data-model.md §"Cobertura" + Paso 3 | data-model.md (T012) |
| SC-002 (conteos origen=destino) | Paso 4 | `migracion_reconciliacion` (corrida 2026-09-17 21:59:06) |
| SC-003 (0 referencias rotas) | Paso 5 + FK del esquema | `db/validation/integridad.sql` + `docs/resultado-verificacion-integridad-20260918.md` |
| SC-004 (propiedad/edición por id) | Paso 5 | `db/validation/identidad.sql` + `docs/resultado-verificacion-identidad-20260918.md` |
| SC-005 (0 emails duplicados) | Paso 5 + `citext UNIQUE` | `db/validation/identidad.sql` (mismo doc) |
| SC-006 (fuero_simplificado determinable) | Paso 5 + vista | `db/validation/fueros.sql` + `docs/resultado-verificacion-fueros-20260918.md` |
| SC-007 (regla: cero asignaciones solo por (a) administrativa D6 o (b) jueces="0" confirmado caso a caso D-16; esta corrida: **11 sin, 266 con**) | Paso 5 + tabla puente + trigger | `db/validation/conteo_jueces.sql` (T014); conteo real en Paso 5 de este documento |
| SC-008 (log de reconciliación) | Paso 4 + tabla | `migracion_reconciliacion` |
| SC-009 (Firestore solo-lectura) | Paso 6 | Ver `docs/runbook-corte-produccion.md` para el cierre formal del respaldo |
| SC-010 (canonicalización) | Paso 5 | Paso 5 de este documento (conteo `anio_implementacion`) |

---

**Nota**: este documento valida la corrida de prueba de la migración (US2),
no el corte final a producción. El proceso para el corte real —cuándo migrar
la última vez, cómo congelar altas en Firestore, cómo verificar contra el
respaldo antes de apagar la fuente— está en
[docs/runbook-corte-produccion.md](../../docs/runbook-corte-produccion.md).
