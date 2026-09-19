# Validación end-to-end de quickstart.md (T034) — 20260918

Corrida contra la base con los datos migrados en US2 (`migracion_reconciliacion.corrida_a = 2026-09-17 21:59:06`, 10/10 `coincide`). Objetivo: confirmar que cada paso del quickstart sigue describiendo fielmente lo que efectivamente se hizo, no lo planeado antes de D8/D-16.

## Paso 1 — Esquema

```sql
\dt   -- tablas
\dv   -- vista
\dT   -- tipos
```

Resultado: **19 tablas** (`provincias` … `usuario_roles`), vista `vista_fuero_simplificado`, tipos `citext` y `estado_fueros_enum`. **No existe** `modo_jueces_enum` — confirma que el comentario del quickstart ("`modo_jueces_enum` eliminado por D8") es fiel al estado real, no aspiracional.

`db/schema.sql` y `contracts/schema.sql` son **byte-idénticos** (`diff` sin salida, exit 0) — T035 confirmado en el mismo pase.

## Paso 2 — Semillas

```sql
SELECT count(*) FROM provincias;                  -- 24
SELECT count(*) FROM denominaciones_simplificadas; -- 10
SELECT count(*) FROM fueros;                       -- 4
SELECT count(*) FROM tipos_oficina;                -- 4
SELECT count(*) FROM tipos_uf;                     -- 3
SELECT count(*) FROM roles;                        -- 2
```

Todos coinciden con los valores documentados en el quickstart.

## Paso 3 — Orden de carga

Comparado el orden descrito en el quickstart contra `migration/src/reconcile/orchestrator.js` (código real, no el plan): `usuarios → localidades → grupos_jueces → organismos (+organismo_editores +organismo_fueros) → unidades_funcionales → asignaciones de jueces → evaluaciones_taxonomicas`, todo dentro de **una sola transacción** (`BEGIN`/`COMMIT`/`ROLLBACK` en el orquestador). Coincide exactamente con el texto del quickstart — sin discrepancias.

Nota de implementación (no afecta al quickstart, es detalle interno): `usuario_roles` se resuelve dentro de `load/usuarios.js` y `organismo_editores`/`organismo_fueros` dentro de `load/organismos.js`, no en archivos separados `usuario-roles.*`/`identity.*`/`fueros.*` como sugieren los nombres de archivo de T028/T029/T031 en `tasks.md`. Funcionalmente equivalente y ya reconciliado; se deja registrado por transparencia.

## Paso 4 — Reconciliación

Ya reconciliado y reportado en conversaciones previas: 10/10 entidades `coincide` en `migracion_reconciliacion`, corrida `2026-09-17 21:59:06`.

## Paso 5 — Integridad y reglas (re-ejecutado íntegramente)

| Query del quickstart | Esperado (texto original) | Resultado real (20260918) |
|---|---|---|
| UF→localidad huérfanas | 0 | **0** |
| organismos.propietario_id huérfano | 0 | **0** |
| emails duplicados | 0 filas | **0 filas** |
| UF sin asignaciones | 2 | **11** — el texto original (2) es pre-D-16; corregido en este pase |
| UF con asignaciones | 275 | **266** — ídem, corregido |
| jueces agregado (SUM total_jueces de grupos referenciados) | (no fijado en el doc) | **1975** |
| `multifuero_sin_detalle` | 20 | **20** |
| `sin_fueros_asignados` | 0 | **0** |
| vista `fuero_simplificado = 'multifuero'` | 20 | **20** |
| `anio_implementacion` fuera de [1900,2100] | 0 | **0** |

**Corrección aplicada al quickstart**: el Paso 5 tenía "2 UF sin asignaciones / 275 con" hardcodeado, contradiciendo la Nota D-16 ya presente en el Paso 4 del mismo documento (que sí decía 266). Se corrigió a 11/266 con referencia a D-16, y se agregaron enlaces a los scripts reproducibles (`db/validation/*.sql`) en vez de dejar solo el SQL inline como única fuente.

## Paso 6 — Respaldo de solo lectura / `firestore_id`

```sql
SELECT count(*), count(firestore_id) FROM usuarios;               -- 47 / 47
SELECT count(*), count(firestore_id) FROM organismos;              -- 117 / 117
SELECT count(*), count(firestore_id) FROM localidades;             -- 129 / 129
SELECT count(*), count(firestore_id) FROM unidades_funcionales;    -- 277 / 277
SELECT count(*) FILTER (WHERE firestore_id IS NOT NULL) FROM grupos_jueces;  -- 30 (pools)
SELECT count(*) FILTER (WHERE firestore_id IS NULL) FROM grupos_jueces;     -- 232 (exclusivos derivados)
```

100% de las filas con equivalente directo en Firestore conservan su `firestore_id`; los 232 grupos exclusivos derivados (sin colección de origen, D8) tienen `firestore_id IS NULL` por diseño, no por omisión. El respaldo de solo lectura en sí (que Firestore no se escribió durante la migración) es una garantía de proceso, no verificable por SQL; documentada en `docs/runbook-corte-produccion.md`.

## Cambios aplicados a quickstart.md en este pase

1. Corregidas las cifras de SC-007 en el Paso 5 (2/275 → 11/266, con nota D-16).
2. Agregada lista de scripts reproducibles (`db/validation/*.sql`) al inicio del Paso 5.
3. Aclarado que los "intentos negativos" del Paso 5 son ilustrativos; la versión ejecutable real está en `reglas_asignacion.sql` e `integridad_rechazo.sql`.
4. Tabla de criterios de aceptación: agregada columna "Evidencia registrada" con los docs `resultado-verificacion-*-2026091{7,8}.md`.
5. Agregada referencia final a `docs/runbook-corte-produccion.md`, aclarando que ese documento es el proceso del corte real, distinto de esta corrida de prueba.
