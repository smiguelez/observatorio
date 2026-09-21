---

description: "Task list for 002-backend-api-carga-datos"
---

# Tasks: Backend/API — autorización y carga de datos

**Input**: Design documents from `/specs/002-backend-api-carga-datos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: no se pidió TDD explícitamente, pero `contracts/api.md` define una
**"matriz de pruebas de contrato obligatorias"** derivada de las Success
Criteria de `spec.md` — esas pruebas son entregables requeridos por el
contrato, no opcionales, y están incluidas abajo por historia.

**Organización**: por historia de usuario (`spec.md`, US1–US5). El spike de
identidad (Principio V, gate crítico de `plan.md`) es la primera tarea de
Foundational y bloquea todo lo demás — ninguna tarea de autenticación
avanza sin su resultado GO/NO-GO.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1–US5 (mapea a las historias de `spec.md`)
- Rutas según `plan.md` (Project Structure): todo el código nuevo vive en `backend/`, paralelo a `db/` y `migration/`, sin tocar `src/` ni `001-modelo-datos-relacional`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: estructura del proyecto backend y toolchain.

- [X] T001 Crear la estructura de directorios de `backend/` por `plan.md`: `src/{auth,db,authz,routes,config}/`, `tests/{contract,integration,unit}/`
- [X] T002 Inicializar el proyecto Node.js 20 + TypeScript en `backend/package.json` con dependencias `fastify`, `@fastify/type-provider-typebox`, `@fastify/cookie`, `pg`, `better-auth` — `@fastify/cookie` fijado a `11.0.2` exacto (no `^`): la `11.1.2` que instala por default arrastra `cookie@2.0.1`, que exige Node ≥22 y rompe el compromiso de Node 20 LTS
- [X] T003 [P] Configurar `backend/tsconfig.json` (target ES2022+, module ESM, strict)
- [X] T004 [P] Configurar lint (`backend/eslint.config.js`, con `typescript-eslint` agregado — el `eslint.config.js` plano de `migration/` no alcanza para parsear sintaxis TS) y Vitest (`backend/vitest.config.ts`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: identidad, conexión a datos y primitivas de autorización de las
que dependen las 5 historias. **Ninguna historia puede empezar hasta cerrar
el spike T007.**

**⚠️ CRITICAL**: T007 es el gate del Principio V (`plan.md`, Constitution
Check post-Fase 1). Su resultado (GO/NO-GO) determina si T009 en adelante
usa el diseño de `research.md` Decisión 3 tal cual, o el plan B documentado
ahí (tabla puente).

- [X] T005 Cargar configuración desde variables de entorno (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, config de envío de email) en `backend/src/config/env.ts` — sin rutas hardcodeadas (Principio XIII), mismo patrón que `migration/config/env.js` (config de envío de email queda pendiente para US1, no bloqueaba el spike)
- [X] T006 Crear el pool de conexión `pg` desde `DATABASE_URL` en `backend/src/db/pool.ts`, mismo patrón que `migration/src/load/pg-client.js`
- [X] T007 **SPIKE (bloqueante, Principio V) — RESULTADO: GO**, validado contra la base real (2026-09-19) y re-validado tras migrar `auth.*` por la vía oficial. `databaseHooks.user.create.before` + `forceAllowId: true` (interno de `createWithHooks`) permiten fijar `auth."user".id = String(usuarios.id)` sin duplicar identidad. Evidencia completa (log del hook, filas reales `auth."user"`/`usuarios` con id coincidente en dos corridas, limpieza verificada) en `research.md` Decisión 3. Script en `backend/scripts/spike-identity.ts`. Estrategia de migraciones resuelta en la misma decisión: `@better-auth/cli` está deprecado y además falló acá por falta de `make` en el entorno (no por incompatibilidad de adaptador — confirmado que usamos Kysely); la vía correcta es `getMigrations`/`runMigrations` de `better-auth/db/migration` (sin dependencias nativas), probada en `backend/scripts/investigar-migracion-oficial.ts`. `create-auth-schema.sql` queda marcado como superado (DDL manual, con índices faltantes) — no usar
- [X] T008 **[Contingencia — NO ejecutada]**: T007 dio GO, así que la tabla puente `identidad_externa` no era necesaria. Queda documentada como plan B descartado en `research.md`, sin implementar
- [X] T009 Configurar la instancia base de Better Auth (`database.schemaName: 'auth'`, hook de identidad de T007) en `backend/src/auth/index.ts` — sin plugins de proveedor todavía (eso es US1). Verificado con curl real: `sign-up/email` da `400 EMAIL_PASSWORD_SIGN_UP_DISABLED` — confirma que ningún proveedor quedó habilitado antes de tiempo
- [X] T010 Implementar la resolución de identidad por request (cookie de sesión → `auth.session` (vía `auth.api.getSession`) → `auth.user.id` → `usuarios.id` → `IdentidadResuelta {usuarioId, rol, provinciaId}`, releída en cada request — FR-002) en `backend/src/auth/resolve-identity.ts`. Nota: `IdentidadResuelta.provincia` se concretó como `provinciaId: number | null` (FK numérica), no el `string` conceptual de `data-model.md` — es lo comparable 1:1 contra `grupos_jueces.provincia_id`/`usuarios.provincia_id` sin un join de nombres
- [X] T011 [P] Implementar las primitivas de autorización `esAdmin()`, `esOwnerOEditor()`, `mismaProvincia()` como funciones puras sobre `IdentidadResuelta` + datos del recurso, en `backend/src/authz/rules.ts` — traducción 1:1 de `docs/firestore-rules-actuales.rules` (no anidan `esAdmin` dentro de `esOwnerOEditor`, igual que la regla real combina ambas con OR en el llamador)
- [X] T012 [P] Tests unitarios de `backend/src/authz/rules.ts` (sin HTTP ni DB) en `backend/tests/unit/rules.test.ts` — 9/9 tests verdes
- [X] T013 Armar el esqueleto de la app Fastify (`backend/src/app.ts`): registra config, pool, Better Auth (puente Fetch API `auth.handler` montado en `/api/auth/*`), `@fastify/type-provider-typebox`, y un hook global que devuelve `401` para cualquier ruta sin sesión válida salvo `/api/auth/*` (FR-004). Verificado con servidor real corriendo: `/api/organismos` sin sesión → `401`; ruta de dominio inexistente → también `401` (el hook corre antes que el 404); `/api/auth/get-session` sin sesión → `200` con `null` (lo maneja Better Auth, no el hook)

**Checkpoint**: identidad resuelta + primitivas de autorización + app base listas → las historias pueden comenzar.

---

## Phase 3: User Story 1 - Identidad única sin importar el método de login (Priority: P1) 🎯 MVP

**Goal**: un referente inicia sesión por cualquiera de los 3 métodos y siempre resuelve al mismo `usuarios.id` (spec.md).

**Independent Test**: crear identidad por un método, vincular un segundo método al mismo email verificado, iniciar sesión por el segundo método — debe resolver al mismo `usuarios.id` (quickstart.md Paso 3).

- [X] T014 [P] [US1] Configurar el proveedor de credenciales locales de Better Auth (email + contraseña, hashing scrypt por default — research.md Decisión 2) en `backend/src/auth/providers/password.ts`
- [X] T015 [P] [US1] Configurar el proveedor Google OAuth de Better Auth (`socialProviders.google`) en `backend/src/auth/providers/google.ts` — config verificada solo por arranque del servidor con credenciales placeholder; el flujo de redirect real requiere credenciales de Google válidas y no se pudo ejercitar end-to-end en este entorno (ver nota en el reporte)
- [X] T016 [P] [US1] Configurar el plugin `magic-link` de Better Auth con `expiresIn` corto explícito (300s — Principio IV, research.md Decisión 5) en `backend/src/auth/providers/magic-link.ts`. `sendMagicLink` es un placeholder que loguea el link (no hay proveedor de email decidido todavía)
- [X] T017 [US1] Configurar la verificación de propiedad de email al vincular un segundo método a una cuenta existente (FR-010) usando `account.accountLinking` (`requireLocalEmailVerified: true`, `trustedProviders: ['google']`) en `backend/src/auth/index.ts`. Hallazgo adicional verificado en vivo: Better Auth además revoca (`revokeUnprovenAccountAccess`) cualquier credencial/cuenta previa NO verificada cuando un método de prueba de email (magic link) confirma la propiedad — más estricto que lo mínimo pedido por FR-010, documentado en research.md
- [X] T018 [US1] Exponer `GET /api/auth/session` devolviendo la `IdentidadResuelta` de T010 en `backend/src/routes/auth.ts` (distinto de `GET /api/auth/get-session`, que expone la sesión cruda de Better Auth)
- [X] T019 [P] [US1] Test de contrato: los 3 métodos son rutas independientes y ninguno es prerequisito de otro (`contracts/api.md`, tabla "Autenticación") en `backend/tests/contract/auth.test.ts` — 5/5 verdes. Corrigió otro endpoint mal documentado: Google es `POST /sign-in/social` con `{provider:"google"}`, no `GET /sign-in/google`
- [X] T020 [P] [US1] Test de integración: login por método A, vincular método B con el mismo email verificado, login por B resuelve al mismo `usuarios.id` (SC-004; quickstart.md Paso 3) en `backend/tests/integration/identity.test.ts` — 2/2 verdes, contra la base real
- [X] T021 [P] [US1] Test de integración: magic link reutilizado o vencido se rechaza (SC-006; quickstart.md Paso 4) en `backend/tests/integration/magic-link.test.ts` — 2/2 verdes. Confirmado el código real de rechazo: `302` a `errorCallbackURL` con `error=INVALID_TOKEN`, no `401`/`403` como decía el contrato original (corregido en `contracts/api.md`)

**Checkpoint**: autenticación multi-método con identidad unificada, funcional y testeada de forma independiente (MVP).

---

## Phase 4: User Story 2 - Un referente gestiona sus propios organismos (Priority: P1)

**Goal**: propietario/editor/admin leen, editan o borran un organismo (y su UF/taxonomía); nadie más puede (spec.md).

**Independent Test**: con dos organismos (A, B) y un usuario propietario solo de A, verificar que puede operar sobre A y no sobre B (quickstart.md Paso 5).

- [X] T022 [P] [US2] Implementar `GET/POST /api/organismos` y `GET/PATCH/DELETE /api/organismos/:id` en `backend/src/routes/organismos.ts` — FR-012; `POST`/`PATCH` fuerzan `propietario_id` al `usuarios.id` de la sesión, ignorando cualquier valor del body (FR-013, `contracts/api.md`). Verificado contra servidor real inyectando `propietarioId`/`propietario_id` en el body de ambos verbos — el valor persistido en la base fue siempre el del caller, nunca el inyectado
- [X] T023 [US2] Cablear `esOwnerOEditor()`/`esAdmin()` (T011) sobre `organismos.propietario_id` + `organismo_editores` en `backend/src/authz/organismos.ts` (depende de T022)
- [X] T024 [US2] Implementar las subrutas de UF y taxonomía (`/api/organismos/:orgId/unidades-funcionales*`, `/api/organismos/:orgId/taxonomia`) resolviendo la autorización contra el organismo padre, nunca una regla propia (FR-014) en `backend/src/routes/organismos.ts` (depende de T023). Verificado: usuario sin relación con el organismo padre → `403` al intentar crear una UF bajo él
- [X] T025 [P] [US2] Test de contrato de `organismos` (status codes de `contracts/api.md`, incluido el caso `propietario_id` ignorado en el body) en `backend/tests/contract/organismos.test.ts` — 5/5 verdes
- [X] T026 [P] [US2] Test de integración: acceso cruzado a organismo ajeno rechazado (SC-002), UF/taxonomía de un organismo ajeno rechazadas aunque el caller sea propietario de otro organismo (Edge Case de spec.md) en `backend/tests/integration/organismos-authz.test.ts` — 3/3 verdes. Bug real encontrado y corregido en el propio test: usaba `localidadId: 1`, que no existe en `localidades` (la migración no arranca en 1) — causaba `500` por violación de FK en vez de probar la autorización; se corrigió consultando un id real en `beforeAll`
- [X] T027 [US2] Test de integración: remover a un editor le quita acceso en su siguiente solicitud sin re-login (SC-007) en `backend/tests/integration/organismos-revocacion.test.ts` — 1/1 verde

**Checkpoint**: gestión de organismos con ownership real, verificada — caso de uso central de la herramienta.

---

## Phase 5: User Story 3 - Un referente provincial gestiona los grupos de jueces de su provincia (Priority: P2)

**Goal**: acceso a `pools_jueces` por coincidencia de provincia, no por ownership individual (spec.md).

**Independent Test**: pool de provincia X; usuario de X puede operar, usuario de Y (no admin) no puede (quickstart.md Paso 6).

- [X] T028 [P] [US3] Implementar `GET/POST /api/pools-jueces` y `GET/PATCH/DELETE /api/pools-jueces/:id` en `backend/src/routes/pools-jueces.ts` — FR-015. A diferencia de organismos, el POST no "fuerza" un valor: VALIDA que `provinciaId` del body coincida con la del usuario (o admin), y rechaza con `403` si no
- [X] T029 [US3] Cablear `mismaProvincia()`/`esAdmin()` (T011) sobre `grupos_jueces.provincia_id` vs. la provincia del usuario en `backend/src/authz/pools-jueces.ts` (depende de T028). Verificado contra servidor real: dos usuarios con el MISMO rol (`usuario_normal`) y provincias distintas — 403 simétrico en ambos sentidos (X sobre pool de Y, Y sobre pool de X) para GET/PATCH/DELETE, y 403 al intentar CREAR un pool declarando la provincia ajena; admin de una tercera provincia distinta accede a ambos sin problema
- [X] T030 [P] [US3] Test de contrato de `pools-jueces` en `backend/tests/contract/pools-jueces.test.ts` — 5/5 verdes
- [X] T031 [P] [US3] Test de integración: misma provincia permite, provincia distinta rechaza, admin siempre permite (SC-003; quickstart.md Paso 6) en `backend/tests/integration/pools-authz.test.ts` — 6/6 verdes, con dos usuarios del MISMO rol y provincias distintas, en ambos sentidos (X→Y e Y→X), más admin de una tercera provincia

**Checkpoint**: scoping geográfico verificado, independiente del modelo de ownership de organismos.

---

## Phase 6: User Story 4 - Consulta y edición de perfiles de usuario (Priority: P2)

**Goal**: cualquier autenticado lee cualquier perfil (visibilidad amplia confirmada); solo el propio usuario o un admin edita (spec.md).

**Independent Test**: dos usuarios sin relación; uno lee el perfil del otro pero no puede editarlo (quickstart.md Paso 7).

- [X] T032 [P] [US4] Implementar `GET /api/usuarios`, `GET /api/usuarios/:id` (FR-017) y `PATCH /api/usuarios/:id` (FR-016) en `backend/src/routes/usuarios.ts`. Verificado contra servidor real: usuario sin relación ni rol especial lee el perfil completo (incluido email) de otro — `200`
- [X] T033 [US4] Cablear la restricción de edición (propio usuario o admin) en `backend/src/authz/usuarios.ts` (depende de T032) — la lectura no lleva chequeo de autorización adicional más allá de estar autenticado (FR-017). Verificado: el mismo usuario sin relación → `403` al intentar editar el perfil ajeno; `200` al editar el propio; admin → `200` al editar el perfil ajeno
- [X] T034 [P] [US4] Test de contrato de `usuarios` en `backend/tests/contract/usuarios.test.ts` — 6/6 verdes
- [X] T035 [P] [US4] Test de integración: lectura amplia + edición rechazada entre usuarios sin relación, permitida para admin (quickstart.md Paso 7) en `backend/tests/integration/usuarios-authz.test.ts` — 6/6 verdes, cubriendo los dos lados (lectura amplia simétrica M↔N + edición acotada) y el bypass de admin

**Checkpoint**: perfiles de usuario con el alcance de visibilidad confirmado en spec.md (Clarifications).

---

## Phase 7: User Story 5 - Consulta de catálogo de localidades (Priority: P3)

**Goal**: catálogo de solo lectura para cualquier autenticado; sin alta/edición/borrado por esta API (spec.md).

**Independent Test**: lectura permitida a cualquier autenticado; ninguna ruta de escritura existe, para ningún rol (quickstart.md Paso 8).

- [X] T036 [P] [US5] Implementar `GET /api/localidades` y `GET /api/localidades/:id` en `backend/src/routes/localidades.ts` — FR-018; **no** registrar rutas `POST`/`PATCH`/`DELETE` (FR-019). Verificado contra servidor real: lectura `200` con sesión, `401` sin sesión; `POST`/`PATCH`/`DELETE` → `404` "Route ... not found" (no `403`), confirmado con usuario normal Y con admin — no hay regla que rechazar, la ruta no existe
- [X] T037 [P] [US5] Test de contrato: lectura permitida y confirmación de que las rutas de escritura no existen (`404`, no `403` — `contracts/api.md`) en `backend/tests/contract/localidades.test.ts` — 8/8 verdes, incluido el caso `POST` como admin → `404` (no es una restricción de rol)

**Checkpoint**: catálogo de solo lectura verificado, sin superficie de escritura ni siquiera detrás de un chequeo de rol.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: cierre, endurecimiento y validación de punta a punta.

- [ ] T038 [P] **NO implementado** — rate limiting de intentos de login fallidos por cuenta y por origen (Principio IV, SHOULD) en `backend/src/auth/rate-limit.ts`. Confirmado contra el código: no existe el archivo ni configuración `rateLimit` en `auth/index.ts`; el rate limiter propio de Better Auth está desactivado por default fuera de `NODE_ENV=production` y, aun activo, no es "por cuenta" sin una `customRule` que no se configuró. Es SHOULD, no MUST — no bloquea el cierre de la feature. Deuda registrada en `docs/decisiones-pendientes.md` D9
- [X] T039 [P] Redactar el runbook de esta API (variables de entorno, cómo correr, cómo migrar el esquema `auth`, cómo correr los tests) en `backend/README.md`, análogo a `migration/README.md`
- [X] T040 Verificar y registrar evidencia de que el esquema `public.*` no cambió tras aplicar las migraciones de Better Auth (`\dt public.*` antes/después — Principio VII-X, quickstart.md Paso 1) en `docs/resultado-verificacion-backend-api-20260921.md`
- [X] T041 Verificar y registrar evidencia de que las contraseñas almacenadas en `auth.account` usan hash scrypt (o el algoritmo configurado), nunca texto plano (SC-008) en el mismo documento de T040 — verificado con `backend/scripts/verificar-hash-password.ts` contra un usuario real, no solo leyendo el código
- [X] T042 Ejecutar la validación completa de `quickstart.md` de punta a punta (Pasos 1–8) y registrar resultados en `docs/resultado-verificacion-backend-api-20260921.md`. Encontró y corrigió una inexactitud del propio Paso 2 (`/get-session` da `200 null`, no `401`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias.
- **Foundational (Fase 2)**: depende de Setup. **Bloquea** todas las historias. T007 (spike) bloquea T009 en adelante; T008 es contingente al resultado de T007.
- **US1 (Fase 3)**: depende de Foundational. Es prerequisito *funcional* de todas las demás historias (sin login no hay sesión que autorizar), aunque cada historia se testea de forma independiente asumiendo que US1 ya está resuelta.
- **US2 (Fase 4)**: depende de Foundational + US1 (necesita una sesión real para probar ownership).
- **US3 (Fase 5)**: depende de Foundational + US1. Independiente de US2 (entidad y regla de autorización distintas).
- **US4 (Fase 6)**: depende de Foundational + US1. Independiente de US2/US3.
- **US5 (Fase 7)**: depende de Foundational + US1. Es la de menor riesgo y puede hacerse en cualquier momento tras US1.
- **Polish (Fase 8)**: depende de que las historias deseadas estén completas.

### Within each story

- Rutas → cableado de autorización → subrutas dependientes → tests de contrato → tests de integración.

### Parallel Opportunities

- Setup: T003, T004 en paralelo.
- Foundational: T011 en paralelo con T005/T006 (T007 depende de T005/T006 para tener DB; T009-T013 son secuenciales tras el spike).
- US1: T014, T015, T016 en paralelo (proveedores independientes); T019-T021 en paralelo entre sí tras T017/T018.
- US2, US3, US4, US5: independientes entre sí una vez cerrada US1 — pueden staffearse en paralelo.
- Polish: T038 y T039 en paralelo.

---

## Parallel Example: User Story 1

```bash
# Proveedores de autenticación, sin dependencia mutua:
Task: "T014 [US1] Configurar credenciales locales en backend/src/auth/providers/password.ts"
Task: "T015 [US1] Configurar Google OAuth en backend/src/auth/providers/google.ts"
Task: "T016 [US1] Configurar magic-link en backend/src/auth/providers/magic-link.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Fase 1: Setup.
2. Fase 2: Foundational — **spike de identidad (T007) primero**, es la decisión que condiciona todo lo demás.
3. Fase 3: US1 — autenticación multi-método con identidad unificada.
4. Fase 4: US2 — gestión de organismos (el caso de uso central de la herramienta).
5. **PARAR y VALIDAR**: con US1+US2, un referente ya puede loguearse y cargar sus propios organismos — demo del MVP real.

### Incremental Delivery

1. Setup + Foundational (con spike resuelto) → base lista.
2. + US1 → login funcional por los 3 métodos (MVP de identidad).
3. + US2 → carga de organismos con ownership real (MVP funcional completo).
4. + US3 → pools de jueces por provincia.
5. + US4 → perfiles de usuario.
6. + US5 → catálogo de localidades.
7. Polish → rate limiting, runbook, validación end-to-end.

---

## Notes

- **[P]** = archivos distintos, sin dependencias pendientes.
- La etiqueta **[Story]** mapea cada tarea a su historia para trazabilidad.
- El spike T007 no es una tarea de producto: es la verificación técnica del
  gate crítico de Principio V (`plan.md`). Su resultado se documenta en
  `research.md`, no solo en el código.
- Cero tareas de esta lista tocan `001-modelo-datos-relacional`, `db/` o
  `migration/` — toda la superficie nueva vive en `backend/` (código) y en
  el esquema Postgres `auth` (datos), aditivo sobre `public.*`.
- Commit por tarea o grupo lógico; parar en cualquier checkpoint para
  validar una historia de forma independiente.
