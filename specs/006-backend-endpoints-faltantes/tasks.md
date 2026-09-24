---

description: "Task list template for feature implementation"
---

# Tasks: Endpoints de backend que el frontend necesita y hoy no existen

**Input**: Design documents from `/specs/006-backend-endpoints-faltantes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — todos completos.

**Tests**: incluidos — mismo criterio que `002`-`004` (verificación contra la base real, no mocks).

**Organization**: agrupadas por historia de usuario (spec.md), en orden de prioridad (P1 → P2).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: confirmar el punto de partida — esta feature no introduce infraestructura nueva ni ninguna migración (research.md, Decisión 1).

- [X] T001 Confirmado contra la base real: `migrations.kysely_migration` con `0001`-`0003`, `public.*` en 23 tablas, `auth.*` en 4 tablas, suite de `vitest` en 73/73 (dos veces), typecheck limpio. Conteos de dominio verificados, incluidos `unidad_funcional_grupo_jueces=266` y `organismo_editores=80` (datos reales ya presentes para probar lectura/escritura, no solo casos vacíos)

---

## Phase 2: Foundational

**Purpose**: no hay ningún bloqueante genuino compartido por las 5 historias — a diferencia de `004`/`005`, ninguna necesita algo que las demás también necesiten antes de poder empezar. Fase sin tareas.

**Checkpoint**: las 5 historias pueden empezar directamente después de T001.

---

## Phase 3: User Story 1 - Leer los catálogos de referencia (Priority: P1) 🎯 MVP

**Goal**: `GET` de los 5 catálogos de referencia (provincias, denominaciones simplificadas, tipos de oficina, tipos de UF, fueros), sin restricción más allá de estar autenticado.

**Independent Test**: pedir cada uno de los 5 catálogos con una sesión autenticada sin ninguna relación con ningún organismo, y confirmar que devuelve la lista completa real.

### Implementation for User Story 1

- [X] T002 [P] [US1] Crear `backend/src/routes/catalogos.ts`: `GET /api/provincias`, `/api/denominaciones-simplificadas`, `/api/tipos-oficina`, `/api/tipos-uf`, `/api/fueros` — mismo patrón que `localidades.ts` (sin autorización más allá de autenticado, sin escritura, FR-001/FR-002)
- [X] T003 [US1] Registrar `registrarRutasCatalogos` en `backend/src/app.ts` (depende de T002)

### Tests for User Story 1

- [X] T004 [US1] Tests automatizados en `backend/tests/contract/catalogos.test.ts` (archivo nuevo): cada uno de los 5 catálogos devuelve la lista completa real (comparar contra `SELECT count(*)` de cada tabla); sin sesión → 401 (depende de T003)

**Checkpoint**: los 5 catálogos son legibles de punta a punta. SC-001.

---

## Phase 4: User Story 2 - Consultar el fuero de un organismo (Priority: P1)

**Goal**: `GET /api/organismos/:orgId/fuero` con el detalle de fueros y el valor simplificado (D3).

**Independent Test**: pedir el fuero de un organismo real con fueros cargados y de uno sin ninguno, confirmando ambas respuestas.

### Implementation for User Story 2

- [X] T005 [US2] Agregar `GET /api/organismos/:orgId/fuero` en `backend/src/routes/organismos.ts`, reusando `autorizarContraOrganismoPadre` — consulta `organismo_fueros JOIN fueros` + `vista_fuero_simplificado`, devuelve `{ fueros: [], fueroSimplificado: null }` para un organismo sin fueros (FR-003/FR-004)

### Tests for User Story 2

- [X] T006 [US2] Tests automatizados en `backend/tests/contract/organismo-fuero.test.ts` (archivo nuevo): organismo con fueros cargados → detalle + simplificado correctos (verificar contra `vista_fuero_simplificado` directo); organismo real sin fueros → `200`, `{fueros:[], fueroSimplificado:null}`; `:orgId` inexistente → 404; sin autorización → 403 (depende de T005)

**Checkpoint**: fuero legible, con y sin datos. SC-002.

---

## Phase 5: User Story 3 - Gestionar la asignación de jueces de una UF (Priority: P1)

**Goal**: CRUD de `unidad_funcional_grupo_jueces` (D8), con los rechazos de integridad ya garantizados por el esquema traducidos a errores de cliente identificables.

**Independent Test**: crear una asignación válida, confirmar que un segundo intento al mismo par UF-pool se rechaza, que una cantidad no positiva se rechaza, y que una UF puede tener 2 asignaciones a pools distintos a la vez.

### Implementation for User Story 3

- [X] T007 [US3] Generalizar `backend/src/http/trigger-error.ts`: `esRechazoDeIntegridad` (reconoce `P0001` + `23505` + `23514` + `23503`) + tabla de mensajes por nombre de constraint (research.md, Decisiones 2-3) — `esRechazoDeTrigger` (`004`) queda intacto para no romper su uso ya existente
- [X] T008 [US3] Agregar `GET/POST/PATCH/DELETE /api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces(/:asignacionId)` en `backend/src/routes/organismos.ts`, autorización heredada de la UF, usando `esRechazoDeIntegridad` para mapear rechazos a 400 (FR-005 a FR-011) (depende de T007)

### Tests for User Story 3

- [X] T009 [US3] Tests automatizados en `backend/tests/contract/asignaciones-jueces.test.ts` (archivo nuevo): crear asignación válida y leerla; segunda asignación al mismo par UF-pool → 400 "Ya existe..."; cantidad 0 → 400 "...mayor a 0"; pool inexistente → 400 "...no existe"; segunda asignación a un pool *distinto* → ambas coexisten (D8); editar cantidad; eliminar (depende de T008)

**Checkpoint**: asignaciones de jueces funcionando, con integridad verificada en los 3 casos de rechazo. SC-003, SC-004 (parcial).

---

## Phase 6: User Story 5 - Leer el catálogo completo de preguntas de taxonomía (Priority: P1)

**Goal**: `GET /api/taxonomia/preguntas`, filtrable por `tipoOficinaId`, distinto del endpoint de respuestas de `004`.

**Independent Test**: pedir el catálogo sin filtro (9 preguntas), filtrado por un tipo con preguntas aplicables, y filtrado por un tipo sin ninguna.

### Implementation for User Story 5

- [X] T010 [P] [US5] Crear `backend/src/routes/taxonomia.ts`: `GET /api/taxonomia/preguntas` con filtro opcional `tipoOficinaId` (`JOIN taxonomia_pregunta_tipos_oficina` cuando se pasa), validando el id contra `tipos_oficina` antes de filtrar — 400 si no existe, `[]` si existe pero sin preguntas aplicables (FR-014 a FR-017)
- [X] T011 [US5] Registrar `registrarRutasTaxonomia` en `backend/src/app.ts` (depende de T010)

### Tests for User Story 5

- [X] T012 [US5] Tests automatizados en `backend/tests/contract/taxonomia-preguntas.test.ts` (archivo nuevo): sin filtro → 9 preguntas; `tipoOficinaId` de oficina judicial → 9; `tipoOficinaId` de unidad operativa → `[]`; `tipoOficinaId` inexistente → 400; una pregunta `opcion_unica` incluye `opciones`, una `numerica` no (depende de T011)

**Checkpoint**: catálogo de preguntas legible y filtrable. SC-006.

---

## Phase 7: User Story 4 - Gestionar los editores de un organismo (Priority: P2)

**Goal**: alta/baja de editores de un organismo, restringido a propietario o admin (no editores entre sí).

**Independent Test**: agregar un editor y confirmar que ese usuario ve el organismo; que un editor no puede agregar a otro; quitar un editor y confirmar que pierde el acceso.

### Implementation for User Story 4

- [X] T013 [US4] Agregar `GET/POST/DELETE /api/organismos/:orgId/editores(/:usuarioId)` en `backend/src/routes/organismos.ts` — `GET` con la autorización ya vigente del organismo; `POST`/`DELETE` con la composición propietario-o-admin de research.md Decisión 4 (no `puedeGestionarOrganismo`); usa `esRechazoDeIntegridad` (T007) para el caso de editor duplicado (FR-012/FR-013) (depende de T007)

### Tests for User Story 4

- [X] T014 [US4] Tests automatizados en `backend/tests/contract/organismo-editores.test.ts` (archivo nuevo): agregar editor → aparece en `GET /api/organismos` del usuario agregado; agregar el mismo editor de nuevo → 400 "Ese usuario ya es editor..."; agregar un `usuarioId` inexistente → 400; un editor (no propietario) intenta agregar otro editor → 403; quitar un editor → pierde el acceso al organismo (depende de T013)

**Checkpoint**: las 5 historias completas y verificables de forma independiente. SC-005.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T015 [P] Actualizar `backend/README.md`: documentar los 5 grupos de endpoints nuevos, sin ninguna migración asociada (research.md, Decisión 1)
- [X] T016 Correr la suite completa de `vitest` dos veces seguidas — confirmar que ninguna prueba de `002`-`004` se rompió
- [X] T017 Ejecutar `quickstart.md` de punta a punta (Pasos 1-5) contra el backend real levantado, registrar resultados en `docs/resultado-verificacion-endpoints-faltantes-<fecha>.md`
- [X] T018 Repasar las 7 Success Criteria de `spec.md` una por una con evidencia real (mismo formato que `001`-`004`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: sin dependencias.
- **Foundational**: sin tareas — las 5 historias empiezan directo después de T001.
- **US1 (T002-T004)**, **US2 (T005-T006)**, **US5 (T010-T012)**: independientes entre sí y del resto — archivos distintos (`catalogos.ts`, la subruta de fuero en `organismos.ts`, `taxonomia.ts`).
- **US3 (T007-T009)**: independiente de US1/US2/US5. T007 (generalizar `trigger-error.ts`) es un prerequisito real de **US4**, no solo de US3 — documentado como dependencia cruzada explícita.
- **US4 (T013-T014)**: depende de T007 (US3) para `esRechazoDeIntegridad`.
- **Polish**: depende de que todas las historias que se vayan a entregar estén completas.

### Notas de independencia real

- US2, US3, y US4 comparten archivo (`organismos.ts`) — no son `[P]` entre sí aunque sean conceptualmente independientes (mismo criterio que `004` con US2/US3 de esa feature).
- US1 (`catalogos.ts`) y US5 (`taxonomia.ts`) son los únicos archivos nuevos sin ninguna relación con `organismos.ts` — sí marcados `[P]`.

---

## Parallel Example: Historias sin dependencia de archivo compartido

```bash
# T002 (catalogos.ts) y T010 (taxonomia.ts) pueden redactarse en paralelo —
# archivos distintos, sin dependencia entre sí.
Task: "Crear backend/src/routes/catalogos.ts"
Task: "Crear backend/src/routes/taxonomia.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Setup (T001).
2. Completar US1 (T002-T004) — catálogos legibles, desbloquea los formularios más básicos de `005`.
3. **Parar y validar**: primer grupo de datos faltantes ya resuelto.

### Incremental Delivery

1. Setup.
2. US1 → US2 → US3 → US5 (los 4 P1, en el orden que listó `spec.md`) → validar cada uno.
3. US4 (P2, depende de T007 de US3) → validar.
4. Polish.

Al cierre de US1-US3-US5-US4, las 4 historias de `005-frontend-cliente`
que estaban bloqueadas por ausencia de datos de backend quedan
desbloqueadas (SC-007).
