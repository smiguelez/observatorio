# Quickstart: aplicar y validar la migración de taxonomía parametrizable

**Feature**: 003-taxonomia-parametrizable | **Fecha**: 2026-09-22

Guía de validación — no de implementación. El DDL/DML autoritativo está en
[contracts/migration-0001-taxonomia.sql](./contracts/migration-0001-taxonomia.sql);
el modelo en [data-model.md](./data-model.md). Esta guía documenta cómo
aplicar la migración real (`backend/migrations/0001_taxonomia_parametrizable.ts`,
tarea de implementación) y cómo confirmar que hizo lo que dice hacer.

## Prerrequisitos

- `001-modelo-datos-relacional` y `002-backend-api-carga-datos` ya
  aplicados (esquema `public` con las 19 tablas + esquema `auth`).
- `DATABASE_URL` cargado (Principio XIII), mismo rol `observatorio_app`.

## Paso 0 — Dry run del contrato (ya corrido para esta spec, reproducible)

Antes de aplicar la migración real, el contrato de
`contracts/migration-0001-taxonomia.sql` se puede probar sin efecto
persistente reemplazando su `COMMIT;` final por `ROLLBACK;`:

```bash
sed 's/^COMMIT;$/ROLLBACK;/' specs/003-taxonomia-parametrizable/contracts/migration-0001-taxonomia.sql \
  > /tmp/dry-run-migration-0001.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/dry-run-migration-0001.sql
```

**Resultado real de esta corrida (2026-09-22, contra la base con los datos
de `001-modelo-datos-relacional` ya migrados)**:

```
BEGIN
ALTER TABLE
CREATE TABLE   (×4: taxonomia_preguntas, taxonomia_pregunta_tipos_oficina, taxonomia_opciones, evaluaciones_taxonomicas)
CREATE INDEX   (×2)
CREATE FUNCTION
CREATE TRIGGER
INSERT 0 9     -- las 9 preguntas
INSERT 0 18    -- 9 preguntas × 2 tipos de oficina
INSERT 0 32    -- las 32 opciones (mismo total que taxonomia_codigos)
INSERT 0 801   -- las respuestas — coincide EXACTO con 89 × 9
DO             -- el bloque de reconciliación corrió sin RAISE EXCEPTION:
               -- conteo_origen = conteo_destino = 801
ROLLBACK
```

Verificado después: `public.*` con las mismas 19 tablas de antes (0 tablas
nuevas persistidas), `evaluaciones_taxonomicas` con su forma vieja de 9
columnas intacta y sus 89 filas — el `ROLLBACK` no dejó rastro. Este dry
run es la evidencia de que el contrato corre limpio contra datos reales,
antes de que exista siquiera el archivo de migración de Kysely.

## Paso 1 — Aplicar la migración real

```bash
cd backend
npx tsx scripts/migrate-public.ts   # corre backend/migrations/*.ts con el
                                     # Migrator de Kysely (research.md Decisión 1)
```

**Esperado**: el mismo resultado que el Paso 0, pero con `COMMIT` real. Si
la reconciliación (Paso 8 del contrato) no coincide, la migración entera
revierte (transacción) y el corredor MUST salir con código de error — no
"corrió con un warning".

## Paso 2 — Verificar `public.*` fuera de taxonomía: sin cambios

```sql
-- Antes y después de la migración, debe dar el mismo resultado:
SELECT count(*) FROM organismos;      -- 117, sin cambios
SELECT count(*) FROM usuarios;        -- 47, sin cambios
SELECT count(*) FROM grupos_jueces;   -- 262, sin cambios
```

Ninguna de estas tres tablas tiene ninguna columna nueva, ningún trigger
nuevo, ningún índice nuevo — la migración 0001 no las toca (instrucción
explícita del usuario, verificado en `data-model.md` "Relación con el
modelo existente").

## Paso 3 — Verificar la migración de preguntas y opciones (SC-001)

```sql
SELECT count(*) FROM taxonomia_preguntas;               -- 9
SELECT count(*) FROM taxonomia_opciones;                -- 32
SELECT p.codigo, p.grupo, count(o.id) AS opciones
  FROM taxonomia_preguntas p
  LEFT JOIN taxonomia_opciones o ON o.pregunta_id = p.id
  GROUP BY p.codigo, p.grupo, p.orden ORDER BY p.orden;
-- cada fila debe tener la misma cantidad de opciones que tenía su
-- dimensión en taxonomia_codigos (comparar contra el conteo por dimensión
-- documentado en data-model.md / research.md)
```

## Paso 4 — Verificar la reconciliación (SC-002, Principio X)

```sql
SELECT entidad, conteo_origen, conteo_destino, resultado, corrida_a
  FROM migracion_reconciliacion
  WHERE entidad = 'evaluaciones_taxonomicas_respuestas'
  ORDER BY corrida_a DESC LIMIT 1;
-- esperado: conteo_origen = conteo_destino = 801, resultado = 'coincide'
```

## Paso 5 — Agregar una pregunta nueva sin `ALTER TABLE` (SC-003, User Story 2)

```sql
BEGIN;

INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_quickstart', '¿Pregunta de prueba?', 'gestion', 'opcion_unica', 99)
RETURNING id;  -- anotar el id devuelto -> PREGUNTA_ID

INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden) VALUES
  (:PREGUNTA_ID, 'SI', 'Sí', 1),
  (:PREGUNTA_ID, 'NO', 'No', 2);

-- responder para un organismo real ya existente:
INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
SELECT (SELECT id FROM organismos LIMIT 1), :PREGUNTA_ID,
       (SELECT id FROM taxonomia_opciones WHERE pregunta_id = :PREGUNTA_ID AND codigo = 'SI');

ROLLBACK;  -- fixture de prueba, no se persiste
```

**Esperado**: las tres inserciones se aceptan sin ningún `ALTER TABLE` de
por medio — confirma FR-013.

## Paso 6 — Confirmar el rechazo por diseño (SC-004, SC-005, User Story 3)

```sql
BEGIN;
-- (a) Respuesta con la opción de OTRA pregunta (FR-007):
INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
SELECT (SELECT id FROM organismos LIMIT 1),
       (SELECT id FROM taxonomia_preguntas WHERE codigo = 'autonomia'),
       (SELECT id FROM taxonomia_opciones WHERE pregunta_id = (SELECT id FROM taxonomia_preguntas WHERE codigo = 'dependencia') LIMIT 1);
-- esperado: ERROR (trigger, FR-007)
ROLLBACK;

BEGIN;
-- (b) Segunda respuesta para el mismo par organismo-pregunta, en una
--     pregunta que NO es opcion_multiple (FR-006):
INSERT INTO evaluaciones_taxonomicas (organismo_id, pregunta_id, opcion_id)
SELECT organismo_id, pregunta_id, opcion_id FROM evaluaciones_taxonomicas LIMIT 1;
-- esperado: ERROR (trigger, FR-006) — ya existe una respuesta para ese par
ROLLBACK;
```

## Paso 7 — Migración 0002: guarda de `taxonomia_opciones` contra FR-004

Agregada después de escribir esta guía (hallazgo real de T014/US2, no
anticipado en el diseño original — ver `research.md` Decisión 5): una
opción no podía crearse para una pregunta `numerica`/`texto_libre` en el
catálogo mismo, solo se rechazaba al usarla en una respuesta. Contrato:
[contracts/migration-0002-taxonomia-opciones-guarda.sql](./contracts/migration-0002-taxonomia-opciones-guarda.sql).

```sql
BEGIN;
-- Ninguna de las 9 preguntas migradas es numerica/texto_libre (las 9 son
-- opcion_unica) — hace falta un fixture, mismo estilo que el Paso 5.
INSERT INTO taxonomia_preguntas (codigo, texto, grupo, tipo_respuesta, orden)
VALUES ('prueba_quickstart_numerica', '¿Pregunta de prueba (numérica)?', 'gestion', 'numerica', 98);

INSERT INTO taxonomia_opciones (pregunta_id, codigo, etiqueta, orden)
SELECT id, 'X', 'No debería poder crearse', 1
FROM taxonomia_preguntas WHERE codigo = 'prueba_quickstart_numerica';
-- esperado: ERROR (trigger trg_opcion_tipo_pregunta_valido, FR-004)
ROLLBACK;
```

Cobertura formal completa (INSERT/UPDATE, lote, control positivo) en
[db/validation/taxonomia_respuestas_rechazo.sql](../../db/validation/taxonomia_respuestas_rechazo.sql)
y
[db/validation/taxonomia_respuestas_valido.sql](../../db/validation/taxonomia_respuestas_valido.sql)
(US3, T015/T016).

## Criterios de aceptación cubiertos

| Success Criteria | Validado en |
|---|---|
| SC-001 (9 preguntas + opciones migradas) | Paso 3 |
| SC-002 (89×9=801 respuestas, reconciliadas) | Paso 0 (dry run real) + Paso 4 |
| SC-003 (pregunta nueva sin `ALTER TABLE`) | Paso 5 |
| SC-004 (rechazo: opción de otra pregunta) | Paso 6(a) |
| SC-005 (rechazo: respuesta duplicada sin opción múltiple) | Paso 6(b) |
| SC-006 (0 organismos con menos respuestas que antes) | Paso 0 (801 = 89×9 exacto, sin faltantes) |
