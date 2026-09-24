---

description: "Task list — Frontend del Observatorio (005-frontend-cliente)"
---

# Tasks: Frontend del Observatorio — cliente que reemplaza la SPA actual

**Input**: Design documents from `/specs/005-frontend-cliente/`

**Prerequisites**: plan.md, spec.md (con Clarifications 2026-09-24), research.md, data-model.md, contracts/consumed-api.md, contracts/routes.md, quickstart.md

**Tests**: incluidos. El plan fija Vitest (esquemas de mapeo, esquema de taxonomía, guardas, completitud) y Playwright contra backend real como parte de la validación (quickstart.md, "Comandos de prueba"). No se hace TDD estricto salvo donde se indica; los tests de una historia van antes de su implementación cuando el contrato ya está fijado (mapeo, taxonomía, completitud).

**Organization**: tareas agrupadas por historia de usuario; cada fase es un incremento verificable por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede paralelizar (archivos distintos, sin dependencia de tareas incompletas)
- **[Story]**: historia de `spec.md` (US1–US9); Setup, Foundational y Polish no llevan etiqueta
- Rutas relativas a la raíz del repo; todo el código nuevo vive en `frontend/`. `backend/` y el `src/` de la SPA vieja **no se tocan**

## Reglas que aplican a todas las tareas

- **Rutas relativas `/api/...`** siempre; ninguna URL absoluta al backend, ninguna configuración de CORS (research Dec. 3).
- **Ninguna pantalla importa tipos "wire"**: solo tipos de dominio salidos de `frontend/src/api/` (D13). El id de usuario es `number` en el dominio.
- **La autorización real es del backend**: las guardas son UX; toda pantalla maneja `401`/`403`/`404` según `contracts/consumed-api.md`, "Códigos de estado".
- **No existen** las rutas `/pools`, `/registro`, `/signup` (decisiones 4 y 5).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: proyecto Vite + shadcn funcionando, con la receta de Vite (no la de Next.js)

- [X] T001 Crear el proyecto con `npm create vite@latest frontend -- --template react-ts` e instalar dependencias base en `frontend/`
- [X] T002 Instalar Tailwind v4 (`tailwindcss`, `@tailwindcss/vite`) y `@types/node`; reemplazar `frontend/src/index.css` por `@import "tailwindcss";`
- [X] T003 Configurar `frontend/vite.config.ts`: plugins `react()` + `tailwindcss()`, `resolve.alias` `@` → `./src`, y `server.proxy` `'/api'` → `http://localhost:3000` **sin `changeOrigin`** (con comentario que remita a research.md Dec. 3)
- [X] T004 Agregar el alias `@/*` → `./src/*` (con `baseUrl`) en **ambos** `frontend/tsconfig.json` y `frontend/tsconfig.app.json`
- [X] T005 Inicializar shadcn con `npx shadcn@latest init --template vite` (base `radix`) en `frontend/`; verificar `frontend/components.json` (`rsc: false`, `tailwind.config: ""`, `tailwind.css: "src/index.css"`) y `frontend/src/lib/utils.ts`
- [X] T006 Instalar dependencias de aplicación fijando versiones en `frontend/package.json`: `react-router`, `@tanstack/react-query`, `react-hook-form`, `zod`, `@hookform/resolvers`, `better-auth@1.7.5`, `jspdf`, `jspdf-autotable` (confirmar el nombre de import de React Router en su versión vigente)
- [X] T007 [P] Instalar y configurar pruebas: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` (`frontend/vitest.config.ts`) y `@playwright/test` (`frontend/playwright.config.ts`, `baseURL` `http://localhost:5173`)
- [X] T008 [P] Agregar scripts `lint`, `typecheck`, `test`, `test:e2e` en `frontend/package.json`, `frontend/.env.example` (solo `VITE_DATASTUDIO_URL`, sin secretos) y `frontend/.gitignore` que excluya `.env.local` (Principio XIII)
- [X] T009 Instalar con `npx shadcn@latest add` los componentes de research.md Dec. 2 (`button`, `input`, `label`, `field`, `select`, `checkbox`, `radio-group`, `textarea`, `dialog`, `alert-dialog`, `alert`, `table`, `badge`, `tabs`, `skeleton`, `spinner`, toast, `dropdown-menu`, `avatar`, `sidebar`, `breadcrumb`, `separator`, `sheet`, `collapsible`) en `frontend/src/components/ui/`; si un nombre no existe, usar el que resuelva el CLI y anotarlo en el commit

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: cliente HTTP, sesión, mapeo, guardas y esqueleto de rutas. **Ninguna historia puede empezar antes.**

**⚠️ CRITICAL**: el spike de cookies (T010) se hace primero; si falla, se corrige la configuración antes de seguir.

- [X] T010 **Spike de cookies (quickstart escenario 0)**: con backend en dev (`BETTER_AUTH_URL=http://localhost:5173`) y una página mínima en `frontend/src/main.tsx`, iniciar sesión por contraseña vía el proxy y confirmar cookie en `localhost:5173` y `GET /api/auth/session` → 200 sin `CORS` ni `403 INVALID_ORIGIN`; registrar el resultado (fecha, comandos, observado) en `docs/resultado-verificacion-frontend-cookies-<fecha>.md`
- [X] T011 Implementar `frontend/src/api/http.ts`: `fetch` con rutas relativas, manejo de `204` sin `.json()`, error tipado `ApiError {status, mensaje, cuerpo}` (`{error}` del backend) y `ContratoInesperado {recurso, campo}` para fallos de esquema
- [X] T012 [P] Implementar `frontend/src/api/ids.ts` con `usuarioIdDesdeWire(s: string): number` (exige `Number.isSafeInteger`, si no lanza `ContratoInesperado`) y su test en `frontend/tests/unit/api/ids.test.ts`
- [X] T013 [P] Implementar `frontend/src/api/sesion.ts`: esquema zod de `GET /api/auth/session` (`usuarioId` string → number, `rol`, `provinciaId`) y `obtenerSesion()` (401 → `null`); test en `frontend/tests/unit/api/sesion.test.ts`
- [X] T014 [P] Implementar `frontend/src/api/auth-client.ts`: `createAuthClient()` sin `baseURL` con `magicLinkClient()` (`better-auth/client`)
- [X] T015 [P] Implementar `frontend/src/api/catalogos.ts`: esquemas y funciones de `GET /api/provincias`, `/denominaciones-simplificadas`, `/tipos-oficina`, `/tipos-uf`, `/fueros` (`{id, nombre}`) y `/api/localidades` (`provincia_id`, `latitud`, `longitud` → camelCase); con hooks TanStack `staleTime: Infinity` en `frontend/src/api/catalogos.hooks.ts`
- [X] T016 Implementar `frontend/src/auth/useSesion.ts` (TanStack Query `['sesion']`, `retry: false` en 401) y el `QueryClientProvider` con manejo global de `401` (invalidar sesión y navegar a `/login?returnTo=`) en `frontend/src/main.tsx`
- [X] T017 Implementar `frontend/src/auth/guards.tsx`: `RequireAuth` (no renderiza contenido hasta resolver la sesión; FR-020) y `RequireAdmin` (no-admin → misma vista que la ruta inexistente; FR-016), con `returnTo` restringido a rutas internas relativas
- [X] T018 [P] Implementar las pantallas `frontend/src/routes/errores/NoAutorizado.tsx` (403, FR-021) y `frontend/src/routes/errores/NoEncontrado.tsx` (404)
- [X] T019 [P] Implementar un `AppLayout` mínimo (contenedor + `Outlet`) en `frontend/src/components/layout/AppLayout.tsx`; la jerarquía de menús completa es US5
- [X] T020 Definir el router en `frontend/src/App.tsx` con **todas** las rutas de `contracts/routes.md` como pantallas provisorias, guardas aplicadas, y **sin** `/pools`, `/registro` ni `/signup` (esas URL caen en `*`)
- [X] T021 [P] Test de guardas en `frontend/tests/unit/auth/guards.test.tsx`: sin sesión → `/login?returnTo=`; `returnTo` externo rechazado; no-admin en `/admin/*` ve la vista 404; nada protegido se renderiza antes de resolver la sesión

**Checkpoint**: sesión, HTTP, mapeo base y rutas listos — las historias pueden arrancar.

---

## Phase 3: User Story 1 - Iniciar sesión con cualquiera de los tres métodos (Priority: P1) 🎯 MVP

**Goal**: entrar por contraseña, Google o enlace por email; todo fallo por contraseña muestra el mismo mensaje genérico (FR-001, FR-002, FR-022, SC-001, SC-008).

**Independent Test**: completar un login por cada método (quickstart 1–3), provocar tres fallos distintos por contraseña y ver exactamente el mismo mensaje (quickstart 4), y comprobar que no hay pantalla de registro (quickstart 6).

### Tests for User Story 1

- [X] T022 [P] [US1] Test de componente en `frontend/tests/unit/routes/login.test.tsx`: cualquier error de `signIn.email` (incluido uno con `code` distinto) renderiza **el mismo** mensaje genérico; no aparece ningún enlace de registro
- [X] T023 [P] [US1] Test E2E en `frontend/tests/e2e/login.spec.ts`: escenarios 1 (login por contraseña), 5 (sin sesión → `/login?returnTo=`) y 6 (`/registro` y `/signup` dan 404)

### Implementation for User Story 1

- [X] T024 [US1] Implementar `frontend/src/routes/login/LoginPage.tsx`: contenedor con `tabs` (contraseña · enlace por email) y botón de Google; si ya hay sesión redirige a `/organismos`
- [X] T025 [US1] Implementar el formulario de contraseña en `frontend/src/routes/login/PasswordForm.tsx` (react-hook-form + zod) con `authClient.signIn.email({callbackURL: "/"})` y **un único mensaje genérico** ante cualquier error, más acceso visible a los otros dos métodos (decisión 2)
- [X] T026 [P] [US1] Implementar el formulario de enlace por email en `frontend/src/routes/login/MagicLinkForm.tsx` con `authClient.signIn.magicLink({callbackURL: "/", errorCallbackURL: "/login"})` y confirmación "revisá tu email"
- [X] T027 [P] [US1] Implementar el botón de Google en `frontend/src/routes/login/GoogleButton.tsx` con `authClient.signIn.social({provider: "google", callbackURL: "/"})` (callbackURL relativo)
- [X] T028 [US1] Implementar en `LoginPage.tsx` la lectura de `?error=`: `INVALID_TOKEN` → "enlace inválido o vencido"; cualquier otro código → mensaje genérico de "no se pudo iniciar sesión con este email" sin revelar si existe (preparado para el rechazo de D14/`007`)
- [X] T029 [US1] Post-login: invalidar `['sesion']` y navegar a `returnTo` (validado) o `/organismos` en `frontend/src/routes/login/LoginPage.tsx`
- [ ] T030 [US1] **PENDIENTE por falta de acceso real (2026-09-24): no hay credencial de Google de desarrollo. NO se da por hecha con un dummy** (igual que el spike de identidad de Google en `002`). Hecho con backend real: escenarios 3 (magic link) y 4 (mensaje único); de 2 (Google) solo se verificó hasta la redirección a `accounts.google.com` con el `redirect_uri` correcto. Falta el callback con una cuenta real. Detalle en `docs/resultado-verificacion-frontend-20260924.md`. Validar manualmente los escenarios 2 (Google, requiere credencial de desarrollo con redirect `http://localhost:5173/api/auth/callback/google`), 3 (magic link tomando el link del log del backend) y 4 (los tres fallos), y anotar el resultado en `docs/resultado-verificacion-frontend-<fecha>.md`

**Checkpoint**: US1 funcional y testeable por sí sola.

---

## Phase 4: User Story 2 - Lista de organismos y alta (Priority: P1)

**Goal**: ver los organismos propios/editados y dar de alta uno; provincia fija para `usuario_normal` y editable para admin; fuero solo lectura (FR-003, FR-004, FR-005, FR-021).

**Independent Test**: quickstart 7, 8, 9, 10 — alta con provincia bloqueada, alta bloqueada sin provincia en el perfil, edición de provincia por admin, acceso a un organismo ajeno → 403.

### Tests for User Story 2

- [ ] T031 [P] [US2] Test de esquemas en `frontend/tests/unit/api/organismos.test.ts` con respuestas wire reales: `propietario_id: "12"` → `propietarioId: 12`; snake → camel; campo faltante → `ContratoInesperado`
- [ ] T032 [P] [US2] Test de `relacionOrganismo` (propietario / editor / admin) en `frontend/tests/unit/features/relacion-organismo.test.ts`

### Implementation for User Story 2

- [ ] T033 [P] [US2] Implementar `frontend/src/api/organismos.ts`: esquemas y funciones de `GET /api/organismos`, `GET/PATCH /api/organismos/:id`, `POST /api/organismos` (incluye `confirmarPerdidaTaxonomia` y el `400` con `preguntasQueSePerderian`) y sus hooks TanStack con invalidación tras mutar
- [ ] T034 [P] [US2] Implementar `frontend/src/api/fuero.ts`: `GET /api/organismos/:orgId/fuero` → `{fueros, fueroSimplificado}` (vacío no es error)
- [ ] T035 [P] [US2] Implementar `relacionOrganismo(organismo, sesion)` en `frontend/src/features/organismos/relacion.ts`
- [ ] T036 [US2] Implementar `frontend/src/routes/organismos/OrganismosListPage.tsx`: tabla con denominación y relación (propio / editor / admin); estado vacío explícito
- [ ] T037 [US2] Implementar `frontend/src/routes/organismos/OrganismoNuevoPage.tsx`: `usuario_normal` → provincia fija con `sesion.provinciaId` (si es `null`, bloquear el envío y remitir al perfil, US2-5); admin → `select` editable; sin ningún campo de propietario; muestra el fuero como "sin fuero asignado", solo lectura
- [ ] T038 [US2] Implementar `frontend/src/routes/organismos/OrganismoDetallePage.tsx`: carga `GET /:id`, pestañas Datos · Unidades funcionales · Taxonomía · Editores (contenido de cada una lo entrega su historia), `403` → `NoAutorizado`, `404` → `NoEncontrado`
- [ ] T039 [US2] Implementar la pestaña Datos en `frontend/src/routes/organismos/DatosTab.tsx`: edición de denominación, denominación simplificada, tipo y **provincia solo para admin**; fuero solo lectura; diálogo de Protección B (`alert-dialog` listando `preguntasQueSePerderian`, reenvía con `confirmarPerdidaTaxonomia: true` solo tras confirmar)
- [ ] T040 [US2] Test E2E en `frontend/tests/e2e/organismos.spec.ts`: escenarios 7, 8, 9, 10 y 14

**Checkpoint**: US1 + US2 funcionan; ya hay un flujo completo de entrada y carga.

---

## Phase 5: User Story 3 - Formulario dinámico de taxonomía (Priority: P1)

**Goal**: formulario armado desde el catálogo aplicable al tipo del organismo, con el control correcto por tipo de respuesta, texto real de la pregunta y errores asociados a la pregunta (FR-006–FR-009, FR-023, SC-003).

**Independent Test**: quickstart 11, 12, 13 — los 4 tipos con control correcto y precarga, estado "sin taxonomía" para coordinación/unidad operativa, `400` asociado a su pregunta.

### Tests for User Story 3

- [ ] T041 [P] [US3] Test de `construirEsquema(catalogo)` en `frontend/tests/unit/features/taxonomia/esquema.test.ts`: única ≤ 1 opción del catálogo; múltiple 0..n (0 no es error); numérica finita; texto vacío = no responder
- [ ] T042 [P] [US3] Test de `mezclar` y `armarPut` en `frontend/tests/unit/features/taxonomia/mezclar.test.ts`: catálogo ⊕ respuestas precargadas por `codigo`; el `PUT` incluye **todas** las respuestas no vacías (omitir borra) y omite las múltiples sin selección

### Implementation for User Story 3

- [ ] T043 [P] [US3] Implementar `frontend/src/api/taxonomia.ts`: catálogo `GET /api/taxonomia/preguntas[?tipoOficinaId=]` (`opciones` = todas las posibles), respuestas `GET /api/organismos/:orgId/taxonomia` (`opciones` = solo las seleccionadas) y `PUT` con `{respuestas:[{preguntaCodigo, opcionesCodigos?, valorNumero?, valorTexto?}]}`; `400` → `ApiError` con el mensaje
- [ ] T044 [P] [US3] Implementar `frontend/src/features/taxonomia/esquema.ts` (`construirEsquema`, zod en runtime desde el catálogo)
- [ ] T045 [P] [US3] Implementar `frontend/src/features/taxonomia/mezclar.ts` (`mezclar`, `armarPut`, tipo `RespuestaForm` de data-model.md)
- [ ] T046 [P] [US3] Implementar los controles por tipo en `frontend/src/features/taxonomia/controles/` (`OpcionUnica.tsx` con `radio-group`, `OpcionMultiple.tsx` con `checkbox`, `Numerica.tsx`, `TextoLibre.tsx`) mostrando siempre `texto`, nunca `codigo`
- [ ] T047 [US3] Implementar `frontend/src/features/taxonomia/TaxonomiaForm.tsx` y la pestaña/ruta `frontend/src/routes/organismos/TaxonomiaTab.tsx`: pide catálogo por `tipoOficinaId` del organismo y respuestas; catálogo `[]` → estado "este tipo de organismo no tiene taxonomía" **sin** pedir `…/taxonomia` (FR-023); guardar envía el conjunto completo
- [ ] T048 [US3] Asociar el `400` del `PUT` a una pregunta en `frontend/src/features/taxonomia/errores.ts`: resaltar la pregunta cuyo `codigo` o `texto` aparece en el mensaje y mostrar siempre el mensaje completo junto al formulario (FR-009); validar contra los mensajes reales de `backend/migrations/0001..0003` y ajustar la heurística
- [ ] T049 [US3] Test E2E en `frontend/tests/e2e/taxonomia.spec.ts`: escenarios 11 (incluye que guardar y recargar conserva todas las respuestas), 12 y 13

**Checkpoint**: las tres historias P1 completas — MVP funcional.

---

## Phase 6: User Story 4 - Unidades funcionales y asignación de jueces (Priority: P2)

**Goal**: CRUD de UF y diálogo de asignación de jueces que también gestiona pools; los pools **no** tienen otra pantalla (FR-010, FR-011, FR-012, FR-024, SC-009).

**Independent Test**: quickstart 15, 16, 17 — alta de UF, asignación a dos pools (uno parcial), duplicado rechazado, alta/edición/borrado de pools sin salir del diálogo, y mensaje claro al borrar un pool en uso.

### Tests for User Story 4

- [ ] T050 [P] [US4] Test de esquemas en `frontend/tests/unit/api/unidades-asignaciones-pools.test.ts` (snake vs camel de cada recurso; `total_jueces` → `totalJueces`)
- [ ] T051 [P] [US4] Test de los atajos de carga en `frontend/tests/unit/features/asignaciones/atajos.test.ts`: pool completo = `cantidadAsignada == totalJueces`, subconjunto = menor; `cantidad > totalJueces` advierte pero no bloquea; no se persiste ningún "modo"

### Implementation for User Story 4

- [ ] T052 [P] [US4] Implementar `frontend/src/api/unidades.ts`: `GET/POST` de `/api/organismos/:orgId/unidades-funcionales` y `GET/PATCH/DELETE` de `/:ufId` (`denominacion_unidad` → `denominacionUnidad`, etc.)
- [ ] T053 [P] [US4] Implementar `frontend/src/api/asignaciones.ts`: `GET/POST/PATCH/DELETE` de `…/asignaciones-jueces` (cambiar de pool = borrar + crear) y mapeo de los `400` documentados a mensajes
- [ ] T054 [P] [US4] Implementar `frontend/src/api/pools.ts`: `GET /api/pools-jueces` (snake → camel), `POST`, `PATCH`, `DELETE`; un `500` en `DELETE` se convierte en un error tipado `PoolEnUsoOError` (brecha G6)
- [ ] T055 [US4] Implementar la pestaña `frontend/src/routes/organismos/UnidadesTab.tsx`: lista de UF, alta, edición y borrado con confirmación
- [ ] T056 [US4] Implementar `frontend/src/routes/organismos/UnidadFormPage.tsx`: `localidadId` filtrada por la provincia del organismo, `tipoUfId`, `anioImplementacion` opcional, `mail` con formato; en edición no se ofrece vaciar un opcional ya cargado (el `PATCH` usa `COALESCE`)
- [ ] T057 [US4] Implementar `frontend/src/features/asignaciones/atajos.ts` (grupo exclusivo, pool completo, subconjunto como ayuda de carga)
- [ ] T058 [US4] Implementar `frontend/src/features/asignaciones/AsignacionesDialog.tsx`: lista de asignaciones de la UF con pool, cantidad, edición de cantidad y borrado; alta con selector de pool; muestra un `grupoJuecesId` que no está en la lista como "pool #N, fuera de tu provincia"
- [ ] T059 [US4] Implementar `frontend/src/features/asignaciones/PoolsPanel.tsx` dentro del diálogo: crear pool (provincia del organismo si es admin, la propia si no), editar `descripcion`/`totalJueces`, eliminar con confirmación y mensaje "no se pudo eliminar, el pool puede estar asignado a otras unidades funcionales" ante `PoolEnUsoOError`; si el usuario no puede gestionar pools de esa provincia, lo explica en lugar de fallar
- [ ] T060 [US4] Test E2E en `frontend/tests/e2e/unidades-asignaciones.spec.ts`: escenarios 15 y 16 con el backend real, y 17 con un mock de red del `500` (el borrado real de un pool en uso queda documentado, no forzado)

**Checkpoint**: US4 completa; los pools solo existen dentro del diálogo.

---

## Phase 7: User Story 5 - Jerarquía de menús (Priority: P2)

**Goal**: navegación agrupada por uso, menú de usuario con perfil/ajustes/salir, acceso a tableros externos, sin sección de pools (FR-013, FR-015, SC-005).

**Independent Test**: quickstart 18 y 24 — desde cualquier pantalla se llega a perfil, ajustes y tableros en ≤ 3 clics; ningún ítem ni ruta de pools.

### Tests for User Story 5

- [ ] T061 [P] [US5] Test en `frontend/tests/unit/components/menu.test.tsx`: la definición del menú no contiene ítem de pools ni de registro para ningún rol; la sección Administración solo existe para `admin`; "Tableros" no se renderiza si falta `VITE_DATASTUDIO_URL`

### Implementation for User Story 5

- [ ] T062 [US5] Implementar la jerarquía de `frontend/src/components/layout/AppSidebar.tsx` según research.md Dec. 7: Mis organismos · Tableros ↗ · Administración (solo admin: Gestión de organismos, Usuarios)
- [ ] T063 [P] [US5] Implementar el menú de usuario en `frontend/src/components/layout/UserMenu.tsx` (`dropdown-menu` + `avatar`): Perfil, Ajustes, Cerrar sesión (`authClient.signOut()` + invalidar sesión)
- [ ] T064 [P] [US5] Implementar el ítem Tableros en `frontend/src/components/layout/TablerosLink.tsx`: abre `VITE_DATASTUDIO_URL` con `target="_blank" rel="noopener noreferrer"`; sin la variable, no se muestra (FR-015)
- [ ] T065 [P] [US5] Implementar `frontend/src/routes/ajustes/AjustesPage.tsx` como punto de entrada mínimo (Assumptions de la spec)
- [ ] T066 [US5] Integrar sidebar, `breadcrumb` y `sheet` móvil en `frontend/src/components/layout/AppLayout.tsx`
- [ ] T067 [US5] Test E2E en `frontend/tests/e2e/navegacion.spec.ts`: escenarios 18 y 24

**Checkpoint**: la navegación completa reemplaza al layout provisorio.

---

## Phase 8: User Story 6 - Perfil y métodos de acceso (Priority: P2)

**Goal**: editar datos propios, ver métodos vinculados y cambiar contraseña solo si ya existe una (FR-014).

**Independent Test**: quickstart 23 — cambio de nombre/provincia reflejado; cambio de contraseña con credencial; sin credencial no aparece el formulario de contraseña.

### Tests for User Story 6

- [ ] T068 [P] [US6] Test de esquemas en `frontend/tests/unit/api/usuarios.test.ts`: `id` string → number, `roles: null` → `[]`, snake → camel

### Implementation for User Story 6

- [ ] T069 [P] [US6] Implementar `frontend/src/api/usuarios.ts`: `GET /api/usuarios`, `GET /api/usuarios/:id`, `PATCH /api/usuarios/:id` (`{nombreDisplay?, provinciaId?, fotoUrl?}`; no acepta rol)
- [ ] T070 [US6] Implementar `frontend/src/routes/perfil/PerfilPage.tsx` con el formulario de datos propios (nombre, provincia del catálogo, foto opcional)
- [ ] T071 [P] [US6] Implementar `frontend/src/routes/perfil/MetodosAcceso.tsx` con `authClient.listAccounts()` (`credential`, `google`, …)
- [ ] T072 [US6] Implementar `frontend/src/routes/perfil/CambiarPassword.tsx`: solo si `listAccounts()` incluye `credential` (contraseña actual + nueva + confirmación, `authClient.changePassword`); si no, aviso de que ese método no está activo y que fijarlo está diferido a `007`; **sin** flujo de "fijar contraseña"
- [ ] T073 [US6] Test E2E en `frontend/tests/e2e/perfil.spec.ts`: escenario 23

**Checkpoint**: perfil funcional.

---

## Phase 9: User Story 7 - (admin) Completitud y exportación (Priority: P3)

**Goal**: vista de completitud por organismo con exportación a PDF; un organismo cuyo tipo no tiene preguntas cuenta la taxonomía como completa (FR-017, SC-006).

**Independent Test**: quickstart 20 — completos vs. incompletos distinguibles, tipo sin taxonomía completo, progreso visible, PDF equivalente.

### Tests for User Story 7

- [ ] T074 [P] [US7] Test de `calcularCompletitud` en `frontend/tests/unit/features/completitud/calcular.test.ts`: datos básicos, ≥ 1 UF, y taxonomía completa si catálogo del tipo `[]` **o** ≥ 1 respuesta; catálogo vacío no pide respuestas
- [ ] T075 [P] [US7] Test de la cola en `frontend/tests/unit/features/completitud/cola.test.ts`: concurrencia máxima 6, orden estable de resultados, un error de un organismo no aborta el resto

### Implementation for User Story 7

- [ ] T076 [P] [US7] Implementar `frontend/src/features/completitud/calcular.ts` (criterios de data-model.md) con caché del catálogo por `tipoOficinaId`
- [ ] T077 [P] [US7] Implementar `frontend/src/features/completitud/cola.ts` (fan-out con concurrencia 6 y reporte de progreso)
- [ ] T078 [US7] Implementar `frontend/src/routes/admin/AdminOrganismosPage.tsx`: tabla por organismo con las tres partes (completo/incompleto), barra de progreso durante el fan-out y filtro por estado
- [ ] T079 [US7] Implementar `frontend/src/features/completitud/exportarPdf.ts` con `jspdf` + `jspdf-autotable`: mismo contenido que la tabla en pantalla; botón "Exportar PDF" en `AdminOrganismosPage.tsx`
- [ ] T080 [US7] Test E2E en `frontend/tests/e2e/admin-organismos.spec.ts`: escenario 20, incluido el organismo de tipo sin taxonomía

**Checkpoint**: US7 completa.

---

## Phase 10: User Story 8 - (admin/propietario) Asignar editores (Priority: P3)

**Goal**: agregar y quitar editores de un organismo; un editor no puede gestionarlos (FR-018).

**Independent Test**: quickstart 19 — el agregado ve el organismo en su lista; el quitado lo pierde; un editor recibe 403 al intentar agregar.

### Implementation for User Story 8

- [ ] T081 [P] [US8] Implementar `frontend/src/api/editores.ts`: `GET/POST/DELETE` de `/api/organismos/:orgId/editores` (`usuarioId` wire string → number; `POST` con `{usuarioId: number}`; mensajes de los `400` documentados) y test de esquema en `frontend/tests/unit/api/editores.test.ts`
- [ ] T082 [US8] Implementar `frontend/src/routes/organismos/EditoresTab.tsx`: lista de editores visible para quien tiene acceso; agregar/quitar solo para propietario o admin (controles ocultos a un editor, con `403` del backend como respaldo mostrado con claridad); candidatos desde `GET /api/usuarios` excluyendo propietario y editores actuales
- [ ] T083 [US8] Test E2E en `frontend/tests/e2e/editores.spec.ts`: escenario 19

**Checkpoint**: US8 completa.

---

## Phase 11: User Story 9 - (admin) Consultar usuarios, solo lectura (Priority: P3)

**Goal**: listar usuarios con email, roles y provincia; el cambio de rol está deshabilitado con explicación (FR-019).

**Independent Test**: quickstart 21 y 22 — un admin ve la lista y el control deshabilitado sin peticiones de cambio; un no-admin ve la misma vista que ante una ruta inexistente.

### Implementation for User Story 9

- [ ] T084 [US9] Implementar `frontend/src/routes/admin/AdminUsuariosPage.tsx`: tabla con email, roles y provincia (nombre desde el catálogo), buscador por email; columna de rol con control **deshabilitado** y texto que explique que el cambio de rol todavía no está disponible; ninguna acción dispara una petición de cambio
- [ ] T085 [US9] Test E2E en `frontend/tests/e2e/admin-usuarios.spec.ts`: escenarios 21 y 22

**Checkpoint**: las 9 historias completas.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: cierre transversal

- [ ] T086 [P] Suite de mapeo D13 en `frontend/tests/unit/api/contrato.test.ts` con respuestas wire reales grabadas de cada endpoint en `frontend/tests/unit/api/fixtures/` (escenario 26): camelCase uniforme, ids de usuario `string → number`, campo faltante o id no entero seguro → `ContratoInesperado`
- [ ] T087 [P] Flujo de sesión vencida a mitad de formulario en `frontend/src/auth/sesionVencida.tsx`: aviso, re-login por contraseña sin recargar y sin perder lo tipeado (escenario 25, Edge Case de la spec); test E2E con mock de red en `frontend/tests/e2e/sesion-vencida.spec.ts`
- [ ] T088 [P] Revisión de accesibilidad y responsive (foco, `aria-invalid`, sidebar → `sheet` en móvil) sobre login, formularios y diálogos, en `frontend/src/`
- [ ] T089 [P] Escribir `frontend/README.md`: cómo correr (proxy `/api`, `BETTER_AUTH_URL=http://localhost:5173` en el backend, redirect de Google, `.env.example`), estructura y convenciones de mapeo (D13)
- [ ] T090 Correr `npm run lint && npm run typecheck && npm test` y `npx playwright test` en `frontend/` y dejar todo en verde
- [ ] T091 Ejecutar la validación completa de `specs/005-frontend-cliente/quickstart.md` (escenarios 0–26) y registrar el resultado, con lo que quedó "a validar" (Google, mensajes de triggers, nombres shadcn), en `docs/resultado-verificacion-frontend-<fecha>.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup y **bloquea** todas las historias. T010 (spike de cookies) va primero dentro de la fase.
- **Historias (Phase 3–11)**: todas dependen de Foundational.
- **Polish (Phase 12)**: depende de las historias deseadas.

### User Story Dependencies

- **US1 (P1)**: solo Foundational.
- **US2 (P1)**: Foundational; para probar de punta a punta usa la sesión de US1 (se puede iniciar sesión por API/cookie en E2E si US1 no está lista).
- **US3 (P1)**: Foundational + el detalle de organismo de US2 (T038, para ubicar la pestaña) y `api/organismos.ts` (T033) para leer `tipoOficinaId`.
- **US4 (P2)**: Foundational + T033/T038 (organismo y su detalle) y catálogos (T015).
- **US5 (P2)**: Foundational; reemplaza el layout provisorio (T019), no bloquea a otras historias.
- **US6 (P2)**: Foundational + `api/usuarios.ts` (T069, que también usan US8 y US9).
- **US7 (P3)**: US2 (organismos), US4 (`api/unidades.ts`, T052), US3 (`api/taxonomia.ts`, T043).
- **US8 (P3)**: US2 (detalle) y `api/usuarios.ts` (T069).
- **US9 (P3)**: `api/usuarios.ts` (T069) y catálogo de provincias (T015).

### Within Each Story

- Esquemas/`api/` antes de pantallas; tests de mapeo, taxonomía y completitud antes de implementar la lógica correspondiente.
- Cada historia termina con su E2E y su checkpoint.

### Parallel Opportunities

- Setup: T007, T008 en paralelo.
- Foundational: T012, T013, T014, T015 en paralelo (archivos distintos), luego T018, T019, T021.
- US1: T022/T023 juntas; T026/T027 juntas.
- US2: T031/T032 juntas; T033/T034/T035 juntas.
- US3: T041/T042; T043–T046 (cuatro archivos distintos).
- US4: T050/T051; T052/T053/T054.
- US5: T063/T064/T065.
- Con dos o más personas, tras Foundational: una toma US1→US2→US3 (P1) y otra puede adelantar US5 y `api/usuarios.ts` (T069).

## Parallel Example: User Story 3

```bash
# Tests primero (archivos distintos):
Task: "Test de construirEsquema en frontend/tests/unit/features/taxonomia/esquema.test.ts"
Task: "Test de mezclar/armarPut en frontend/tests/unit/features/taxonomia/mezclar.test.ts"

# Luego, en paralelo:
Task: "api/taxonomia.ts"
Task: "features/taxonomia/esquema.ts"
Task: "features/taxonomia/mezclar.ts"
Task: "features/taxonomia/controles/*"
```

## Implementation Strategy

### MVP First (US1 + US2 + US3, todo P1)

1. Setup → Foundational (con el spike de cookies primero).
2. US1 → validar login por los tres métodos y el mensaje genérico.
3. US2 → validar lista, alta y provincia.
4. US3 → validar taxonomía dinámica.
5. **Parar y validar**: quickstart 0–14. Ya hay un flujo usable de punta a punta (entrar, cargar un organismo, completar su taxonomía).

### Incremental Delivery

1. + US4 (UF y asignaciones/pools) → 2. + US5 (menús) → 3. + US6 (perfil) → 4. + US7/US8/US9 (admin).
2. Cada historia se valida con su tramo del quickstart sin romper las anteriores.

### Fuera de esta feature (no generar tareas)

Cambio de rol, fijar contraseña, alta de usuarios por admin, cierre de altas no provisionadas (D14) y corrección del borrado de pools en uso: son de `007`. Envío real de magic link y topología de despliegue (D5): dependencias externas.

## Notes

- [P] = archivos distintos, sin dependencias incompletas.
- La etiqueta [USn] traza cada tarea a `spec.md`.
- Commit por tarea o grupo lógico; no mezclar cambios de `frontend/` con `backend/`.
- Si una tarea descubre que la forma real de una respuesta difiere de `contracts/consumed-api.md`, se corrige ese archivo en el mismo commit (el código manda).
