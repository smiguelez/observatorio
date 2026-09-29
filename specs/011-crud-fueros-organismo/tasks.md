---

description: "Task list for 011-crud-fueros-organismo"
---

# Tasks: Editar los fueros de un organismo

**Input**: Design documents from `/specs/011-crud-fueros-organismo/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: incluidos — mismo criterio que el resto del proyecto (contrato
antes de dar un endpoint por cerrado; unit de frontend para el control
nuevo; E2E para no romper lo que ya cubre la pantalla).

**Sin Foundational propio**: todo lo que esta feature necesita ya existe
(`autorizarContraOrganismoPadre`, `conTransaccion`, `ErrorNegocio`,
`useFueros()`, `useFuero()`) — no hay un módulo compartido nuevo que
construir antes de las historias, a diferencia de otras features.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias)
- **[Story]**: a qué historia de usuario pertenece (US1, US2)

---

## Phase 1: Setup

- [x] T001 Confirmar línea base: `cd backend && npm test` y `npx tsc -b`; `cd frontend && npx vitest run` y `npx tsc -b` — todo limpio antes de tocar código de esta feature.

**Checkpoint**: línea base confirmada.

---

## Phase 2: User Story 1 - Editar el listado de fueros de un organismo (Priority: P1) 🎯 MVP

**Goal**: quien gestiona un organismo puede ver y editar su listado real
de fueros (no solo el resumen calculado), y el resumen se recalcula al
guardar.

**Independent Test**: en el detalle de un organismo propio, marcar uno o
más fueros del catálogo real, guardar, y confirmar que el resumen
mostrado cambia según lo elegido (spec.md, Acceptance Scenarios 1-3).

### Tests for User Story 1 ⚠️

- [x] T002 [P] [US1] `backend/tests/contract/organismo-fuero.test.ts`: extender con el `PUT` nuevo — un fuero (`fueroSimplificado` = ese nombre, `estado_fueros` pasa a `cargado`), más de uno (`fueroSimplificado` = `"multifuero"`), lista vacía (sin fuero asignado, `estado_fueros` pasa a `sin_fueros_asignados`), un `fueroId` inexistente (`400`, nada se escribe), sin sesión (`401`)/sin ser dueño-editor-admin (`403`)/organismo inexistente (`404`) — mismo criterio que ya cubre el `GET` de este archivo.
- [x] T003 [P] [US1] `frontend/tests/unit/routes/datos-tab.test.tsx` (nuevo): `DatosTab` muestra los fueros actuales como casillas marcadas (a partir de `useFueros()`/`useFuero()`, con `fetch` mockeado); marcar/desmarcar y guardar llama al `PUT` con el listado correcto; tras un guardado exitoso se ve el resumen recalculado que devuelve la respuesta.

### Implementation for User Story 1

- [x] T004 [US1] `backend/src/routes/organismos.ts`: agregar `PUT /api/organismos/:orgId/fuero` (body `{ fueroIds: number[] }`, `Type.Array(Type.Integer())`) — autorización con `autorizarContraOrganismoPadre` (research.md, Decisión 1); validar que cada `fueroId` exista en `fueros` (`400` si no, sin escribir nada); dentro de `conTransaccion`: reemplazar `organismo_fueros` (DELETE + INSERT) y actualizar `estado_fueros` (`'sin_fueros_asignados'` si `fueroIds` queda vacío, `'cargado'` en cualquier otro caso — nunca `'multifuero_sin_detalle'`, research.md Decisión 2); responder con la misma forma que el `GET` de esta subruta.
- [x] T005 [P] [US1] `frontend/src/api/fuero.ts`: agregar `actualizarFuero(orgId, fueroIds)` (`PUT`) y `useActualizarFuero(orgId)` (invalida `['organismos', orgId, 'fuero']` al tener éxito).
- [x] T006 [US1] `frontend/src/routes/organismos/DatosTab.tsx`: reemplazar el párrafo de solo lectura (`data-testid="fuero-solo-lectura"`) por una lista de casillas sobre `useFueros()` (catálogo real), precargada desde `useFuero(orgId)`; guardar llama a `useActualizarFuero` (T005) y muestra el `fueroSimplificado` que devuelve la respuesta — mismo patrón de mensaje de éxito/error que ya usa el resto de la pestaña (`data-testid="mensaje-datos"`).
- [x] T007 [US1] `frontend/tests/e2e/organismos.spec.ts`: actualizar el test 7 ("fuero solo lectura") — el `data-testid="fuero-solo-lectura"` desaparece; adaptar la aserción al control nuevo (o mover esa verificación puntual a un test de fuero dedicado si el existente deja de tener sentido tal cual).

**Checkpoint**: US1 completa y probada — un organismo puede pasar de "sin
fueros" a un fuero único, a multifuero, y de vuelta a vacío, con el
resumen reflejándolo en cada paso.

---

## Phase 3: User Story 2 - No permitir que un fuero en uso desaparezca en silencio (Priority: P2)

**Goal**: quitar del listado un fuero que una unidad funcional ya usa en
una asignación de jueces acotada específicamente a él se rechaza, en vez
de aplicarse y dejar una inconsistencia.

**Independent Test**: con una unidad funcional que tiene una asignación
de jueces acotada a un fuero del organismo, intentar guardar un listado
sin ese fuero y confirmar el rechazo (spec.md, Acceptance Scenarios de la
Historia 2).

### Tests for User Story 2 ⚠️

- [x] T008 [US2] Mismo archivo que T002: crear una unidad funcional con una asignación de jueces (`unidad_funcional_grupo_jueces` + `asignacion_fueros`) acotada a un fuero del organismo; `PUT` sin ese fuero → `400` con `fuerosEnUso` incluyendo ese fuero, y el listado/`estado_fueros` sin cambios (verificado contra la base); quitar/ampliar la asignación primero y reintentar el mismo `PUT` → `200`, se aplica.

### Implementation for User Story 2

- [x] T009 [US2] Mismo archivo que T004: antes de la transacción de T004, calcular qué fueros del listado actual desaparecerían con el `fueroIds` nuevo, y si alguno tiene una fila en `asignacion_fueros` para una unidad funcional de este organismo, `throw new ErrorNegocio(400, ...)` con el mensaje y `fuerosEnUso` (contracts/api.md) — ninguna escritura ocurre en ese caso.

**Checkpoint**: US1 y US2 completas — la pantalla nueva funciona y no
puede romper una asignación de jueces existente.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [x] T010 [P] `backend/scripts/detectar-fueros-sin-poblar.ts` (research.md, Decisión 3): script de una sola vez, mismo patrón que `normalizar-denominaciones.ts` (dry-run por defecto) — busca organismos `estado_fueros = 'cargado'` con 0 filas en `organismo_fueros` y los lista (no rellena nada: no hay de dónde copiar el valor). Correrlo y confirmar que reporta 0 casos (verificado en research.md al planificar; confirmar que sigue en 0 al implementar).
- [x] T011 Correr toda la suite backend (`npm test`) y frontend (`npx vitest run`, `npx tsc -b`) — confirmar 0 regresiones sobre la línea base de T001.
- [x] T012 Correr la suite E2E de Playwright relevante (`organismos.spec.ts` como mínimo; revisar si `evidencia-visual.spec.ts` u otro toca el detalle de organismo) contra una instancia propia si hace falta (mismo criterio que `010`, T020) — confirmar que el resto de `DatosTab` (denominación, tipo, provincia) sigue funcionando igual.
- [x] T013 Recorrer `quickstart.md` completo (los 9 escenarios).
- [x] T014 Actualizar `docs/plan-camino-a-produccion.md`, Fase B: marcar el ítem de "CRUD de `organismo_fueros`" como resuelto por `011`, mismo formato ya usado para cerrar otros ítems de esa fase.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → sin dependencias.
- **US1 (Phase 2)** → depende solo de Setup. Es el MVP: sin ella no hay nada que proteger en US2.
- **US2 (Phase 3)** → depende de que el endpoint de US1 (T004) exista, porque agrega un chequeo DENTRO de esa misma ruta (T009 modifica el mismo código que T004, no es un archivo aparte) — no es independiente en el sentido de "otro archivo", pero sí en el sentido de "otra prueba de aceptación verificable por separado".
- **Polish (Phase 4)** → depende de que ambas historias estén implementadas.

## Parallel Example: User Story 1

```bash
# En paralelo, ninguna depende de la otra:
Task: "T002 — contract test del PUT nuevo"
Task: "T003 — unit test de DatosTab"
Task: "T005 — frontend/src/api/fuero.ts"
# T004 (el endpoint) y T006 (la pantalla) sí son secuenciales entre sí
# respecto de T005 (T006 necesita T005 ya escrito para llamar al hook).
```

## Implementation Strategy

**MVP = US1 sola.** Ya resuelve el hueco entero de traducción pendiente
(ver la línea que motivó esta feature en `docs/plan-camino-a-produccion.md`).
US2 es un endurecimiento de integridad sobre el mismo endpoint — importante
antes de dar la feature por cerrada (Principio VIII), pero US1 sin US2 ya
es útil y demostrable por sí sola.

1. Setup (T001).
2. US1 (T002-T007) → **MVP funcional**.
3. US2 (T008-T009).
4. Polish (T010-T014).
