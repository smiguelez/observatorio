---

description: "Task list template for feature implementation"
---

# Tasks: Endpoint de taxonomía de organismos, reconstruido para el modelo parametrizable

**Input**: Design documents from `/specs/004-fix-taxonomia-endpoint/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — todos completos.

**Tests**: incluidos — el spec los exige explícitamente (FR-015, FR-023: cobertura automatizada, causa raíz documentada de D11).

**Organization**: agrupadas por historia de usuario (spec.md), en orden de prioridad (P1 → P2 → P3).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: confirmar el punto de partida — esta feature no introduce infraestructura nueva (mismo backend, mismas carpetas, ninguna dependencia nueva).

- [X] T001 Confirmado contra la base real: `migrations.kysely_migration` con `0001`/`0002`; `public.*` en 23 tablas; `auth.*` en 4 tablas; suite de `vitest` en 59/59; conteos de dominio (`organismos=117, usuarios=47, grupos_jueces=262, taxonomia_preguntas=9, taxonomia_opciones=32, evaluaciones_taxonomicas=801`); organismo id=311 con sus 9 respuestas históricas confirmadas como punto de partida

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: lo único que de verdad bloquea a más de una historia — la forma compartida de una "entrada de taxonomía" que consumen tanto `GET` (US1) como la respuesta de `PUT` (US2).

**⚠️ CRITICAL**: sin esto, US1 y US2 definirían la misma forma dos veces por separado.

- [X] T002 [P] Implementado en `backend/src/routes/organismos.ts`. La pieza genuinamente compartida resultó ser una **función de consulta** (`obtenerTaxonomiaOrganismo`, agrupa por pregunta con `json_agg` para las opciones), no solo un tipo — ajuste de diseño respecto de la redacción original de esta tarea, documentado acá; el body de `PUT` (`ReemplazarTaxonomiaBody`) se definió junto con T006 ya que `GET` no lo necesita. `TaxonomiaBody` (9 columnas) eliminado

**Checkpoint**: tipo compartido listo — US1 y US2 pueden implementarse.

---

## Phase 3: User Story 1 - Consultar la taxonomía cargada de un organismo (Priority: P1) 🎯 MVP

**Goal**: `GET /api/organismos/:orgId/taxonomia` devuelve las respuestas del organismo agrupadas por pregunta, con texto y tipo incluidos, sin que el consumidor necesite conocer el esquema interno.

**Independent Test**: pedir la taxonomía de uno de los 89 organismos migrados y confirmar 9 entradas con código/texto/tipo/opción; pedir la de un organismo sin evaluación y confirmar 200 con `[]`.

### Implementation for User Story 1

- [X] T003 [US1] Reescrito. `GET` real (curl, HTTP): organismo id=237 (uno de los 89 migrados) → 200, 9 entradas con código/texto/tipoRespuesta/opción; organismo real sin evaluación → 200, `[]` (depende de T002)

### Tests for User Story 1

- [X] T004 [US1] `backend/tests/contract/taxonomia.test.ts` creado (archivo nuevo — no existía, causa raíz de D11). 4 casos verdes: 9 entradas con código/texto/tipoRespuesta/opción; 200+`[]` sin evaluación; 404 en `:orgId` inexistente; 403 sin autorización (depende de T003)

**Checkpoint**: `GET` funcional y verificable de forma independiente — SC-001.

---

## Phase 4: User Story 2 - Reemplazar la taxonomía de un organismo de una sola vez (Priority: P1)

**Goal**: `PUT` reemplaza atómicamente el conjunto completo de respuestas de un organismo.

**Independent Test**: enviar un conjunto válido (incluida una pregunta `opcion_multiple` de prueba con 2+ opciones) y confirmar por `GET` posterior que es exactamente ese conjunto — ni de más ni de menos.

### Implementation for User Story 2

- [X] T005 [US2] Creado `backend/src/db/transaction.ts` (`conTransaccion`) — research.md Decisión 3
- [X] T006 [US2] Reescrito. Se agregó además una validación previa a la transacción, no anticipada en el diseño original: un `preguntaCodigo` desconocido violaría un `NOT NULL` (SQLSTATE `23502`), no un trigger (`P0001`) — `esRechazoDeTrigger` (US3) no lo detectaría; se valida explícito antes de tocar nada, con 400 (FR-013) (depende de T002, T005)

### Tests for User Story 2

- [X] T007 [US2] 3 casos verdes en `taxonomia.test.ts`: conjunto válido con `opcion_multiple` (2 opciones) + `GET` idéntico; `respuestas: []` borra todo; omitir una pregunta la deja sin respuesta (depende de T006)

**Checkpoint**: MVP completo — `GET`+`PUT` funcionan contra el esquema real. SC-002.

---

## Phase 5: User Story 3 - Recibir un error identificable al enviar un conjunto inválido (Priority: P2)

**Goal**: un rechazo de los triggers de integridad ya existentes (`003`) se traduce en un error de cliente identificable, nunca un 500 genérico; la taxonomía previa queda intacta.

**Independent Test**: `PUT` con una opción que pertenece a otra pregunta → 400 con mensaje identificable; `GET` posterior confirma que no cambió nada.

### Implementation for User Story 3

- [X] T008 [US3] Creado `backend/src/http/trigger-error.ts` (`esRechazoDeTrigger`)
- [X] T009 [US3] `PUT` envuelto en `try/catch` (depende de T006, T008)

### Tests for User Story 3

- [X] T010 [US3] 3 casos verdes: opción de otra pregunta → 400 + `GET` sin cambios; dos respuestas no-múltiple → 400; forma equivocada (numérica) → 400 (depende de T009)

**Checkpoint**: los rechazos de integridad de `003` ya se traducen correctamente. SC-003, SC-004 (parcial).

---

## Phase 6: User Story 4 - Impedir que una respuesta nueva quede mal asignada al tipo de organismo — Protección A (Priority: P2)

**Goal**: un trigger nuevo rechaza toda escritura *nueva* para una pregunta que no aplica al tipo actual del organismo; no revalida ni toca datos ya existentes (el caso histórico de id=311 sigue intacto).

**Independent Test** (nivel esquema, no depende del endpoint): intentar una escritura para un organismo de un tipo no aplicable a una pregunta dada → rechazo; confirmar que id=311 no cambia. Ya verificado en el dry-run de `plan.md`/`contracts/migration-0003-taxonomia-tipo-organismo.sql`.

### Implementation for User Story 4

- [X] T011 [US4] Escrito, espejo exacto del contrato ya dry-run-probado (depende de T001)
- [X] T012 [US4] Dry-run del `up()` real en transacción Kysely forzada a revertir → sin rastro; aplicado en firme. Verificado: `public.*` en 23 tablas (sin cambio), `migrations.kysely_migration` registra `0003_taxonomia_tipo_organismo`, id=311 en 9 antes y después (depende de T011)
- [X] T013 [P] [US4] 3/3 casos verdes en `db/validation/taxonomia_tipo_organismo.sql`: rechazo (organismo tipo 4, pregunta no aplicable), positivo (pregunta de prueba vinculada a tipo 1, aceptada), y confirmación explícita de que id=311 sigue en 9 respuestas (depende de T012)

### Tests for User Story 4

- [X] T014 [US4] Test verde: `PUT` para un organismo nuevo de tipo `unidad operativa` → 400, `error` matchea `/no aplica al tipo de organismo actual/`; el propio test verifica dentro del assert que `evaluaciones_taxonomicas WHERE organismo_id=311` sigue en 9 antes y después. **Hallazgo real durante esta tarea**: al correr la suite completa tras aplicar `0003`, un test de US1/US2 falló — el fixture de una pregunta `opcion_multiple` de prueba nunca había quedado vinculado a ningún `tipo_oficina_id`, así que Protección A la rechazaba correctamente (el trigger funcionaba bien, el fixture estaba incompleto). Se revisaron y corrigieron los 3 fixtures de preguntas de prueba del archivo — dos de ellas (US3, T010) ya "pasaban" pero por el motivo equivocado (depende de T009, T012)

**Checkpoint**: Protección A activa y verificada en dos niveles — esquema (T013) y endpoint (T014). SC-006.

---

## Phase 7: User Story 5 - Avisar y confirmar antes de perder taxonomía al cambiar el tipo de un organismo — Protección B (Priority: P3)

**Goal**: `PATCH /api/organismos/:id` avisa qué se perdería y exige confirmación explícita antes de aplicar un cambio de tipo que dejaría respuestas de taxonomía huérfanas.

**Independent Test**: `PATCH` sin confirmación sobre un organismo con respuestas huérfanas → 400 con el listado, tipo sin cambiar; reenviado con confirmación → 200, tipo cambiado, huérfanas eliminadas, en la misma operación.

### Implementation for User Story 5

- [X] T015 [US5] Campo agregado a `ActualizarOrganismoBody`
- [X] T016 [US5] Handler extendido tal como se diseñó en data-model.md (depende de T005, T012, T015)

### Tests for User Story 5

- [X] T017 [US5] `backend/tests/integration/organismos-cambio-tipo.test.ts` creado. 3/3 casos verdes en el primer intento: bloqueo sin confirmación + listado exacto; confirmado → tipo cambiado + huérfanas eliminadas (`GET` taxonomia da `[]`); sin taxonomía cargada → 200 inmediato (depende de T016)

**Checkpoint**: las 5 historias de usuario completas y verificables de forma independiente. SC-007, SC-008, SC-009.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T018 [P] `backend/README.md` actualizado: sección nueva "Endpoint de taxonomía (004-fix-taxonomia-endpoint)" documentando `GET`/`PUT` reconstruidos y las Protecciones A/B; removida la entrada de "Limitaciones conocidas" sobre el endpoint roto (D11); actualizado el bullet de Requisitos para mencionar la migración `0003`
- [X] T019 [P] `docs/decisiones-pendientes.md`: D11 marcada **RESUELTA (2026-09-23)**, con el detalle de la resolución (endpoint reconstruido, cobertura de test agregada, las dos protecciones nuevas) y la aclaración explícita de que el organismo id=311 en sí no fue tocado retroactivamente
- [X] T020 Suite completa de `vitest` corrida dos veces seguidas al cierre: **73/73** ambas corridas (14 archivos) — sin regresiones de `002`/`003`
- [X] T021 `quickstart.md` ejecutado de punta a punta (Pasos 1-9) contra el backend real levantado (`npm run dev`, HTTP real vía `curl` con una sesión real — no `app.inject`), resultados en `docs/resultado-verificacion-taxonomia-endpoint-20260923.md`. Los 9 pasos verdes; datos de la corrida limpiados al terminar, confirmado por consulta directa
- [X] T022 Las 9 Success Criteria de `spec.md` repasadas una por una con evidencia real en el mismo documento — SC-001 a SC-009, todas ✅

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: sin dependencias.
- **Foundational (T002)**: depende de T001 — bloquea US1 y US2.
- **US1 (T003-T004)**: depende de Foundational. Sin dependencia de otras historias.
- **US2 (T005-T007)**: depende de Foundational. Independiente de US1 (mismo archivo, `organismos.ts`, pero rutas distintas — no hay conflicto de datos).
- **US3 (T008-T010)**: depende de US2 (T006) — envuelve el `PUT` que US2 ya construyó.
- **US4 (T011-T014)**: T011-T013 (migración + validación de esquema) son independientes de US1/US2/US3 — pueden empezar en paralelo con ellas. T014 (test de integración vía el endpoint) depende de US3 (T009, el mapeo de error) y de T012 (migración aplicada).
- **US5 (T015-T017)**: depende de T005 (US2, helper de transacción) y T012 (US4, la función `taxonomia_pregunta_aplica_a_tipo` debe existir).
- **Polish (T018-T022)**: depende de que todas las historias que se vayan a entregar estén completas.

### Notas de independencia real

- US1 y US2 comparten archivo (`organismos.ts`) pero no lógica — son verificables por separado (`GET` no necesita que `PUT` esté implementado, y viceversa).
- US3 no es independiente de US2 en el sentido estricto (extiende su `try/catch`), pero sigue siendo una historia entregable por separado: sin US3, US2 ya funciona (solo que un rechazo se ve como 500 en vez de 400).
- US4 es la única historia con una mitad genuinamente independiente (T011-T013, verificación de esquema) y una mitad dependiente de otra historia (T014, verificación de endpoint) — reflejado explícitamente arriba.

---

## Parallel Example: User Story 4

```bash
# T011 (escribir la migración) y T013 (escribir el archivo de validación) pueden
# redactarse en paralelo — T013 se corre recién después de que T012 aplique la
# migración en firme, pero el archivo mismo no depende de eso para escribirse.
Task: "Escribir backend/migrations/0003_taxonomia_tipo_organismo.ts"
Task: "Escribir db/validation/taxonomia_tipo_organismo.sql"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Completar Setup (T001) + Foundational (T002).
2. Completar US1 (T003-T004) — `GET` funcional.
3. Completar US2 (T005-T007) — `PUT` funcional, reemplazo atómico.
4. **Parar y validar**: el endpoint roto (D11) ya está reconstruido — MVP real.

### Incremental Delivery

1. Setup + Foundational.
2. US1 → US2 → validar → esto ya resuelve el bug original de D11.
3. US3 → los rechazos dejan de verse como 500 → validar.
4. US4 → Protección A → validar (esquema y endpoint por separado).
5. US5 → Protección B → validar.
6. Polish.

Cada historia entrega valor real sin romper las anteriores — parar después
de US2 ya es un estado desplegable si el resto se prioriza para después.
