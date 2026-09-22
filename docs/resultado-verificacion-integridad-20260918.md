# Verificación de integridad referencial (US3, T025/T026) — 20260918

Corrida contra la base con los datos migrados en US2 (`migracion_reconciliacion.corrida_a = 2026-09-17 21:59:06`), 10/10 entidades `coincide`.

## T025 — `db/validation/integridad.sql` (0 huérfanas post-migración, FR-025/SC-003)

21 relaciones verificadas. Total de filas del lado hijo y huérfanas encontradas (esperado: 0 en todas):

```
                                   relacion                                   | total_hijas | huerfanas
------------------------------------------------------------------------------+-------------+-----------
 asignacion_fueros.asignacion_id -> unidad_funcional_grupo_jueces.id          |           0 |         0
 asignacion_fueros.fuero_id -> fueros.id                                      |           0 |         0
 evaluaciones_taxonomicas.organismo_id -> organismos.id                       |          89 |         0
 grupos_jueces.provincia_id -> provincias.id                                  |         262 |         0
 localidades.provincia_id -> provincias.id                                    |         129 |         0
 organismo_editores.organismo_id -> organismos.id                             |          80 |         0
 organismo_editores.usuario_id -> usuarios.id                                 |          80 |         0
 organismo_fueros.fuero_id -> fueros.id                                       |          97 |         0
 organismo_fueros.organismo_id -> organismos.id                               |          97 |         0
 organismos.denominacion_simplificada_id -> denominaciones_simplificadas.id   |         117 |         0
 organismos.propietario_id -> usuarios.id                                     |         117 |         0
 organismos.provincia_id -> provincias.id                                     |         117 |         0
 organismos.tipo_oficina_id -> tipos_oficina.id                               |         117 |         0
 unidad_funcional_grupo_jueces.grupo_jueces_id -> grupos_jueces.id            |         266 |         0
 unidad_funcional_grupo_jueces.unidad_funcional_id -> unidades_funcionales.id |         266 |         0
 unidades_funcionales.localidad_id -> localidades.id                         |         277 |         0
 unidades_funcionales.organismo_id -> organismos.id                          |         277 |         0
 unidades_funcionales.tipo_uf_id -> tipos_uf.id                              |         277 |         0
 usuario_roles.rol_id -> roles.id                                            |          50 |         0
 usuario_roles.usuario_id -> usuarios.id                                     |          50 |         0
 usuarios.provincia_id -> provincias.id                                      |          47 |         0
(21 rows)
```

Nota: `asignacion_fueros` tiene 0 filas — es el estado esperado tras la carga inicial (tasks.md, T020: "`asignacion_fueros` queda vacía"; no hay acotamientos de fuero por asignación en los datos actuales). El total de filas hijas de cada relación coincide con los conteos ya reconciliados en `migracion_reconciliacion` (organismos=117, unidades_funcionales=277, unidad_funcional_grupo_jueces=266, organismo_editores=80, organismo_fueros=97, evaluaciones_taxonomicas=89, usuario_roles=50, usuarios=47, localidades=129).

Gate (filtro `huerfanas <> 0` sobre las 5 relaciones críticas de US3 + bridge UF↔grupos): **0 filas**.

## T026 — `db/validation/integridad_rechazo.sql` (rechazo por diseño, Principio VIII)

8 intentos de insertar una referencia rota (id inexistente = -1) contra datos reales ya migrados, cada uno dentro de un `DO` que espera `foreign_key_violation` (SQLSTATE 23503):

```
NOTICE:  OK (a): unidades_funcionales.localidad_id inexistente rechazado por FK
NOTICE:  OK (b): unidad_funcional_grupo_jueces.unidad_funcional_id inexistente rechazado por FK
NOTICE:  OK (c): unidad_funcional_grupo_jueces.grupo_jueces_id inexistente rechazado por FK
NOTICE:  OK (d): organismos.propietario_id inexistente rechazado por FK
NOTICE:  OK (e): organismo_editores.usuario_id inexistente rechazado por FK
NOTICE:  OK (f): organismo_editores.organismo_id inexistente rechazado por FK
NOTICE:  OK (g): organismo_fueros.fuero_id inexistente rechazado por FK
NOTICE:  OK (h): organismo_fueros.organismo_id inexistente rechazado por FK
ROLLBACK
```

8/8 intentos rechazados. Transacción terminada en `ROLLBACK`; verificado post-corrida con COUNT real sobre las **5 tablas** que tocaron los 8 intentos (no solo 2):

| # | Relación probada | Tabla tocada | Check post-rollback | Resultado |
|---|---|---|---|---|
| (a) | `unidades_funcionales.localidad_id → localidades` | `unidades_funcionales` | total=277 (baseline T025); `localidad_id=-1`: 0; `firestore_id LIKE 'fixture-rechazo%'`: 0 | 0 |
| (b) | `unidad_funcional_grupo_jueces.unidad_funcional_id → UF` | `unidad_funcional_grupo_jueces` | total=266 (baseline T025); `unidad_funcional_id=-1 OR grupo_jueces_id=-1`: 0 | 0 |
| (c) | `unidad_funcional_grupo_jueces.grupo_jueces_id → grupos_jueces` | `unidad_funcional_grupo_jueces` | mismo check que (b) | 0 |
| (d) | `organismos.propietario_id → usuarios` | `organismos` | total=117 (baseline T025); `propietario_id=-1`: 0; `firestore_id LIKE 'fixture-rechazo%'`: 0 | 0 |
| (e) | `organismo_editores.usuario_id → usuarios` | `organismo_editores` | total=80 (baseline T025); `organismo_id=-1 OR usuario_id=-1`: 0 | 0 |
| (f) | `organismo_editores.organismo_id → organismos` | `organismo_editores` | mismo check que (e) | 0 |
| (g) | `organismo_fueros.fuero_id → fueros` | `organismo_fueros` | total=97 (baseline T025); `organismo_id=-1 OR fuero_id=-1`: 0 | 0 |
| (h) | `organismo_fueros.organismo_id → organismos` | `organismo_fueros` | mismo check que (g) | 0 |

`organismo_editores` y `organismo_fueros` son tablas puente sin `firestore_id` propio (no tienen equivalente 1:1 en Firestore), por eso ahí el check es por valor `-1` en la FK en vez de por marcador de fixture. Los `total_filas` de las 5 tablas coinciden exactamente con los conteos reconciliados de US2 (277/266/117/80/97): cero filas de más, cero de menos tras el rollback.

Consulta de verificación ejecutada:

```sql
SELECT 'unidades_funcionales', count(*), count(*) FILTER (WHERE localidad_id = -1),
       count(*) FILTER (WHERE firestore_id LIKE 'fixture-rechazo%') FROM unidades_funcionales
UNION ALL
SELECT 'unidad_funcional_grupo_jueces', count(*),
       count(*) FILTER (WHERE unidad_funcional_id = -1 OR grupo_jueces_id = -1), NULL
FROM unidad_funcional_grupo_jueces
UNION ALL
SELECT 'organismos', count(*), count(*) FILTER (WHERE propietario_id = -1),
       count(*) FILTER (WHERE firestore_id LIKE 'fixture-rechazo%') FROM organismos
UNION ALL
SELECT 'organismo_editores', count(*),
       count(*) FILTER (WHERE organismo_id = -1 OR usuario_id = -1), NULL FROM organismo_editores
UNION ALL
SELECT 'organismo_fueros', count(*),
       count(*) FILTER (WHERE organismo_id = -1 OR fuero_id = -1), NULL FROM organismo_fueros;
```

## Cómo reproducir

```bash
psql "$DATABASE_URL" -f db/validation/integridad.sql
psql "$DATABASE_URL" -f db/validation/integridad_rechazo.sql
```
