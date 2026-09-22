---

description: "Task list for 003-taxonomia-parametrizable"
---

# Tasks: Taxonomía de organismos parametrizable por preguntas

**Input**: Design documents from `/specs/003-taxonomia-parametrizable/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/migration-0001-taxonomia.sql, quickstart.md

**Tests**: no se pidió TDD; la verificación es por reconciliación (mismo
mecanismo que `001-modelo-datos-relacional`, Principio X) y por validación
SQL de integridad (mismo patrón que `db/validation/*.sql` de esa feature) —
son entregables requeridos por los FR/SC, no opcionales.

**Organización**: la migración 0001 es una única transacción atómica
(DDL + trigger + DML + reconciliación juntos, `contracts/migration-0001-taxonomia.sql`)
— no se puede desplegar "a medias" sin dejar `evaluaciones_taxonomicas`
vacía entre pasos. Por eso Foundational cubre el DDL/trigger (lo que las 3
historias necesitan sin excepción) y US1 cubre el DML + la corrida real de
la migración (el "cero pérdida" que promete la historia). US2 y US3 son
historias de **validación** sobre el esquema ya migrado por US1 — no
agregan código de migración nuevo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1–US3 (mapea a las historias de `spec.md`)
- Rutas según `plan.md`: código nuevo en `backend/` (mismo proyecto de `002-backend-api-carga-datos`); validación SQL en `db/validation/` (mismo patrón que `001-modelo-datos-relacional`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: infraestructura de migraciones versionadas para `public.*` — la primera que tiene este proyecto (research.md Decisión 1).

- [X] T001 [P] Crear `backend/migrations/` (carpeta) — destino del `FileMigrationProvider` de Kysely; confirmar la convención de nombre de archivo (`NNNN_descripcion.ts`, orden alfabético = orden de ejecución)
- [X] T002 [P] Crear `backend/src/db/kysely.ts`: instancia `Kysely<any>` para `public.*` (se documentó `<any>` en vez de `<PublicDB>` — es el tipo que la propia Kysely recomienda para una instancia dedicada solo a migraciones, no a queries tipadas), **separada** de la que usa Better Auth para `auth.*`
- [X] T003 Crear `backend/scripts/migrate-public.ts`: corredor de migraciones (`Migrator` + `FileMigrationProvider` apuntando a `backend/migrations/`), análogo a `backend/scripts/migrate-auth.ts`, con `migrationTableSchema: 'migrations'` — las 2 tablas propias de tracking del `Migrator` (`kysely_migration`, `kysely_migration_lock`) viven en su propio esquema, no en `public` (corrección aplicada 2026-09-22, research.md Decisión 1; se detectó tras la primera corrida real, se corrigió reubicando las tablas con `ALTER TABLE ... SET SCHEMA` sin re-ejecutar la migración 0001 — verificado que `public.*` volvió a sus 23 tablas exactas) (depende de T002)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DDL + trigger de integridad — lo que las 3 historias necesitan sin excepción, antes de que exista ningún dato en el modelo nuevo.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta cerrar esta fase — ni siquiera US2/US3 (validación), que necesitan el esquema y el trigger ya creados.

- [X] T004 Escribir la sección DDL de `backend/migrations/0001_taxonomia_parametrizable.ts` (método `up`): renombrar `evaluaciones_taxonomicas` → `evaluaciones_taxonomicas_v1_legacy`; crear `taxonomia_preguntas`, `taxonomia_pregunta_tipos_oficina`, `taxonomia_opciones`, `evaluaciones_taxonomicas` (forma nueva) + sus índices — contenido exacto en `contracts/migration-0001-taxonomia.sql` secciones 1-4 (depende de T001-T003)
- [X] T005 Escribir la función `validar_respuesta_taxonomia()` y el trigger `trg_respuesta_taxonomia_valida` en la misma migración (vía `sql\`...\`` de Kysely, ya que el query builder no expresa funciones/triggers) — `contracts/migration-0001-taxonomia.sql`, sección del trigger; cubre FR-004, FR-006, FR-007, FR-008 (depende de T004)
- [X] T006 [P] Escribir el método `down()` de la misma migración: borrar trigger + función + las 4 tablas nuevas, renombrar `evaluaciones_taxonomicas_v1_legacy` de vuelta a `evaluaciones_taxonomicas` — reversión completa, no parcial (depende de T005). No revierte la fila de `migracion_reconciliacion` (queda como registro histórico de auditoría, a propósito)

**Checkpoint**: esquema + integridad por diseño listos, sin ningún dato todavía en el modelo nuevo → US1 puede correr la migración de datos.

---

## Phase 3: User Story 1 - Las 9 preguntas y sus 89 respuestas migran sin pérdida (Priority: P1) 🎯 MVP

**Goal**: las 9 preguntas actuales (con sus opciones) y las 89 evaluaciones ya cargadas existen en el modelo nuevo con el mismo significado, cero pérdida (spec.md).

**Independent Test**: comparar, para cada uno de los 89 organismos con evaluación, las 9 respuestas que tenía en el modelo viejo contra las filas que tiene en la tabla de respuestas nueva — mismo valor, mismo organismo, misma pregunta, en las dos direcciones.

- [X] T007 [US1] Escribir el `INSERT` de las 9 preguntas + `taxonomia_pregunta_tipos_oficina` en la sección DML de la migración (método `up`, después del DDL de Foundational) — `contracts/migration-0001-taxonomia.sql`, sección 5 (depende de T005)
- [X] T008 [US1] Escribir el `INSERT` de las 32 opciones desde `taxonomia_codigos` — `contracts/migration-0001-taxonomia.sql`, sección 6 (depende de T007)
- [X] T009 [US1] Escribir el `INSERT` (unpivot vía `LATERAL`) de las 801 respuestas desde `evaluaciones_taxonomicas_v1_legacy` — `contracts/migration-0001-taxonomia.sql`, sección 7 (depende de T008)
- [X] T010 [US1] Escribir el bloque de reconciliación: conteo real de origen (suma de valores no nulos en las 9 columnas viejas, no un `801` fijo), `INSERT` en `migracion_reconciliacion` con `entidad='evaluaciones_taxonomicas_respuestas'`, `RAISE EXCEPTION` si no coincide (aborta la transacción completa) — `contracts/migration-0001-taxonomia.sql`, sección 8 (depende de T009). No estaba en el rango pedido explícitamente (T001-T009), pero es necesaria para que exista algo que verificar en `migracion_reconciliacion` — se hizo por pedido explícito del usuario al confirmar el resultado final
- [X] T011 [US1] Aplicar la migración contra la base real (`npx tsx backend/scripts/migrate-public.ts`) y confirmar el resultado — depende de T003, T010. Verificado dos veces antes de aplicar: (1) SQL equivalente en `BEGIN/ROLLBACK` vía `psql`, (2) el código `up()` real dentro de una transacción Kysely forzada a revertir — ambos dieron 9/18/32/801 y reconciliación `coincide`, sin dejar rastro. Aplicada en firme: `migracion_reconciliacion` real muestra `conteo_origen=801, conteo_destino=801, resultado='coincide'`
- [X] T012 [US1] Validado en `db/validation/taxonomia_reconciliacion.sql` (solo lectura, sin fixtures — lee el resultado real ya persistido, no lleva `BEGIN/ROLLBACK`): 9 preguntas, 18 filas en `taxonomia_pregunta_tipos_oficina`, 32 opciones, 801 respuestas, `migracion_reconciliacion.resultado='coincide'` con `origen=destino=801` — quickstart.md Pasos 3-4. 5/5 aserciones verdes (depende de T011)
- [X] T013 [US1] Validado en `db/validation/taxonomia_equivalencia.sql` (solo lectura) que, para los 89 organismos con evaluación, las 9 respuestas nuevas (organismo, pregunta.codigo, opción.codigo) son idénticas valor por valor a las 9 columnas de `evaluaciones_taxonomicas_v1_legacy`, en ambas direcciones: "nada de menos" (todo valor viejo tiene su fila nueva idéntica) y "nada de más" (toda fila nueva corresponde a un valor real viejo), vía unpivot de la tabla vieja con el mismo `LATERAL VALUES` que usó la migración (T009) y comparación por `FULL OUTER`-equivalente (dos `LEFT JOIN` con filtro `IS NULL`). Chequeo adicional por organismo: los 89 tienen exactamente 9 respuestas cada uno (detecta un intercambio entre dos organismos que el conteo agregado no vería). 5/5 aserciones verdes. **Control negativo**: se corrompió a propósito una fila real (opción de una respuesta cambiada por otra opción válida de la misma pregunta, dentro de una transacción revertida) y se confirmó que el archivo la detecta (`FALLO (nada de menos): 1 valores...`) antes de revertir — no es una comparación que pase en falso positivo (depende de T011)

**Checkpoint**: migración de datos aplicada y reconciliada — MVP de la feature (cero pérdida demostrada, no solo declarada).

---

## Phase 4: User Story 2 - Una pregunta nueva no requiere cambiar el esquema (Priority: P2)

**Goal**: agregar una pregunta de taxonomía nueva (con sus opciones, si corresponde) es una operación de datos únicamente (spec.md).

**Independent Test**: agregar una pregunta de prueba (categórica, con dos opciones) por inserción de filas únicamente, cargar una respuesta para un organismo existente, y confirmar que ninguna sentencia de cambio de esquema fue necesaria.

- [X] T014 [P] [US2] Validar en `db/validation/taxonomia_pregunta_nueva.sql` (fixtures, `ROLLBACK` — mismo patrón que `db/validation/reglas_asignacion.sql` de `001-modelo-datos-relacional`): (a) agregar una pregunta categórica nueva + 2 opciones + una respuesta válida a un organismo real existente, sin `ALTER TABLE`; (b) agregar una pregunta `numerica` y otra `texto_libre` sin ninguna fila en `taxonomia_opciones` — quickstart.md Paso 5. Además, a pedido explícito: (c) negativo FR-007 sobre una pregunta NUEVA (no solo las 9 migradas); (d) negativo FR-008, defensa en profundidad. **Hallazgo de esta corrida, corregido por T021 (migración 0002)**: `taxonomia_opciones` no tenía guarda propia contra FR-004 — se podía insertar una opción "colgada" de una pregunta `numerica`/`texto_libre` sin que nada lo impidiera; el trigger de `evaluaciones_taxonomicas` protegía las respuestas igual (segunda capa), pero el catálogo en sí quedaba desprotegido. Archivo actualizado con un caso (e) que prueba el cierre del gap; (d) reescrito para simular el escenario de dato preexistente (trigger deshabilitado a propósito solo para ese fixture) ya que la opción colgada no se puede crear más por el camino normal. 7/7 casos verdes, 0 residuo (depende de T011, T021)

**Checkpoint**: extensibilidad del modelo confirmada contra datos reales, sin tocar el esquema.

---

- [X] T021 [US2] Corregir el gap de FR-004 encontrado en T014: `taxonomia_opciones` no rechazaba una opción para una pregunta cuyo `tipo_respuesta` no fuera `opcion_unica`/`opcion_multiple`. Migración **nueva** `backend/migrations/0002_taxonomia_opciones_guarda_tipo.ts` (no un ajuste a la 0001, ya aplicada y trackeada — research.md Decisión 5), con función `validar_opcion_tipo_pregunta()` + trigger `trg_opcion_tipo_pregunta_valido` `BEFORE INSERT OR UPDATE ON taxonomia_opciones`, mismo patrón que `validar_respuesta_taxonomia()` (Decisión 2). Contrato: `contracts/migration-0002-taxonomia-opciones-guarda.sql`. Verificado dos veces antes de aplicar: (1) SQL del contrato en `BEGIN/ROLLBACK` vía `psql`, sin rastro post-rollback; (2) el `up()` real dentro de una transacción Kysely forzada a revertir, sin rastro. Aplicada en firme vía `migrate-public.ts` (`migrations.kysely_migration` registra `0002_taxonomia_opciones_guarda_tipo`); `public.*` sigue en 23 tablas, conteos de dominio sin cambios (`organismos=117, usuarios=47, grupos_jueces=262, taxonomia_preguntas=9, taxonomia_opciones=32, evaluaciones_taxonomicas=801, evaluaciones_taxonomicas_v1_legacy=89`); suite completa de `vitest` (59 tests) corrida dos veces seguidas, ambas 59/59. Prueba negativa pedida explícitamente: intentar crear una opción para una pregunta numérica de prueba — rechazada (`%no admite opciones%`) (depende de T011)

## Phase 5: User Story 3 - Una respuesta no puede referir una opción de otra pregunta (Priority: P2)

**Goal**: el trigger rechaza por diseño cualquier respuesta mal formada — no es una convención de aplicación (spec.md, Principio VIII).

**Independent Test**: intentar registrar una respuesta que apunte a una opción de una pregunta distinta, y confirmar que el modelo la rechaza por diseño.

- [X] T015 [P] [US3] Validar en `db/validation/taxonomia_respuestas_rechazo.sql` (fixtures, `ROLLBACK`) los 3 casos de rechazo del trigger: (a) opción que pertenece a otra pregunta (FR-007); (b) forma de la respuesta no coincide con `tipo_respuesta` de la pregunta (FR-004/FR-008); (c) segunda respuesta para el mismo par organismo-pregunta en una pregunta que no es `opcion_multiple` (FR-006) — quickstart.md Paso 6 (depende de T011). Ampliado a pedido explícito, para que la prueba sea "integridad por diseño" y no una repetición de la validación manual de T014: cada uno de los 3 casos se prueba tanto por INSERT como por UPDATE (el trigger es `BEFORE INSERT OR UPDATE`, T014 solo había probado INSERT), más (d) un INSERT en lote (2 filas, 1 inválida) que confirma que el lote entero se rechaza (atomicidad, no descarte silencioso fila por fila). Corrido como el mismo rol que usa la aplicación (`observatorio_app`, la conexión de `DATABASE_URL`) — no un rol de test con privilegios especiales. Nota de alcance explícita en el archivo: hoy no hay un endpoint de aplicación funcional contra el esquema nuevo para probar ese camino (el único existente, de `002-backend-api-carga-datos`, quedó roto por esta migración — ver hallazgo reportado aparte), así que la prueba de "ningún camino de la aplicación puede saltarse esto" es que el trigger protege cualquier DML ordinario sin importar quién lo emita, no que un endpoint específico lo respeta. Durante la escritura se encontraron y corrigieron dos errores de diseño del propio archivo de test (no del trigger): (b) intentaba reusar una opción de otra pregunta para probar FR-008, pero desde la migración 0002 eso ya no es posible (ninguna opción puede pertenecer de verdad a una pregunta numérica) y disparaba FR-007 primero — corregido a un caso sin `opcion_id`; (c) perdía su fixture de setup porque el bloque `EXCEPTION` de PL/pgSQL revierte todo el `DO $$` al punto de guardado implícito, incluido un INSERT válido anterior en el mismo bloque — corregido anidando el intento que debe fallar en un `BEGIN` interno. 9/9 casos verdes tras las correcciones, 0 residuo
- [X] T016 [P] [US3] Control positivo en `db/validation/taxonomia_respuestas_valido.sql`: (a) una respuesta válida se acepta para `opcion_unica`, `numerica` y `texto_libre`; (b) dos respuestas válidas para el mismo par (organismo, pregunta) en una pregunta `opcion_multiple` de prueba (ninguna de las 9 migradas es de ese tipo — se creó una) — para dejar claro que el trigger rechaza lo inválido, no todo; (c) INSERT en lote 100% válido, contraste directo de T015-d; (d) UPDATE válido sobre una fila existente, contraste de los UPDATE inválidos de T015. 4/4 casos verdes, 0 residuo (depende de T011)

**Checkpoint**: integridad referencial de taxonomía verificada por diseño, no por confianza en el código que inserta.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: cierre y validación de punta a punta.

- [X] T017 [P] Verificar y registrar evidencia de que `organismos`, `usuarios`, `unidades_funcionales`, `grupos_jueces` y `auth.*` no cambiaron (mismo conteo antes/después de la migración 0001) en `docs/resultado-verificacion-taxonomia-20260922.md` — quickstart.md Paso 2. Conteos: `organismos=117, usuarios=47, unidades_funcionales=277, grupos_jueces=262` (mismos valores ya establecidos en 001/002); 0 triggers nuevos en esas 4 tablas; `auth.*` con sus 4 tablas intactas, 0 filas (base de desarrollo sin usuarios reales)
- [X] T018 [P] Documentado en `backend/README.md`: sección `npm run migrate:public` (Migrator+FileMigrationProvider de Kysely, transaccionalidad, idempotencia, esquema `migrations` para tracking, regla "no se edita una migración aplicada"), carpeta `migrations/` en el árbol de Estructura, requisito nuevo, y entrada en "Limitaciones conocidas" sobre el endpoint de taxonomía roto (D11)
- [X] T019 [P] Registrada D12 en `docs/decisiones-pendientes.md`: `evaluaciones_taxonomicas_v1_legacy` queda como respaldo auditable, sin fecha de borrado (research.md Decisión 4) — decisión de cuándo borrarla explícitamente diferida a una migración posterior. (D11, sobre el endpoint roto encontrado en T015, ya estaba registrada por el usuario mismo tras el reporte — confirmado por `git log`, no duplicada)
- [X] T020 Ejecutada la validación completa de `quickstart.md` de punta a punta (Pasos 0-6) y registrada en `docs/resultado-verificacion-taxonomia-20260922.md` (mismo documento de T017). Se encontraron y corrigieron 2 bugs reales en la propia guía: Paso 3 tenía un `GROUP BY` incompleto (`ORDER BY p.orden` sin `p.orden` en el `GROUP BY` — fallaba con `ERROR: column "p.orden" must appear in the GROUP BY clause`); se agregó un Paso 7 nuevo para la migración 0002 (no existía, escrita después de la guía original), cuyo primer borrador también tenía un error (usaba una pregunta real que en realidad es `opcion_unica`, no `numerica` — corregido a un fixture propio). Los 6 pasos originales + el nuevo Paso 7 corren limpios contra la base real. Suite de `002-backend-api-carga-datos` sin regresiones (59/59, corrida dos veces)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias.
- **Foundational (Fase 2)**: depende de Setup. **Bloquea** las 3 historias — ni siquiera US2/US3 (validación) pueden correr sin el esquema y el trigger ya creados.
- **US1 (Fase 3)**: depende de Foundational. Es el "MVP" real de la feature — sin la migración de datos aplicada, no hay nada que US2/US3 puedan validar contra un organismo real.
- **US2 (Fase 4)**: depende de Foundational + US1 (T011 — necesita el esquema aplicado y al menos un organismo real migrado para la respuesta de prueba).
- **US3 (Fase 5)**: depende de Foundational + US1 (T011 — mismo motivo). Independiente de US2 entre sí (archivos de validación distintos, sin dependencia mutua).
- **Polish (Fase 6)**: depende de que US1 (mínimo) esté completa; T017/T020 idealmente corren después de US2/US3 también, para un cierre completo.

### Within each story

- DDL → trigger → DML → reconciliación → validación (Foundational y US1 siguen ese orden interno).
- US2/US3 son solo validación: fixtures → `ROLLBACK`, sin tocar datos reales.

### Parallel Opportunities

- Setup: T001, T002 en paralelo (T003 depende de T002).
- Foundational: T006 (`down()`) en paralelo con nada más — depende de T005, pero no bloquea T007 en adelante (US1 no necesita `down()` para avanzar).
- US1: T007→T008→T009→T010 son secuenciales (mismo archivo de migración, cada `INSERT` depende del anterior); T012 y T013 en paralelo entre sí una vez aplicada la migración (T011).
- US2 y US3 son independientes entre sí (archivos de validación distintos) — pueden staffearse en paralelo una vez cerrada US1.
- Polish: T017, T018, T019 en paralelo.

---

## Parallel Example: User Story 3

```bash
# Los dos archivos de validación de US3, sin dependencia mutua:
Task: "T015 [US3] Casos de rechazo del trigger en db/validation/taxonomia_respuestas_rechazo.sql"
Task: "T016 [US3] Control positivo (4 tipos de pregunta) en el mismo archivo"
```

---

## Implementation Strategy

### MVP First (Foundational + US1)

1. Fase 1: Setup — infraestructura de migraciones para `public.*`.
2. Fase 2: Foundational — DDL + trigger, sin datos todavía.
3. Fase 3: US1 — migrar las 9 preguntas + 32 opciones + 801 respuestas, reconciliado.
4. **PARAR y VALIDAR**: `db/validation/taxonomia_reconciliacion.sql` + `taxonomia_equivalencia.sql` en verde → demo de cero pérdida (MVP).

### Incremental Delivery

1. Setup + Foundational → esquema parametrizado listo, sin datos.
2. + US1 → datos migrados, reconciliados, verificados campo por campo (MVP real).
3. + US2 → extensibilidad demostrada (pregunta nueva sin `ALTER TABLE`).
4. + US3 → integridad por diseño demostrada (rechazo del trigger).
5. Polish → runbook, verificación de que el resto de `public.*` no cambió, registro de la decisión pendiente sobre la tabla legacy, quickstart end-to-end.

---

## Notes

- **[P]** = archivos distintos, sin dependencias pendientes.
- La etiqueta **[Story]** mapea cada tarea a su historia para trazabilidad.
- La migración 0001 es una única transacción (Principio X: todo o nada) —
  T004-T010 describen secciones de UN MISMO archivo, no archivos separados;
  el orden entre ellas importa (cada `INSERT` depende de que exista lo que
  referencia), pero el resultado se aplica atómicamente en T011.
- Cero tareas de esta lista tocan `organismos`, `usuarios`,
  `unidades_funcionales`, `pools_jueces`/`grupos_jueces`, `auth.*`, ni
  ningún archivo de `001-modelo-datos-relacional` o del resto de
  `002-backend-api-carga-datos` fuera de `backend/migrations/`,
  `backend/scripts/migrate-public.ts` y `backend/src/db/kysely.ts`.
- Commit por tarea o grupo lógico; parar en el checkpoint de Fase 3 para
  validar el MVP de forma independiente antes de seguir a US2/US3.
