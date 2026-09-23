# Verificación de Polish — Taxonomía parametrizable (T017, T020) — 20260922

Feature `003-taxonomia-parametrizable`. Corrida contra la base real
(`observatorio`), con las migraciones `0001_taxonomia_parametrizable` y
`0002_taxonomia_opciones_guarda_tipo` ya aplicadas
(`migrations.kysely_migration`), y con `002-backend-api-carga-datos` (59/59
tests) sin regresiones.

## T017 — `organismos`, `usuarios`, `unidades_funcionales`, `grupos_jueces` y `auth.*` sin cambios

```sql
SELECT
  (SELECT count(*) FROM organismos) AS organismos,
  (SELECT count(*) FROM usuarios) AS usuarios,
  (SELECT count(*) FROM unidades_funcionales) AS unidades_funcionales,
  (SELECT count(*) FROM grupos_jueces) AS grupos_jueces;
```

```
 organismos | usuarios | unidades_funcionales | grupos_jueces
------------+----------+-----------------------+---------------
        117 |       47 |                   277 |           262
```

Mismos valores que los ya establecidos y verificados repetidamente en
`001-modelo-datos-relacional` y `002-backend-api-carga-datos` (117
organismos, 47 usuarios, 277 UF — 11 de ellas sin asignación por regla
válida, SC-007 de 001 —, 262 grupos de jueces). Cualquier desvío habría
sido inmediatamente visible contra estas cifras conocidas.

```sql
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE event_object_table IN ('organismos','usuarios','unidades_funcionales','grupos_jueces')
ORDER BY 1,2;
```

```
(0 rows)
```

Cero triggers nuevos en esas 4 tablas — las migraciones 0001/0002 tocan
exclusivamente `evaluaciones_taxonomicas` (renombrada + recreada),
`taxonomia_preguntas`, `taxonomia_pregunta_tipos_oficina`,
`taxonomia_opciones`, tal como declaran sus comentarios de cabecera.

```sql
\dt auth.*
SELECT count(*) FROM auth."user";
SELECT count(*) FROM auth.session;
SELECT count(*) FROM auth.account;
```

Las 4 tablas de `auth.*` (`user`, `session`, `account`, `verification`)
siguen existiendo sin cambios de forma; 0 filas en cada una (base de
desarrollo sin usuarios reales creados todavía — esperado, no una
regresión).

## T018 — `backend/README.md` actualizado

**Antes**: no mencionaba ningún mecanismo de migraciones para `public.*` —
solo `npm run migrate:auth`. Confirmado por lectura directa del archivo
antes de esta corrida.

**Después**: agregada una sección `npm run migrate:public` (con su propio
párrafo explicando `Migrator`+`FileMigrationProvider` de Kysely,
transaccionalidad, idempotencia, el esquema `migrations` para las tablas de
tracking, y la regla "una migración aplicada no se edita, se agrega una
nueva" con referencia a `research.md` Decisión 5), la carpeta `migrations/`
agregada al árbol de "Estructura", un requisito nuevo en "Requisitos", y
una entrada nueva en "Limitaciones conocidas" sobre el endpoint de
taxonomía roto (ver T019/D11 abajo).

## T019 — `docs/decisiones-pendientes.md`: D12 registrada

Agregada **D12** — `evaluaciones_taxonomicas_v1_legacy` queda como respaldo
auditable sin fecha de borrado, con la decisión de cuándo borrarla
explícitamente diferida a una migración posterior (research.md Decisión
4). No existía una entrada previa para esto.

Nota aparte: **D11** (endpoint `PUT/GET /api/organismos/:orgId/taxonomia`
de `002-backend-api-carga-datos` roto por la migración 0001 de esta
feature) ya estaba registrada — el usuario la agregó directamente tras el
reporte de este hallazgo durante T015 (US3). Confirmado con
`git log -1 -- docs/decisiones-pendientes.md` (commit `5320b1f`, autor
Santiago Miguelez, 2026-09-22 17:41:35 -03) — no duplicada acá.

## T020 — `quickstart.md` de punta a punta (Pasos 0-7)

**Paso 0 (dry run del contrato 0001)**: no reproducible tal cual contra la
base actual — ya migrada, `evaluaciones_taxonomicas_v1_legacy` ya existe,
así que el `ALTER TABLE ... RENAME` del contrato falla con `relation
"evaluaciones_taxonomicas_v1_legacy" already exists`. Es el comportamiento
esperado de un dry run pensado para correr *antes* de la migración real
(ya documentado como tal en `quickstart.md`), no una regresión — se
confirmó que el intento fallido no dejó rastro (`evaluaciones_taxonomicas`
sigue en 801 filas, `_v1_legacy` en 89).

**Paso 1 (aplicar)**: ya aplicada en firme (T011) — no se re-corrió; `npx
tsx scripts/migrate-public.ts` sobre una base al día es idempotente
(confirmado en T003/Decisión 1) y no vuelve a ejecutar nada.

**Paso 2**: ver T017 arriba.

**Paso 3 (preguntas/opciones, SC-001)**: se encontró y corrigió un bug real
en la consulta del propio `quickstart.md` (`ORDER BY p.orden` sin `p.orden`
en el `GROUP BY` → `ERROR: column "p.orden" must appear in the GROUP BY
clause`). Corregido agregando `p.orden` al `GROUP BY`. Resultado tras la
corrección:

```
          codigo           |     grupo      | opciones
---------------------------+----------------+----------
 insercion_institucional   | institucional  |        3
 jerarquia_normativa       | institucional  |        4
 dependencia               | organizacion   |        4
 asistencia_jurisdiccional | organizacion   |        3
 autonomia                 | gestion        |        4
 alcance_proceso           | implementacion |        4
 alcance_fuero             | implementacion |        4
 presencia_territorial     | implementacion |        4
 grado_implementacion      | implementacion |        2
```

9 preguntas, suma de opciones = 3+4+4+3+4+4+4+4+2 = 32 — coincide con
`taxonomia_opciones` (32) y con `taxonomia_codigos` (32, origen).

**Paso 4 (reconciliación, SC-002)**:

```
               entidad               | conteo_origen | conteo_destino | resultado |           corrida_a
--------------------------------------+---------------+----------------+-----------+-------------------------------
 evaluaciones_taxonomicas_respuestas |           801 |            801 | coincide  | 2026-09-22 15:47:19.442381-03
```

**Paso 5 (pregunta nueva sin `ALTER TABLE`, SC-003)**: 3 INSERT aceptados
(pregunta + 2 opciones + 1 respuesta a un organismo real, id devuelto
`842`), 0 `ALTER TABLE` ejecutados, `ROLLBACK` sin dejar rastro.

**Paso 6 (rechazo por diseño, SC-004/SC-005)**:
- (a) opción de otra pregunta: `ERROR: evaluaciones_taxonomicas: la opción
  8 pertenece a la pregunta 3, no a la pregunta 5 de esta respuesta
  (FR-007)`.
- (b) segunda respuesta al mismo par organismo-pregunta: `ERROR:
  evaluaciones_taxonomicas: ya existe una respuesta de organismo 237 a la
  pregunta 5 (no es opcion_multiple — FR-006)`.

**Paso 7 (nuevo — migración 0002, guarda de `taxonomia_opciones`)**:
agregado a `quickstart.md` en esta corrida, no existía antes (0002 se
escribió después de la guía original). Se encontró y corrigió un error de
diseño en el ejemplo antes de dejarlo escrito: usaba
`grado_implementacion` como "pregunta numérica de ejemplo", pero las 9
preguntas migradas son las 9 `opcion_unica` (confirmado por consulta
directa) — ninguna es `numerica`/`texto_libre`. Corregido a un fixture
propio, mismo estilo que el Paso 5:

```
ERROR:  taxonomia_opciones: la pregunta 34 es numerica — no admite opciones (FR-004)
```

Cobertura formal completa (INSERT/UPDATE, lote, control positivo) en
`db/validation/taxonomia_respuestas_rechazo.sql` (9/9 casos) y
`db/validation/taxonomia_respuestas_valido.sql` (4/4 casos) — T015/T016.

## Regresión de `002-backend-api-carga-datos`: sin cambios

```bash
BETTER_AUTH_SECRET="..." GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." npx vitest run
```

59/59 tests, corrido dos veces seguidas (T021, verificación de la
migración 0002) — sin regresiones atribuibles a esta feature.
