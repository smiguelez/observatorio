# Tasks: Frontend — Fase B: consumir la identidad y autorización de 007

**Input**: Design documents from `/specs/008-frontend-identidad-fase-b/`

**Prerequisites**: plan.md, spec.md, research.md (14 decisiones), data-model.md, contracts/consumed-api.md, contracts/routes.md, quickstart.md

**Tests**: SÍ. La spec los exige (FR-031, SC-010): unitarios sobre **fixtures reales** (D13) y E2E contra **backend real**. En cada historia los tests se escriben primero y deben fallar antes de implementar.

**Organization**: por historia de usuario. Todas las rutas son relativas a la raíz del repo; el código vive en `frontend/`. **`backend/` y `src/` no se tocan.**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1..US7 (spec.md)

## Notas de orden (léase antes de empezar)

- **Hoy los 60 tests E2E (15 archivos) fallan en su `beforeAll`**: `crearUsuarioConClave` usa el alta pública que `007` eliminó (`research.md` Decisión 11). Hasta terminar la Fase 2 no hay forma de correr ningún E2E.
- **`AdminUsuariosPage.tsx` lo tocan US1 y US3**, y `tests/e2e/alta-canje.spec.ts` lo tocan US1 y US2: esas tareas van en secuencia (sin `[P]`).
- **Nunca** correr E2E ni scripts contra datos que no sean de prueba: los fixtures usan el prefijo `test-frontend-` y **el arranque por SQL del admin de fixtures es el único atajo** (documentado). Al terminar cada corrida verificar la base (T060).
- **PII/secretos**: los fixtures grabados y la evidencia visual deben quedar **anonimizados** y con **tokens redactados** (D15). Revisar antes de cualquier commit (T059).
- Componentes shadcn ya instalados: `dialog`, `alert-dialog`, `select`, `checkbox`, `field`, `input`, `sonner`. Si alguno faltara, `npx shadcn@latest add <nombre>` desde `frontend/`.
- Verificado hoy: `vitest` 18 archivos / 152 tests, `tsc -b --noEmit` limpio; `POST /api/acceso-inicial/canjear` responde en `:3000` (el backend de `007` está corriendo). **No verificado**: que ese servidor tenga `BETTER_AUTH_URL=http://localhost:5173` (T002).

---

## Phase 1: Setup

**Purpose**: línea base y prerrequisitos verificables

- [x] T001 Línea base: correr en `frontend/` `npx vitest run`, `npx tsc -b --noEmit` y `npm run lint`; anotar en la descripción del PR los conteos de hoy (esperado: 18 archivos / 152 tests, `tsc` limpio) para detectar regresiones
- [x] T002 Verificar prerrequisitos de E2E y anotar el resultado: (a) `psql "$DATABASE_URL" -Atc 'select 1'` responde; (b) `curl -s -X POST localhost:3000/api/acceso-inicial/canjear -H 'content-type: application/json' -d '{"token":"x","password":"clave-larga-123"}'` da `400 {"error":"El acceso inicial no es válido o venció."}` (backend de `007`); (c) el backend en `:3000` fue iniciado con `BETTER_AUTH_URL=http://localhost:5173` (si no, un `POST` con cookie y `Origin` de `:5173` da `403 INVALID_ORIGIN`: en ese caso pedir reiniciarlo con la variable; **no** matar el servidor existente sin avisar)

---

## Phase 2: Foundational (bloquea todas las historias)

**Purpose**: capa de API, sesión fresca, fixtures reales y recuperación de la suite E2E.

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase.

### Capa de API y utilidades

- [x] T003 [P] Crear `frontend/src/lib/contrasena.ts` exportando `CONTRASENA_MIN = 8` y `CONTRASENA_MAX = 128` (`research.md` Decisión 14)
- [x] T004 [P] Modificar `frontend/src/api/http.ts` (`extraerMensaje`): si el cuerpo trae `code === 'FST_ERR_VALIDATION'` devolver el mensaje genérico "Los datos enviados no son válidos." en lugar de `error` ("Bad Request"); conservar `codigo`. Test primero en `frontend/tests/unit/api/http.test.ts` (nuevo): cuerpo `{"statusCode":400,"code":"FST_ERR_VALIDATION","error":"Bad Request","message":"…"}` ⇒ `ApiError.message` genérico; un `{error:"…"}` normal y un `{message,code}` de Better Auth siguen igual (`research.md` Decisión 2)
- [x] T005 Modificar `frontend/src/api/usuarios.ts`: agregar tipos `AltaUsuarioInput`, `UsuarioAlta`, `AccesoInicial` (`data-model.md`), esquemas zod de las respuestas reales (`id`/`usuarioId` string → number con `idWire`/`usuarioIdDesdeWire`, `vence` ISO → `Date`, `roles` validados) y funciones `crearUsuario` (`POST /api/usuarios`), `emitirAccesoInicial` (`POST /api/usuarios/:id/acceso-inicial` **sin** body) y `cambiarRol` (`PUT /api/usuarios/:id/rol`, body `{ rol }`, respuesta `{ id, roles }`); hooks `useCrearUsuario` (con `gcTime: 0`), `useEmitirAccesoInicial` (`gcTime: 0`) y `useCambiarRol` (invalidan `CLAVE_USUARIOS` y `CLAVE_SESION`). No tocar los esquemas existentes (`PatchWire`, `DetalleWire`)
- [x] T006 [P] Crear `frontend/src/api/acceso-inicial.ts` con `canjearAccesoInicial({ token, password })` → `POST /api/acceso-inicial/canjear`, respuesta `{ usuarioId }` mapeada a number. **Función directa, sin `useMutation`** (una mutación retiene variables en el caché: `research.md` Decisión 4). Sin `content-type` extra ni manejo de cookie (la gestiona el navegador)

### Sesión fresca (FR-021, SC-007)

- [x] T007 Modificar `frontend/src/components/layout/AppLayout.tsx` para invalidar `CLAVE_SESION` (de `@/auth/useSesion`) en cada cambio de `location.pathname` (`useEffect` + `useQueryClient`), y `frontend/src/main.tsx` para que `MutationCache.onError` invalide `CLAVE_SESION` ante un `ApiError` con `status === 403` (además de mostrar su mensaje, que ya sigue el camino existente). Test primero en `frontend/tests/unit/auth/sesion-fresca.test.tsx` (nuevo): con `createMemoryRouter`, al navegar entre dos rutas del árbol protegido se vuelve a pedir la sesión; un `403` de una mutación la invalida; **no** se desmonta la pantalla mientras se refresca (`research.md` Decisión 7)

### Fixtures reales y pruebas de contrato (D13)

- [x] T008 Modificar `frontend/scripts/grabar-fixtures.mjs`: reemplazar el `sign-up` (roto) por el **arranque por SQL del admin de fixtures + canje HTTP + sign-in** y crear los usuarios de fixtures por **alta administrada + canje** (mismo flujo que T009); agregar la grabación de `usuario-alta`, `acceso-reemitido`, `canje`, `rol` y de los cuerpos de error `error-alta-duplicado`, `error-canje-invalido`, `error-canje-password-corta`, `error-pool-en-uso`, `error-taxonomia-pregunta`, `error-validacion-fastify`. **Anonimizar** emails/nombres y **redactar tokens** antes de escribir; conservar la regla existente de no grabar datos de usuarios reales (`research.md` Decisión 12)
- [x] T009 Modificar `frontend/tests/e2e/helpers/backend.ts` (**una sola vez, cubre los 15 archivos**): agregar `asegurarAdminDeFixtures()` (si no existe `test-frontend-boot@example.test`: `INSERT` por SQL en `usuarios` + `usuario_roles` (`admin` y `usuario_normal`) + `auth."user"` con `emailVerified=true` + fila `auth.verification` `reset-password:<token aleatorio>`; luego `POST /api/acceso-inicial/canjear` con `CLAVE` y `sign-in/email` para la cookie; **no cachear entre archivos**, cada archivo hace `limpiarFixtures()` al empezar); reescribir `crearUsuarioConClave(email, opts?)` para hacer, con esa cookie, `POST /api/usuarios` (alta administrada) y `POST /api/acceso-inicial/canjear` con `CLAVE`, dejando la provincia en `NULL` por SQL salvo `opts.provinciaId: number` (estado de partida de los tests existentes; `opts.rol` opcional); agregar `crearUsuarioSinClave(email, provinciaId?)` (alta administrada **sin canjear**); extender `limpiarFixtures` para borrar filas `auth.verification` con `identifier LIKE 'reset-password:%'` cuyo `value` sea un id de usuario `test-frontend-*` (guardan el id, no el email) y el admin de arranque; conservar `sesionApi`, `hacerAdmin`, `asignarProvincia` (`research.md` Decisión 11)
- [x] T010 Ejecutar `DATABASE_URL=… node frontend/scripts/grabar-fixtures.mjs` (backend en `:3000`), revisar **a mano** los JSON nuevos de `frontend/tests/unit/api/fixtures/real/` (0 emails/nombres reales, 0 tokens/cookies reales) y agregar sus formas a `frontend/tests/unit/api/fixtures/wire.ts` si el resto de los tests las importa ahí
- [x] T011 [P] Tests de contrato de los esquemas nuevos en `frontend/tests/unit/api/usuarios.test.ts` (existente, agregar casos) y `frontend/tests/unit/api/acceso-inicial.test.ts` (nuevo), **contra los JSON reales de T010**: alta (con y sin provincia; admin trae las dos filas de rol), reemisión, canje, cambio de rol; `id`/`usuarioId` string → number; `vence` → `Date`; una deriva del contrato (campo faltante) lanza `ContratoInesperado`; `crearUsuario` y `emitirAccesoInicial` no envían `content-type` cuando no hay body

### Recuperación de la suite E2E por consecuencias de `007` (independientes de cada historia)

- [x] T012 Modificar `frontend/tests/e2e/login.spec.ts`: (a) fixture `REVOCADO` → cuenta **dada de alta que nunca fijó contraseña** (`crearUsuarioSinClave`), sin `pedirMagicLink`/`request.newContext` (esa premisa —credencial borrada por magic link con email sin verificar— ya no existe porque el alta administrada deja `emailVerified = true`); conservar la aserción "tres causas ⇒ mismo mensaje y `401`" y actualizar el comentario/evidencia; (b) test 3 (magic link `ENLACE`): dar de alta `ENLACE` con `crearUsuarioSinClave` antes de pedir el enlace (un email no dado de alta ya no genera enlace); (c) agregar test: pedir enlace para un email **no** dado de alta muestra el mismo `enlace-enviado` y **no** deja ningún enlace en el log del backend
- [x] T013 Modificar `frontend/tests/e2e/perfil.spec.ts` **solo el fixture de 23d** (`SIN`): darlo de alta con `crearUsuarioSinClave` antes de `pedirMagicLink`. (23a se reescribe en US4)
- [x] T014 **Checkpoint de la Fase 2**: correr `npm run test:e2e` **solo** de los 8 archivos que únicamente cambian por el helper (`accesibilidad`, `admin-organismos`, `admin-organismos-reales`, `comparacion-visual`, `editores`, `evidencia-visual`, `navegacion`, `sesion-vencida`) más `login` y `perfil` (23b–23d); deben pasar. Registrar el resultado y la verificación de la base (T060)
  - **Resultado (2026-09-25)**: los 15 archivos arrancan (los `beforeAll` pasan); suite completa 45 ✓ / 5 ✘ / 3 skipped / 8 not run. Las 5 fallas son de otras tareas o del entorno, no del helper: `login` 3 y `perfil` 23d necesitan `BACKEND_LOG` (T054), `perfil` 23a (T035), `recorrido-sc002` (T040), `unidades-asignaciones` pool en uso (T044) y `evidencia-visual` pool en uso (T044). `comparacion-visual` (3 tests) se saltea por diseño sin `VIEJA_URL`.

**Checkpoint**: la capa de API existe, la sesión se relee, los fixtures son reales y los E2E vuelven a poder crear usuarios.

---

## Phase 3: User Story 1 — (admin) Dar de alta a una persona y entregarle su acceso inicial (P1) 🎯 MVP

**Goal**: un admin da de alta (email, rol, provincia), ve el enlace de un solo uso con su vencimiento y puede emitir uno nuevo.

**Independent Test**: `quickstart.md` escenarios 1–3 (y la reemisión de US1-5).

### Tests for US1 ⚠️ (escribir primero, deben fallar)

- [x] T015 [P] [US1] Test unitario `frontend/tests/unit/routes/alta-usuario.test.tsx` (nuevo): provincia obligatoria para usuario normal y opcional para admin, **0 solicitudes** si no valida; email inválido; éxito muestra el enlace `…/primer-acceso#token=…`, el vencimiento y el aviso de un solo uso; cerrar **sin copiar** pide confirmación y copiar la evita; tras cerrar, `queryClient.getMutationCache().getAll()` **no contiene el token** y el estado del diálogo se descartó; el mensaje del servidor (duplicado, provincia inexistente) se muestra tal cual y no se da el alta por hecha (FR-001..FR-007)
- [x] T016 [US1] E2E `frontend/tests/e2e/alta-canje.spec.ts` (nuevo), parte US1 (escenarios 1–3 y reemisión): como admin, alta con provincia → enlace + vencimiento + aviso; la persona figura en la lista con esa provincia y rol (verdad independiente por SQL); email duplicado con otro casing → mensaje del servidor y el existente no cambia; cerrar sin copiar pide confirmación; "Emitir acceso nuevo" muestra un enlace distinto y el anterior deja de servir (verificar con `POST /api/acceso-inicial/canjear` del token viejo → `400`); un usuario **no admin** que abre `/admin/usuarios` recibe la pantalla de "no encontrado" (FR-007). Usar `context.grantPermissions(['clipboard-read','clipboard-write'])` para "Copiar enlace"

### Implementation for US1

- [x] T017 [US1] Crear `frontend/src/routes/admin/AltaUsuarioDialog.tsx`: `Dialog` de dos pasos con `react-hook-form` + `zod` (email, rol, `SelectCatalogo` de provincia; obligatoria si rol = usuario normal, opcional si admin; mensajes de `data-model.md`), paso 2 con el enlace armado como `` `${window.location.origin}/primer-acceso#token=${token}` ``, campo de solo lectura seleccionable, botón "Copiar enlace" (`navigator.clipboard.writeText`, con el campo seleccionado como respaldo), vencimiento formateado y aviso "se muestra una sola vez"; el resultado vive en **estado local** (no en el caché), `copiado` decide si `AlertDialog` pide confirmar al cerrar, y al cerrar se llama `reset()` de la mutación (`useCrearUsuario`, `gcTime: 0`). Errores del servidor junto al formulario. `data-testid`: `alta-usuario-dialog`, `enlace-acceso`, `copiar-enlace`, `vence-acceso`
- [x] T018 [US1] Modificar `frontend/src/routes/admin/AdminUsuariosPage.tsx`: botón "Dar de alta un usuario" que abre `AltaUsuarioDialog`, y por fila la acción "Emitir acceso nuevo" (`AlertDialog`: "el anterior dejará de servir") que usa `useEmitirAccesoInicial` y muestra el mismo paso de enlace (reutilizar el componente del paso 2 exportándolo desde `AltaUsuarioDialog.tsx`). **No** quitar todavía el aviso/control deshabilitado de rol (lo hace US3)
- [x] T019 [US1] Correr T015 y T016 hasta verde; anotar en la descripción del PR la evidencia (salida de las pruebas) y la verificación de la base (T060)

**Checkpoint**: un admin puede incorporar a alguien y compartir el enlace. **Sin US2 el enlace todavía no sirve** — US1 y US2 se entregan juntas.

---

## Phase 4: User Story 2 — Fijar mi contraseña y entrar por primera vez con el acceso inicial (P1) 🎯 MVP

**Goal**: pantalla pública que canjea el acceso, fija la contraseña e inicia sesión, sin filtrar información ni persistir secretos.

**Independent Test**: `quickstart.md` escenarios 4–7, 16 y 17.

### Tests for US2 ⚠️

- [x] T020 [P] [US2] Test unitario `frontend/tests/unit/routes/primer-acceso.test.tsx` (nuevo, `createMemoryRouter(rutas, { initialEntries: ['/primer-acceso#token=…'] })`): con token muestra el formulario y **quita el fragmento** de la ubicación (`replace`); sin token muestra el estado "acceso no válido" **sin formulario**; contraseña corta/larga/confirmación distinta → mensaje y **0 solicitudes**; éxito invalida la sesión y navega a `/organismos` con `replace`; **un solo mensaje** para `400 {"error":"El acceso inicial no es válido o venció."}` (usado/vencido/reemplazado/inventado) y para el token ausente, idéntico en texto y estructura; `400 PASSWORD_TOO_SHORT/LONG` es error del campo y **no** cambia a "acceso no válido"; error de red/5xx conserva el token en memoria para reintentar; con sesión previa muestra el aviso "continuar cierra la sesión actual" **antes** de enviar; **ni el token ni la contraseña quedan** en el caché de consultas ni de mutaciones; los campos usan `autoComplete="new-password"`
- [x] T021 [P] [US2] Test unitario `frontend/tests/unit/routes/rutas-publicas.test.tsx` (nuevo): `/primer-acceso` se renderiza **sin sesión** (sin redirigir a `/login`) y sin `AppLayout`; `/registro`, `/signup` y `/pools` caen en el comodín (con sesión → "no encontrado"; sin sesión → `/login`); no existe ningún enlace a `/primer-acceso` en el login (FR-015, FR-022 de `005`)
- [x] T022 [US2] E2E `frontend/tests/e2e/alta-canje.spec.ts`, parte US2 (escenarios 4–7): en un `browser.newContext()` **sin sesión** abrir el enlace real de un alta, elegir contraseña y confirmar ⇒ entra a `/organismos` con la provincia/rol asignados (`/api/auth/session` por `page.evaluate`), la URL final y el historial sin el fragmento, "atrás" no recupera el formulario, y luego se puede ingresar por `/login` con esa contraseña; reabrir el mismo enlace, uno vencido (`UPDATE auth.verification SET "expiresAt" = now() - interval '1 minute'`), uno reemplazado, uno inventado y uno **sin fragmento** ⇒ **la misma pantalla y el mismo texto** (comparar `textContent`) y 0 sesiones; contraseñas inválidas ⇒ mensaje antes de enviar (contar solicitudes a `/api/acceso-inicial/canjear` = 0); con otra sesión abierta ⇒ aviso previo y, al confirmar, entra la persona invitada; dos pestañas canjeando a la vez ⇒ solo una entra

### Implementation for US2

- [x] T023 [US2] Crear `frontend/src/routes/primer-acceso/PrimerAccesoPage.tsx`: pantalla completa como `LoginPage` (sin `AppLayout`, `<main>` propio); token leído **una vez** en el primer render con `useState(() => extraer(useLocation().hash))` y quitado con `navigate({ hash: '' }, { replace: true })` en un efecto idempotente; máquina de estados de `data-model.md` (`formulario`, `enviando`, `acceso no válido`, `éxito`, error transitorio); formulario con `react-hook-form` + `zod` (contraseña + confirmación, `CONTRASENA_MIN/MAX` de T003, `autoComplete="new-password"`); llama `canjearAccesoInicial` (T006) **directo** (sin `useMutation`); un único texto de "acceso no válido" **propio del cliente** ("Este enlace no es válido o venció. Pedile a un administrador que te genere uno nuevo."), sin distinguir causas ni consultar validez antes del envío; con sesión previa (`useSesion`) muestra el aviso antes de enviar; éxito → `invalidateQueries(CLAVE_SESION)` + `navigate('/organismos', { replace: true })`; limpia la contraseña al desmontar. `data-testid`: `primer-acceso-form`, `acceso-no-valido`, `aviso-sesion-existente`
- [x] T024 [US2] Modificar `frontend/src/routes.tsx`: agregar `{ path: '/primer-acceso', element: <PrimerAccesoPage /> }` **junto a `/login`**, fuera de `RequireAuth` (sin tocar guardas ni `main.tsx`; `research.md` Decisión 3); actualizar el comentario de la tabla (sigue sin existir `/registro`, `/signup`, `/pools`)
- [x] T025 [US2] E2E `frontend/tests/e2e/seguridad-acceso.spec.ts` (nuevo, escenarios 16 y 17): durante un canje real registrar todas las solicitudes (`page.on('request')`) y verificar que **ninguna URL ni cabecera `Referer`** contiene el acceso; `location.href` sin el acceso tras el primer render; `localStorage`, `sessionStorage` y `document.cookie` no contienen el acceso ni la contraseña; en el alta (admin) el enlace no aparece en `localStorage/sessionStorage` y no vuelve a mostrarse tras cerrar; `/registro`, `/signup`, `/pools` responden 404 con sesión y llevan a login sin ella
- [x] T026 [P] [US2] Modificar `frontend/tests/e2e/accesibilidad.spec.ts`: agregar `/primer-acceso` (con fragmento) y el diálogo de alta al recorrido de axe, con las mismas reglas que las demás pantallas
- [x] T027 [US2] Correr T020–T022, T025 y T026 hasta verde; registrar la evidencia y verificar la base (T060)

**Checkpoint**: ciclo completo alta → canje → sesión. **MVP desplegable de la Fase B = US1 + US2.**

---

## Phase 5: User Story 3 — (admin) Cambiar el rol y la provincia de un usuario (P2)

**Goal**: editar rol y provincia desde la lista con confirmación, mensajes del servidor y efecto inmediato.

**Independent Test**: `quickstart.md` escenarios 8–10.

### Tests for US3 ⚠️

- [x] T028 [P] [US3] Test unitario `frontend/tests/unit/routes/editar-usuario.test.tsx` (nuevo): otorgar rol admin **sin** confirmación; quitar rol admin **pide** confirmación antes de enviar; cada sección envía **una** solicitud (`PUT …/rol` o `PATCH …`) y no hay guardado parcial; el selector de provincia **no** ofrece "sin provincia"; un `400 {error}` (p. ej. `El sistema no puede quedarse sin administradores.`), `403` o `404` se muestra junto a la sección y la fila vuelve al estado real de la lista re-consultada (sin estado optimista); tras el éxito se invalidan `CLAVE_USUARIOS` y `CLAVE_SESION`; si el editado es el usuario de la sesión y pierde el rol, se navega a `/organismos` (FR-016..FR-022)
- [x] T029 [US3] Modificar `frontend/tests/e2e/admin-usuarios.spec.ts` (tests 21/22): reemplazar la verificación de "No disponible"/`aviso-rol` por el cambio real de rol y provincia, tomando la **verdad independiente por SQL** (`usuario_roles`, `usuarios.provincia_id`); conservar la comparación de la lista completa contra SQL; el aviso `aviso-rol` y el botón "No disponible" **ya no existen**
- [x] T030 [US3] E2E `frontend/tests/e2e/rol-provincia.spec.ts` (nuevo, escenarios 8–10): promover y degradar un usuario de fixtures (la lista lo refleja; quitar admin pide confirmación); **rechazo del último administrador** con `page.route` devolviendo el cuerpo literal `{"error":"El sistema no puede quedarse sin administradores."}` (`400`) ⇒ mensaje visible y fila en el estado real (**no** se degrada a ningún admin real: la regla real está cubierta por `backend/tests/integration/ultimo-admin.test.ts`); autodescenso de un admin de fixtures habiendo otro ⇒ pasa a `/organismos` y no ve las pantallas de admin; el admin cambia la provincia de una persona **con la app de ella abierta** y, en su siguiente pantalla (sin re-login), ve la provincia nueva y el alta de organismo la prellena; provincia inexistente (mock `400`) ⇒ mensaje sin cambios

### Implementation for US3

- [x] T031 [US3] Crear `frontend/src/routes/admin/EditarUsuarioDialog.tsx`: `Dialog` con **dos secciones independientes** (estado `idle | enviando | error(mensaje)` cada una): *Rol* (botón "Hacer administrador" / "Quitar rol de administrador"; `AlertDialog` de confirmación **solo** al quitar) con `useCambiarRol`, y *Provincia* (`SelectCatalogo` sin opción vacía + "Guardar provincia") con `useActualizarUsuario` (existente; invalida también `['sesion']`). Sin estado optimista: mostrar el rol/provincia de la lista consultada. Si `usuario.id === sesion.usuarioId` y el rol resultante deja de ser admin, `navigate('/organismos')` tras invalidar la sesión (`research.md` Decisión 6). `data-testid`: `editar-usuario-dialog`, `rol-actual`, `boton-cambiar-rol`, `provincia-guardar`, `error-rol`, `error-provincia`
- [x] T032 [US3] Modificar `frontend/src/routes/admin/AdminUsuariosPage.tsx`: agregar por fila el botón "Editar" que abre `EditarUsuarioDialog`; **quitar** el párrafo `aviso-rol`, la columna "Cambiar rol" con el botón deshabilitado "No disponible" y el comentario "SOLO LECTURA (007)"; la lista sigue mostrando email, nombre, provincia y roles
- [x] T033 [US3] Correr T028–T030 hasta verde; registrar evidencia y verificar la base (T060)

**Checkpoint**: gestión completa de rol/provincia; SC-006 y SC-007 medibles.

---

## Phase 6: User Story 4 — La provincia la asigna un administrador: perfil y alta de organismo (P2)

**Goal**: el usuario normal ve su provincia sin poder cambiarla y, si no tiene, se le indica a quién pedirla.

**Independent Test**: `quickstart.md` escenarios 11–12.

### Tests for US4 ⚠️

- [x] T034 [P] [US4] Test unitario `frontend/tests/unit/routes/perfil-provincia.test.tsx` (nuevo): usuario normal → provincia como **texto** (nombre del catálogo) con la nota "La asigna un administrador", sin control de selección; guardar el nombre envía un `PATCH` **sin** `provinciaId`; admin → selector editable; alta de organismo de un usuario normal sin provincia → texto "Pedile a un administrador que te asigne una provincia." **sin enlace** al perfil y sin formulario (`data-testid="alta-sin-provincia"`); un `403` por provincia muestra el mensaje del servidor
- [x] T035 [US4] Modificar `frontend/tests/e2e/perfil.spec.ts` (23a): reescribir a "la provincia se ve de solo lectura y guardar el nombre funciona sin enviar provincia" (capturar el cuerpo del `PATCH`), y agregar el caso admin (selector editable, cambio persistido por SQL). Conservar 23b–23d
- [x] T036 [US4] Modificar `frontend/tests/e2e/organismos.spec.ts` (test 8): el texto esperado pasa de `completar tu provincia` a `Pedile a un administrador que te asigne una provincia` y verificar que **no hay enlace** al perfil

### Implementation for US4

- [x] T037 [US4] Modificar `frontend/src/routes/perfil/PerfilPage.tsx`: para `sesion.rol === 'usuario_normal'` mostrar la provincia (nombre de `useProvincias`) como texto de solo lectura con la nota "La asigna un administrador" y **no** incluir `provinciaId` en el `PATCH` (`v.provinciaId` deja de enviarse); para admin conservar `SelectCatalogo` y el envío; actualizar el comentario "COALESCE"
- [x] T038 [US4] Modificar `frontend/src/routes/organismos/OrganismoNuevoPage.tsx`: cambiar el texto de `alta-sin-provincia` a "Pedile a un administrador que te asigne una provincia." y **quitar** el enlace al perfil; el prefill sigue saliendo de `sesion.provinciaId` (que ahora se relee, T007)
- [x] T039 [US4] Correr T034–T036 hasta verde; registrar evidencia y verificar la base (T060)

**Checkpoint**: coherencia con la regla de `007`; 0 cambios de provincia ofrecidos a un usuario normal.

---

## Phase 7: User Story 5 — Recorrido completo de una persona nueva (P2)

**Goal**: SC-002 redefinido: el recorrido parte de una persona dada de alta por un admin con provincia asignada.

**Independent Test**: `quickstart.md` escenario 13.

- [x] T040 [US5] Reescribir `frontend/tests/e2e/recorrido-sc002.spec.ts` (SC-002 de `008`): un admin de fixtures da de alta a la persona **con provincia** por la UI (`/admin/usuarios`); la persona abre el enlace en un contexto sin sesión, elige contraseña, y **en la misma sesión** da de alta un organismo y completa la taxonomía aplicable, contando acciones del usuario, recargas de documento (`framenavigated` de tipo documento tras entrar = 0) y pasos de elección de provincia (= 0); conservar la escritura de evidencia (`SC002_EVIDENCIA`) y `fixturesRestantes`
- [x] T041 [P] [US5] Anotar en `specs/005-frontend-cliente/spec.md` (SC-002) y en `specs/005-frontend-cliente/research.md` que ese criterio fue **redefinido por `008-frontend-identidad-fase-b` (2026-09-25)**, **sin borrar** el texto original (mismo criterio de historial que G1/G3/G5/G6)
- [x] T042 [US5] Correr T040 hasta verde; registrar la evidencia (`test-results/`) y verificar la base (T060)

**Checkpoint**: US1 + US2 + US4 componen un recorrido real de punta a punta.

---

## Phase 8: User Story 6 — El borrado de un pool en uso explica qué pasó (P3)

**Goal**: mostrar el mensaje del `400` del servidor; eliminar la detección obsoleta de `500`/`23503`.

**Independent Test**: `quickstart.md` escenario 14.

### Tests for US6 ⚠️

- [x] T043 [P] [US6] Modificar `frontend/tests/unit/api/unidades-asignaciones-pools.test.ts`: reemplazar el describe "borrado de un pool en uso (brecha G6)" (500 + `23503` → `PoolEnUsoError`) por: `400 {"error":"El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes de eliminarlo."}` → `eliminarPool` rechaza con `ApiError` cuyo `message` es **ese texto** (fixture real `error-pool-en-uso.json` de T010); `403` sigue siendo `ApiError` 403; `204` = borrado; **no** existe `PoolEnUsoError` (import removido)
- [x] T044 [US6] Modificar `frontend/tests/e2e/unidades-asignaciones.spec.ts` (test "borrado de pool en uso") **y `frontend/tests/e2e/evidencia-visual.spec.ts` (captura "borrar un pool en uso (500 real)", que también espera el `500`; hallazgo de T014)**: esperar `[400]`, el cuerpo con el texto real del servidor, ese mismo texto en `mensaje-pools` (ya **no** `puede estar asignado a otras unidades funcionales`), el pool aún en la base; luego quitar la asignación y verificar que el borrado prospera (204)

### Implementation for US6

- [x] T045 [US6] Modificar `frontend/src/api/pools.ts`: `eliminarPool` pasa a `await http(\`/api/pools-jueces/${id}\`, { method: 'DELETE' })` **sin** `try/catch`; **eliminar** la clase `PoolEnUsoError` y el comentario de la brecha G6 (Principio XI); verificar con `grep -rn "PoolEnUsoError" frontend/src frontend/tests` que no queda ninguna referencia
- [x] T046 [US6] Modificar `frontend/src/features/asignaciones/PoolsPanel.tsx`: actualizar el comentario obsoleto de `borrar()` ("el backend responde 500… brecha G6") por uno que diga que el rechazo de `007` llega como `400 {error}` y `ApiError.message` ya trae el texto del servidor; **sin cambiar la lógica** (ya renderiza `err.message`)
- [x] T047 [US6] Correr T043 y T044 hasta verde; registrar evidencia y verificar la base (T060)

**Checkpoint**: 0 inferencias de causa desde códigos genéricos en pools.

---

## Phase 9: User Story 7 — Un rechazo de taxonomía señala la pregunta con problema (P3)

**Goal**: resaltar la pregunta que el servidor indica (`preguntaCodigo`), sin buscar el código dentro del texto.

**Independent Test**: `quickstart.md` escenario 15.

### Tests for US7 ⚠️

- [x] T048 [P] [US7] Modificar `frontend/tests/unit/features/taxonomia/TaxonomiaForm.test.tsx`: `400 {"error":"…","preguntaCodigo":"<código del catálogo>","preguntaTexto":"…"}` → esa pregunta queda con `data-invalid="true"` y se muestra el mensaje completo; **sin** `preguntaCodigo` (`Pregunta(s) inexistente(s): …`) → solo el mensaje, **ninguna** resaltada; `preguntaCodigo` que **no está** en el formulario → solo el mensaje y sin fallar; un mensaje que cite el código pero **sin** el campo estructurado **no** resalta (se acabó la búsqueda en el texto); usar el fixture real `error-taxonomia-pregunta.json`
- [x] T049 [P] [US7] Modificar `frontend/tests/unit/features/taxonomia/mezclar.test.ts`: eliminar el `describe('preguntasDelError', …)` y su import (la función se borra en T051)
- [x] T050 [US7] Modificar `frontend/tests/e2e/taxonomia.spec.ts`: 13 (deriva real de tipo, Protección A) conserva la aserción `no aplica al tipo de organismo` y agrega verificar `preguntaCodigo` en la respuesta y que **esa** pregunta queda resaltada (`data-invalid="true"`); 13b (mock de red) pasa a mockear el cuerpo estructurado `{error, preguntaCodigo, preguntaTexto}` y agrega el caso mock sin `preguntaCodigo` (nada resaltado)

### Implementation for US7

- [x] T051 [US7] Crear `frontend/src/features/taxonomia/errorTaxonomia.ts` con `preguntaDelError(e: unknown): string | null` (esquema zod mínimo `{ preguntaCodigo?: string, preguntaTexto?: string }` sobre `ApiError.cuerpo`, con `safeParse`, nunca lanza), modificar `frontend/src/features/taxonomia/TaxonomiaForm.tsx` (línea del `catch`: `resaltadas` = la pregunta indicada **solo** si existe en `catalogo`, para `status === 400`) y **eliminar** `preguntasDelError` de `frontend/src/features/taxonomia/mezclar.ts` (Principio XI); verificar con `grep -rn "preguntasDelError" frontend/src frontend/tests` que no quedan referencias
- [x] T052 [US7] Correr T048–T050 hasta verde; registrar evidencia y verificar la base (T060)

**Checkpoint**: las siete historias completas.

---

## Phase 10: Polish & Cross-Cutting

- [x] T053 [P] Modificar `frontend/tests/e2e/evidencia-visual.spec.ts`: regenerar `admin-usuarios.png` con la UI nueva y agregar capturas del diálogo de alta (paso del enlace) y de `/primer-acceso`, **con datos anonimizados** (sin emails/nombres reales; el enlace con el token **redactado o recortado** en la imagen); revisar las imágenes antes de comitear (D15)
- [x] T054 [P] Actualizar `frontend/README.md` (o el archivo de docs del frontend que ya describa los E2E): prerrequisitos del entorno hallados en T014 —`VITE_DATASTUDIO_URL=https://datastudio.example.test/reporte` al arrancar Vite, `BACKEND_LOG` (stdout del backend) para los tests de magic link, `VIEJA_URL` para `comparacion-visual`, y librerías/fuentes del sistema para Chromium (sin ninguna fuente instalada el texto no se dibuja y Playwright ve los elementos como ocultos)— y cómo correr los E2E con el flujo nuevo (arranque por SQL del admin de fixtures + alta + canje), la variable `BETTER_AUTH_URL=http://localhost:5173` en el backend y la limpieza por prefijo
- [x] T055 [P] Modificar `docs/plan-camino-a-produccion.md` (Fase B): marcar como hechos los ítems que esta feature cubre (asignar rol y provincia, alta administrada, provincia de solo lectura, re-verificar SC-002, `PoolEnUsoError`), dejando **T030** (Google) pendiente, sin borrar el texto original
- [x] T056 Correr la validación completa desde `frontend/`: `npx tsc -b --noEmit`, `npm run lint`, `npx vitest run` (debe superar los 152 tests de partida) y **toda** la suite `npm run test:e2e` (los 60 originales actualizados + los nuevos); pegar el resumen en la descripción del PR
- [x] T057 Recorrer los **18 escenarios** de `specs/008-frontend-identidad-fase-b/quickstart.md`, marcando cuáles cubre cada prueba automática; los que solo se pueden ver a mano (portapapeles real, sesión tras el canje vía proxy) verificarlos en un navegador y registrarlos
- [x] T058 Correr `/security-review` sobre el diff (foco: pantalla pública, fragmento, caché de TanStack Query, `Referer`, storage, texto único de acceso no válido)
- [x] T059 Revisar que **ningún** archivo nuevo o modificado contenga datos de personas reales ni tokens/cookies: `git diff` + `grep -rnE "gmail\.com|Bearer |better-auth\.session_token=[A-Za-z0-9]" frontend/tests/unit/api/fixtures frontend/scripts docs specs/008-frontend-identidad-fase-b` (esperado: sin coincidencias reales)
- [x] T060 Verificación final de la base (repetir tras cada corrida E2E): `usuarios` = 47, administradores reales = 3, **0** filas `test-frontend-%` en `usuarios`/`auth."user"`/`organismos`/`grupos_jueces`, **0** filas `reset-password:*` residuales; si algo quedó, limpiar con `limpiarFixtures()` y corregir la causa en el helper
- [x] T061 Escribir `docs/resultado-verificacion-frontend-fase-b-<fecha>.md` con la evidencia real (conteos de tests, salida de los E2E clave, resultado de T057/T060, hallazgos y desvíos), con tokens redactados y datos anonimizados; registrar allí también lo **no** verificado, si queda algo

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → historias → **Polish (10)**.
- Foundational bloquea todo: T005/T006 (API) antes de cualquier componente; T008–T010 (fixtures) antes de T011 y de los tests unitarios que los usan (T043, T048); T009 (helper E2E) antes de **todos** los E2E; T014 (checkpoint) cierra la fase.

### User Story Dependencies

- **US1 (P1)** y **US2 (P1)**: independientes en código (los E2E de US2 usan el alta del helper, no la UI de US1), pero **se entregan juntas** (el enlace de US1 no sirve sin US2).
- **US3 (P2)**: tras Foundational; comparte `AdminUsuariosPage.tsx` con US1 ⇒ hacerla **después** de T018.
- **US4 (P2)**: independiente (perfil y alta de organismo); usa T007 para el prefill vigente.
- **US5 (P2)**: depende de US1 + US2 + US4 (recorrido completo).
- **US6 (P3)** y **US7 (P3)**: independientes entre sí y del resto.

### Within Each Story

- Tests (deben fallar) → implementación → correr hasta verde → verificar la base.

## Parallel Opportunities

- Foundational: T003, T004 y T006 en paralelo; T011 en paralelo con T012/T013 una vez hecho T010.
- Tests de cada historia marcados `[P]` (archivos distintos): T015 ∥; T020 ∥ T021; T034 ∥; T043 ∥; T048 ∥ T049.
- Con más de una persona tras Foundational: A → US1 → US3 (mismo archivo de página), B → US2 → US5, C → US4, D → US6 y US7.
- Polish: T053, T054 y T055 en paralelo.

### Parallel Example: User Story 2

```text
Task: "Test unitario de la pantalla de canje en frontend/tests/unit/routes/primer-acceso.test.tsx (T020)"
Task: "Test unitario de rutas públicas en frontend/tests/unit/routes/rutas-publicas.test.tsx (T021)"
```

## Implementation Strategy

### MVP (mínimo desplegable de la Fase B)

1. Setup + Foundational (incluye recuperar la suite E2E).
2. **US1 + US2** juntas: alta administrada + canje público → **validar** `quickstart.md` 1–7, 16 y 17.
3. **Detenerse y validar** antes de seguir: es lo que desbloquea incorporar usuarios reales desde la aplicación.

### Entrega incremental

1. + US3 (rol y provincia) → 2. + US4 (perfil/alta de organismo coherentes) → 3. + US5 (recorrido redefinido, verificación integrada) → 4. + US6 y US7 (mensajes claros) → Polish.

## Notes

- Cada prueba E2E limpia por prefijo `test-frontend-`; nunca tocar los 47 usuarios reales ni los 3 administradores reales (por eso el rechazo del último administrador se prueba con `page.route`).
- El servidor decide identidad, rol y provincia (Principio II): las guardas y confirmaciones son UX.
- Mostrar el mensaje del servidor **tal cual** en los rechazos; no deducir causas de códigos genéricos.
- Commit por tarea o grupo lógico; no commitear fixtures ni evidencia sin pasar T059.
