# Tasks: Backend de identidad y autorización — cierre de los hallazgos de seguridad de 002/005/006

**Input**: `/specs/007-identidad-autorizacion/` — plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Prerequisites**: plan.md, spec.md (ambos presentes). Constitución en `.specify/memory/constitution.md`.

**Tests**: SÍ se incluyen. El plan los exige (Vitest contra la base real, sin mocks; Decisión 10 de research.md) y la feature es de seguridad: cada historia trae sus pruebas, escritas primero y fallando antes de implementar.

**Organization**: por historia de usuario. Rutas relativas a la raíz del repo; backend en `backend/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1..US7 (spec.md)

## Notas de orden (léase antes de empezar)

- **US1 y US4 deben entregarse juntas.** Cerrar el autoalta (US1) sin el alta administrada (US4) deja al sistema sin forma de incorporar usuarios. Se implementan en fases separadas pero **no se hace merge/despliegue de US1 sin US4**.
- **`crearUsuarioDePrueba` (helper) depende del servicio de provisión y del acceso inicial**, por eso ese núcleo está en Foundational y no en US4.
- Los 51 usos del alta pública por contraseña en 19 archivos de test se resuelven **en un solo punto** (T009) más la reescritura de 3 archivos de auth.
- Verificado hoy: las rutas de taxonomía de organismo (`GET /api/organismos/:orgId/taxonomia` y su `PUT`) viven en `backend/src/routes/organismos.ts`; `backend/src/routes/taxonomia.ts` solo sirve `GET /api/taxonomia/preguntas`. `backend/src/http/trigger-error.ts` exporta hoy `esRechazoDeTrigger`, `esRechazoDeIntegridad` y `mensajeDeIntegridad` (usados por `organismos.ts`).

---

## Phase 1: Setup

**Purpose**: configuración y línea base

- [x] T001 Agregar `ACCESO_INICIAL_TTL_HORAS` (entero > 0, default 24) al esquema de variables en `backend/src/config/env.ts` y documentarla en `backend/README.md`
- [x] T002 Línea base: correr `cd backend && npx vitest run` y `npx tsx scripts/spike-007-identidad.ts` (19/19) y anotar en la descripción del PR qué tests pasan hoy (referencia para detectar regresiones)

---

## Phase 2: Foundational (bloquea todas las historias)

**Purpose**: servicios de provisión y de acceso inicial, y el helper de pruebas que todos los tests usan.

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase.

- [x] T003 Crear `backend/src/services/usuarios.ts` con `provisionarUsuario({email, rolInicial, provinciaId?, nombreDisplay?})`: UNA transacción (`backend/src/db/transaction.ts`) que inserta `usuarios` (email normalizado en minúsculas/sin espacios, `email_verificado=true`, `firestore_id='api:<uuid>'`), `usuario_roles` (siempre `usuario_normal`, más `admin` si corresponde) y `auth."user"` por SQL (`id = usuarios.id::text`, `emailVerified=true`). Valida: formato de email, rol ∈ {admin, usuario_normal}, provincia obligatoria para `usuario_normal`. Errores tipados (email duplicado, provincia/rol inválidos) para que la ruta los traduzca. Decisión 4.
- [x] T004 Crear `backend/src/auth/acceso-inicial.ts` con `emitirAccesoInicial(usuarioId)` (borra los `reset-password:*` previos del mismo `value`, crea uno nuevo vía `internalAdapter.createVerificationValue` con TTL de `ACCESO_INICIAL_TTL_HORAS`, token de alta entropía; devuelve `{token, vence}`) y `canjearAccesoInicial(token, password)` (valida política de contraseña ANTES de mirar el token; consumo atómico de un solo uso; crea la credencial; crea sesión; respuestas uniformes). Decisión 3. El token NUNCA se escribe en logs (FR-022).
- [x] T005 **(absorbida por T012)** Modificar `backend/src/auth/identity-hook.ts`: eliminar el `INSERT INTO usuarios` (puerta abierta de D14); dejar solo la resolución de id. NO cerrar aún el hook de rechazo (eso es US1, T012); este cambio deja el módulo listo.
- [x] T006 Reescribir `crearUsuarioDePrueba` en `backend/tests/helpers/db.ts`: `provisionarUsuario` (mismo servicio que la ruta) + `emitirAccesoInicial` + `canjearAccesoInicial` + `sign-in/email` para obtener la cookie; agregar `crearAdminDePrueba`. Mantener el criterio de prefijo `test-*` de `limpiarUsuariosDePrueba` (incluir limpieza de filas `reset-password:*` de `auth.verification`).
- [x] T007 [P] Test unitario/integración del servicio en `backend/tests/integration/provision.test.ts`: atomicidad (ante cualquier rechazo 0 filas en `usuarios`, `usuario_roles`, `auth.user`), email normalizado, provincia obligatoria/opcional, duplicado sin modificar al existente, dos altas simultáneas del mismo email → una sola.
- [x] T008 [P] Test de contrato de esquema en `backend/tests/contract/auth-schema.test.ts`: las columnas de `auth."user"` insertadas por SQL en T003 coinciden con las de `getMigrations()` de Better Auth (riesgo del plan: acoplamiento con la forma de la tabla).

**Checkpoint**: se puede crear un usuario con sesión sin pasar por el alta pública.

---

## Phase 3: User Story 1 — Solo una persona ya dada de alta puede obtener una identidad (P1) 🎯 MVP (junto con US4)

**Goal**: ningún método (contraseña, Google, enlace) crea usuario ni identidad para un email no dado de alta; sin alta pública por contraseña ni siquiera para emails provisionados.

**Independent Test**: quickstart escenarios 1–5 (incluida la sonda de toma de cuenta del 2026-09-25 que ya no debe obtener sesión).

### Tests for US1 ⚠️ (escribir primero, deben fallar)

- [x] T009 [P] [US1] Reescribir `backend/tests/contract/auth.test.ts` sin alta pública: `POST /api/auth/sign-up/email` → `400 EMAIL_PASSWORD_SIGN_UP_DISABLED` con email nuevo Y con email provisionado sin ingresar; 0 filas nuevas; el intento de toma de cuenta no obtiene sesión (SC-001, SC-003).
- [x] T010 [P] [US1] Reescribir `backend/tests/integration/identity.test.ts`: Google (`sign-in/social` con `idToken`) con email no provisionado → `403 ACCESO_NO_AUTORIZADO`, 0 filas; con email provisionado sin `auth.user` → entra con `auth.user.id = usuarios.id` sin duplicar; email de Google que no coincide no vincula por otro dato (FR-007); mayúsculas/espacios = mismo usuario (US1-6).
- [x] T011 [P] [US1] Reescribir `backend/tests/integration/magic-link.test.ts`: pedido de enlace para email no provisionado devuelve `200 {status:true}` idéntico al de uno provisionado pero NO registra/envía enlace utilizable; `verify` de un provisionado crea `auth.user` con `id = usuarios.id` y sesión sin tocar `usuarios`; un enlace forzado para un email no provisionado redirige con `?error=ACCESO_NO_AUTORIZADO` y deja 0 filas; los 47 migrados pueden ingresar (SC-002, simulado con usuarios provisionados sin `auth.user`).

### Implementation for US1

- [x] T012 [US1] Crear `backend/src/auth/identidad-hook.ts` con la función del before-hook: normaliza el email, consulta `usuarios` (una consulta indexada); si no existe lanza `APIError('FORBIDDEN', {code:'ACCESO_NO_AUTORIZADO', message: <uniforme, sin revelar existencia>})`; si existe fija `auth.user.id = usuarios.id`. Decisión 1.
- [x] T013 [US1] Modificar `backend/src/auth/index.ts`: componer T012 en `databaseHooks.user.create.before` (la misma función de `002`), y agregar `emailAndPassword.disableSignUp: true` (cierra HTTP y API de servidor; FR-004, Decisión 2).
- [x] T014 [US1] Modificar `backend/src/auth/providers/magic-link.ts` (`sendMagicLink`): si el email no está provisionado, no registrar ni enviar el enlace y retornar sin error para que la respuesta HTTP sea idéntica (FR-003). No loguear el enlace de un email no provisionado.
- [x] T015 [US1] Verificar en `backend/src/routes/auth.ts` / `backend/src/app.ts` que los flujos de navegador (Google callback y magic-link verify) redirijan a `errorCallbackURL?error=ACCESO_NO_AUTORIZADO&error_description=…` con descripción uniforme; ajustar si no.
- [x] T016 [US1] Correr `npx tsx backend/scripts/spike-007-identidad.ts` y `spike-007-coexistencia.ts`: siguen 19/19 y la coexistencia da `400` con `disableSignUp`. Correr toda la suite: los tests que aún fallen por usar `sign-up/email` deben resolverse solo vía T006 (si alguno lo usa directo, cambiarlo a `crearUsuarioDePrueba`).

**Checkpoint**: US1 verificada. **No desplegar sin US4.**

---

## Phase 4: User Story 2 — Solo un administrador asigna la provincia (P1)

**Goal**: `provinciaId` solo lo escribe un admin; `403` explícito y atómico para no-admin que intenta cambiarla.

**Independent Test**: quickstart escenarios 6–8 (parte provincia).

### Tests for US2 ⚠️

- [x] T017 [P] [US2] Crear `backend/tests/integration/rol-y-provincia-authz.test.ts` (sección provincia): no-admin cambia su provincia → `403` con mensaje `La provincia de un usuario solo la puede asignar un administrador.`, provincia y nombre sin cambios (rechazo completo, US2-2); no-admin reenvía la provincia actual + `nombreDisplay` → `200`, nombre cambia, provincia igual (FR-010); `null`→valor cuenta como cambio; admin cambia provincia de otro → `200` y rige en la siguiente solicitud del afectado, incluso el acceso a pools (FR-011, US2-5); provincia inexistente → `400 "La provincia indicada no existe."`; no-admin sobre otro usuario → `403` (regla de 002).
- [x] T018 [P] [US2] Ampliar `backend/tests/contract/usuarios.test.ts` con los casos del contrato de `PATCH /api/usuarios/:id` (tabla de contracts/api.md §1).

### Implementation for US2

- [x] T019 [US2] Agregar `asignarProvincia` en `backend/src/services/usuarios.ts` (valida existencia de la provincia; traduce a error tipado).
- [x] T020 [US2] Modificar `PATCH /api/usuarios/:id` en `backend/src/routes/usuarios.ts` (con la regla en `backend/src/authz/usuarios.ts`): si el solicitante no es admin y `provinciaId` difiere del actual (leído de la base, incluye `null`→valor) → `403` y no se aplica nada; si es igual, se ignora ese campo como no-cambio y la respuesta refleja la provincia sin cambios; admin → `asignarProvincia`. Actualizar el esquema TypeBox de la ruta si hace falta.

**Checkpoint**: US2 independiente y verificada.

---

## Phase 5: User Story 3 — Un administrador cambia el rol de un usuario (P1)

**Goal**: `PUT /api/usuarios/:id/rol`, solo admin; nunca 0 admins; efecto en la siguiente solicitud.

**Independent Test**: quickstart escenarios 8–9.

### Tests for US3 ⚠️

- [x] T021 [P] [US3] Ampliar `backend/tests/integration/rol-y-provincia-authz.test.ts` (sección rol): promover → el afectado usa funciones de admin en su siguiente solicitud sin re-login; degradar → las pierde; no-admin (incluso sobre sí mismo) → `403`; único admin (incluido autodescenso) → `400 "El sistema no puede quedarse sin administradores."`; autodescenso con otros admins → permitido; usuario o rol inexistente → `404`/`400`; **carrera**: dos degradaciones simultáneas de los dos últimos admins → nunca 0 admins (SC-006); la fila `usuario_normal` se conserva siempre.
- [x] T022 [P] [US3] Ampliar `backend/tests/contract/usuarios.test.ts` con los códigos y cuerpos de `PUT /api/usuarios/:id/rol` (contracts/api.md §1).

### Implementation for US3

- [x] T023 [US3] Agregar `cambiarRol(usuarioId, rol)` en `backend/src/services/usuarios.ts`: transacción con bloqueo `FOR UPDATE` sobre las filas `admin` y conteo dentro de la transacción; agrega/quita la fila `admin` (conserva `usuario_normal`); rechaza dejar 0 admins (Decisión 5).
- [x] T024 [US3] Agregar `PUT /api/usuarios/:id/rol` en `backend/src/routes/usuarios.ts` (solo admin → `403`; body `{rol: 'admin'|'usuario_normal'}` con TypeBox; `200 {id, roles}`; `404` usuario inexistente; `400` rol inválido / último admin). Verificar que la identidad se relee en cada solicitud (`backend/src/auth/resolve-identity.ts`) y no hay cache.

**Checkpoint**: US1–US3 (seguridad P1) completas.

---

## Phase 6: User Story 4 — Alta administrada y primer acceso (P2)

**Goal**: el admin da de alta (email, provincia, rol) y entrega un acceso inicial de un solo uso; la persona lo canjea y fija su contraseña.

**Independent Test**: quickstart escenarios 10–13, 18.

### Tests for US4 ⚠️

- [x] T025 [P] [US4] Crear `backend/tests/contract/acceso-inicial.test.ts`: `POST /api/usuarios` (`201` con `accesoInicial.{token,vence}`; `400` email inválido / duplicado sin modificar / rol inválido / usuario normal sin provincia / provincia inexistente; `403` no-admin; `401` sin sesión); `POST /api/usuarios/:id/acceso-inicial` (`201`, invalida el anterior, `404`, `403`); `POST /api/acceso-inicial/canjear` (`200 {usuarioId}` + `Set-Cookie`; `400` uniforme para token inexistente/usado/vencido/reemplazado; `400 PASSWORD_TOO_SHORT|TOO_LONG` antes de mirar el token).
- [x] T026 [P] [US4] Ampliar `backend/tests/integration/provision.test.ts` con el flujo completo: alta → canje → sesión con provincia y rol asignados → ingreso posterior por contraseña; canje doble y en paralelo → solo el primero tiene efecto; vencido (TTL corto por variable de entorno); tras canje, ingreso por enlace NO invalida la contraseña (FR-020); persona sin canjear puede ingresar por enlace/Google.
- [x] T027 [P] [US4] Test de no-fuga en `backend/tests/integration/acceso-inicial-logs.test.ts`: capturar la salida del logger del servidor durante alta, reemisión y canje; el token y cualquier enlace de acceso inicial NO aparecen (FR-022).

### Implementation for US4

- [x] T028 [US4] Agregar `POST /api/usuarios` en `backend/src/routes/usuarios.ts` (solo admin; usa `provisionarUsuario` + `emitirAccesoInicial` en el mismo flujo; `201` con el cuerpo del contrato; traduce errores tipados a `400` con los mensajes exactos de contracts/api.md).
- [x] T029 [US4] Agregar `POST /api/usuarios/:id/acceso-inicial` en `backend/src/routes/usuarios.ts` (solo admin; `404` si no existe; `201 {token, vence}`).
- [x] T030 [US4] Crear `backend/src/routes/acceso-inicial.ts` con `POST /api/acceso-inicial/canjear` (público; body `{token, password}` TypeBox; usa `canjearAccesoInicial`; entrega la cookie de sesión; respuestas uniformes) y registrarla en `backend/src/app.ts`.
- [x] T031 [US4] Modificar el hook global de `401` en `backend/src/app.ts`: agregar `/api/acceso-inicial/canjear` a las excepciones junto con `/api/auth/*` (única ruta de dominio sin `401`; FR-029). Asegurar que el logger no serialice el body de esa ruta (redact de `token`/`password`).
- [x] T032 [US4] Correr los escenarios 10–13 y 18 de `quickstart.md` contra el backend real y confirmar que < 5 min sin correo (SC-007).

**Checkpoint**: US1 + US4 juntas = punto mínimo desplegable (MVP de seguridad).

---

## Phase 7: User Story 5 — Cambio de contraseña (P2)

**Goal**: un usuario con contraseña la cambia informando la actual; las demás sesiones se cierran.

**Independent Test**: quickstart escenarios 14–15.

### Tests for US5 ⚠️

- [x] T033 [P] [US5] Crear `backend/tests/integration/password.test.ts`: `POST /api/auth/change-password` con actual correcta → la nueva sirve, la vieja da `401`; con 2 sesiones, la otra queda inválida y la actual recibe cookie nueva **aunque el cliente NO envíe `revokeOtherSessions`** (forzado en el servidor); actual incorrecta → rechazo sin cambios; nueva < 8 caracteres → rechazo que dice qué falta; usuario sin credencial (solo Google/enlace) → `400` de Better Auth (US5-5).

### Implementation for US5

- [x] T034 [US5] En `backend/src/auth/index.ts` agregar `hooks.before` para la ruta `/change-password` que fuerza `ctx.body.revokeOtherSessions = true` (Decisión 9).
- [x] T035 [US5] Documentar en `specs/007-identidad-autorizacion/contracts/api.md` (nota de implementación) y `backend/README.md` la rotación de la cookie de sesión al cambiar la contraseña, si el comportamiento observado difiere de lo escrito.

**Checkpoint**: US5 verificada.

---

## Phase 8: User Story 6 — Rechazos de integridad como errores de cliente (P3)

**Goal**: manejador central: la clase 23 causada por el cliente → `400` con mensaje claro; lo inesperado sigue siendo `500`.

**Independent Test**: quickstart escenario 16.

### Tests for US6 ⚠️

- [x] T036 [P] [US6] Crear `backend/tests/contract/errores-integridad.test.ts`: una prueba por cada constraint alcanzable del mapa de contracts/api.md §4 — `DELETE /api/pools-jueces/:id` con asignaciones → `400` "en uso" y el pool sigue existiendo; `POST`/`PATCH` UF con `localidadId` inexistente → `400 "La localidad indicada no existe."`; tipo de UF, denominación simplificada, tipo de oficina, provincia (organismos, pools, usuarios), rol y usuario editor inexistentes; `usuarios_email_key` duplicado; un caso de error inesperado (no clase 23) sigue devolviendo `500`. Verificar que ningún mensaje contiene nombres de tablas ni de constraints.

### Implementation for US6

- [x] T037 [US6] Crear `backend/src/http/errores-integridad.ts`: mapa por constraint (contracts/api.md §4), mensaje genérico por tipo para constraints no mapeados (`23503`, `23505`, `23514`, `23502`), desambiguación de `23503` por método HTTP (`DELETE` ⇒ "en uso", resto ⇒ "no existe"), y `setErrorHandler` que responde `400 {error}` para la clase 23 y deja pasar el resto como `500` registrando el error. Absorber `esRechazoDeTrigger`/`esRechazoDeIntegridad`/`mensajeDeIntegridad` de `backend/src/http/trigger-error.ts` (que se elimina o queda como reexport hasta terminar T039).
- [x] T038 [US6] Registrar el manejador en `backend/src/app.ts`.
- [x] T039 [US6] Quitar los `try/catch` locales de integridad en `backend/src/routes/organismos.ts` (importa hoy de `trigger-error.js`), `backend/src/routes/pools-jueces.ts` y demás rutas de escritura que los tengan, dejando que el manejador central responda; conservar únicamente el manejo específico de taxonomía (US7). Eliminar `backend/src/http/trigger-error.ts` cuando no queden importadores.
- [x] T040 [US6] Revisar las rutas de escritura existentes (organismos, UF, pools, asignaciones, editores, usuarios, taxonomía) buscando referencias a datos del cliente sin cubrir por el mapa; cualquier hallazgo adicional entra en el mismo requisito (FR-025) y se agrega al mapa y a T036. Las 4 pruebas heredadas de `006` (asignaciones, editores) deben seguir pasando.

**Checkpoint**: US6 verificada; 0 `500` por datos del cliente.

---

## Phase 9: User Story 7 — Rechazos de taxonomía identificables (P3)

**Goal**: mensajes con código y texto de la pregunta, sin ids internos; campo estructurado `preguntaCodigo`/`preguntaTexto`.

**Independent Test**: quickstart escenario 17.

### Tests for US7 ⚠️

- [x] T041 [P] [US7] Ampliar `backend/tests/contract/taxonomia.test.ts`: para cada caso (pregunta no aplica al tipo del organismo, opción ajena/inexistente, valor de tipo no admitido, dos respuestas a pregunta de opción única, y el `400` de Protección A) → `400 {error, preguntaCodigo, preguntaTexto}`; aserción por regex de que `error` NO contiene ids numéricos internos, `tipo_oficina_id` ni nombres de tablas/constraints; con varias respuestas inválidas se informa al menos la primera (US7-4).
- [x] T042 [P] [US7] Test de migración en `backend/tests/integration/migracion-0004.test.ts`: aplicada `0004`, provocar cada `RAISE` de los triggers directamente por SQL y comprobar `DETAIL = 'preguntaCodigo=<codigo>'` y ausencia de ids en el mensaje; `down` restaura las definiciones de `0001`/`0003`.

### Implementation for US7

- [x] T043 [US7] Crear `backend/migrations/0004_taxonomia_mensajes_legibles.ts` (patrón de `0001`–`0003`, `up`/`down`): función auxiliar `taxonomia_pregunta_rotulo(pregunta_id)`; `CREATE OR REPLACE FUNCTION` de `validar_respuesta_taxonomia()` (0001) y `validar_pregunta_tipo_organismo()` (0003) con mensajes por código/texto, sin `pregunta_id`/`opcion_id`/`tipo_oficina_id`, y `USING DETAIL = 'preguntaCodigo=<codigo>'`; `down` restaura las de `0001`/`0003`. No tocar la de `0002`. Aplicar con `cd backend && npm run migrate:public`.
- [x] T044 [US7] Modificar `PUT /api/organismos/:orgId/taxonomia` en `backend/src/routes/organismos.ts`: validar antes que cada `opcionesCodigos` pertenezca a la pregunta ("La opción «X» no existe para la pregunta «Y»."); traducir el rechazo de trigger leyendo `err.detail` (`preguntaCodigo=`) y consultando el texto de la pregunta → `400 {error, preguntaCodigo, preguntaTexto}`; conservar `Pregunta(s) inexistente(s): a, b` de 004. Los rechazos de `PATCH /api/organismos/:id` (Protección B) no cambian.
- [x] T045 [US7] Verificar contra la base real que `preguntaTexto` refleja el `texto` cargado (hoy igual al código, D19) sin inventar contenido.

**Checkpoint**: todas las historias completas.

---

## Phase 10: Polish & Cross-Cutting

- [x] T046 [P] Actualizar `docs/decisiones-pendientes.md`: cerrar D14, D16, D18, D20 y G1/G3 con referencia a 007; registrar FR-004 y FR-010 como apartamientos conscientes del pedido literal.
- [x] T047 [P] Actualizar `backend/README.md`: variable `ACCESO_INICIAL_TTL_HORAS`, cómo dar de alta un usuario, primer acceso, flujo del canje, `Set-Cookie` rotado.
- [x] T048 [P] Documentar en `specs/007-identidad-autorizacion/contracts/api.md` §5 el impacto en `frontend/tests/e2e/helpers/backend.ts` (`crearUsuarioConClave` debe usar `POST /api/usuarios` + canje); NO modificar `frontend/` (Fase B, fuera de alcance).
- [x] T049 Correr la suite completa `cd backend && npx vitest run` contra la base real; verificar al final `usuarios` = 47, 3 admins y `auth."user"` sin filas `test-%` ni `reset-password:*` residuales en `auth.verification`.
- [x] T050 Correr los 18 escenarios de `quickstart.md` de punta a punta y registrar el resultado en `docs/resultado-verificacion-007-<fecha>.md`.
- [x] T051 Revisión de seguridad (`/security-review`) sobre el diff: hook de ingreso, `disableSignUp`, canje público, no-fuga del token, manejador de errores sin filtrado de esquema.
- [x] T052 Confirmar que `backend/scripts/spike-007-*.ts` se conservan como test de humo de Better Auth 1.7.5 (versión fijada) y agregarlos al README del backend.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → historias. Polish (10) al final.
- Foundational bloquea todo: T003/T004 antes de T006; T006 antes de cualquier test que necesite un usuario con sesión.

### Story Dependencies

- **US1 (P1)**: tras Foundational. **Solo se despliega junto con US4.**
- **US2 (P1)**: tras Foundational; independiente de US1 (los tests usan el helper T006).
- **US3 (P1)**: tras Foundational; independiente. Comparte `services/usuarios.ts` y `routes/usuarios.ts` con US2/US4 (conflicto de archivo: no paralelizar sus tareas de implementación entre sí).
- **US4 (P2)**: tras Foundational; su valor depende de US1.
- **US5 (P2)**: tras Foundational; independiente.
- **US6 (P3)**: independiente de las demás; T039 toca `routes/organismos.ts`, que también toca T044 (US7) → hacer US6 antes de US7, o coordinar.
- **US7 (P3)**: tras T043 (migración) → T044; después de US6 por el archivo compartido.

### Within Each Story

- Tests primero y fallando → servicio → ruta → verificación de quickstart.

## Parallel Opportunities

- Foundational: T007 y T008 en paralelo (tras T003–T006).
- Tests de cada historia marcados [P] (archivos distintos) en paralelo; T009/T010/T011 en paralelo.
- Con más de una persona tras Foundational: A → US1+US4 (auth/), B → US2+US3 (services/routes usuarios; secuencial entre sí), C → US5, D → US6 luego US7.
- Polish T046–T048 en paralelo.

### Parallel Example: US1

```text
Task: "Reescribir backend/tests/contract/auth.test.ts (T009)"
Task: "Reescribir backend/tests/integration/identity.test.ts (T010)"
Task: "Reescribir backend/tests/integration/magic-link.test.ts (T011)"
```

## Implementation Strategy

### MVP (mínimo desplegable de seguridad)

1. Setup + Foundational.
2. US1 **+ US4** (cerrar la puerta y tener la forma de dar de alta) — validar quickstart 1–5 y 10–13.
3. US2 y US3 (autorización P1) — validar 6–9. Con esto se cumplen todos los bloqueantes de seguridad de la Fase A.
4. **Detenerse y validar** antes de exponer el sistema a usuarios reales.

### Entrega incremental

1. + US5 (contraseña) → 2. + US6 (errores de integridad) → 3. + US7 (taxonomía, incluye migración `0004`) → Polish.

## Notes

- Cada test limpia sus filas con el prefijo `test-*`; nunca tocar los 47 usuarios reales ni los 3 admins reales.
- Un email = un usuario (citext único): comparar siempre normalizado.
- Los mensajes de rechazo de ingreso son uniformes y no revelan si el email existe (FR-003).
- Commit por tarea o grupo lógico; no editar migraciones ya aplicadas (`0001`–`0003`).
