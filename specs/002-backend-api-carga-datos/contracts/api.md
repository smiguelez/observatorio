# API Contract: Backend/API — autorización y carga de datos

Feature `002-backend-api-carga-datos`. Contrato de endpoints — la forma
exacta de payloads/columnas la define `data-model.md` y
`001-modelo-datos-relacional`; este documento fija **rutas, verbos,
autenticación requerida y la regla de autorización exacta** (referenciando
el FR de `spec.md`), para que los tests de contrato puedan escribirse antes
de que exista implementación.

Convención: todo endpoint devuelve `401` si no hay sesión válida (FR-004),
sin excepción — no hay endpoint público en este contrato. `403` es el
código para "autenticado pero no autorizado para este recurso puntual"
(FR-003: rechazo explícito y distinguible, nunca una degradación
silenciosa como un 200 con datos vacíos).

## Autenticación (Better Auth — research.md Decisión 2)

Estas rutas las expone la propia librería; se listan por completitud del
contrato, no se re-implementan a mano.

| Método | Ruta (base `/api/auth/*`) | Descripción | Principio/FR |
|---|---|---|---|
| POST | `/sign-up/email` | Alta con credenciales locales | III, FR-005, FR-006 |
| POST | `/sign-in/email` | Login con credenciales locales | III, FR-005 |
| POST | `/sign-in/social` (body `{"provider":"google"}`) | Inicio de flujo Google OAuth — devuelve `{url, redirect:true}` para redirigir al navegador, no un 302 directo | III, FR-005 |
| GET | `/callback/google` | Callback de Google OAuth | III, FR-005, FR-009 |
| POST | `/sign-in/magic-link` | Solicitar magic link (envío por email) | III, FR-005, FR-007 |
| GET | `/magic-link/verify` | Verificar/consumir el magic link | FR-007, SC-006 |
| POST | `/sign-out` | Cerrar la sesión activa | — |
| GET | `/get-session` | Devuelve la sesión activa (o 401) | FR-002 |

**Contrato de comportamiento** (no de forma de payload, eso lo fija Better
Auth): un login exitoso por cualquiera de los tres métodos con un email ya
verificado en otro método **MUST** devolver una sesión asociada al mismo
`usuarios.id` (FR-009, SC-004) — este es un caso de prueba de contrato, no
solo de integración.

## Organismos (FR-012, FR-013)

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| GET | `/api/organismos` | lista solo los organismos donde el usuario es propietario, editor, o todos si es admin | FR-012 |
| GET | `/api/organismos/:id` | propietario, editor, o admin del organismo `:id`; si no, `403` (no `404` — no se oculta la existencia, se rechaza el acceso, igual que la regla real `allow get: if esOwnerOEditor(...)`) | FR-012 |
| POST | `/api/organismos` | cualquier autenticado; el body **MUST NOT** poder fijar `propietario_id` a otro usuario — el servidor lo fuerza al `usuarios.id` de la sesión, ignorando cualquier valor que venga en el body | FR-013 |
| PATCH | `/api/organismos/:id` | propietario, editor, o admin | FR-012 |
| DELETE | `/api/organismos/:id` | propietario, editor, o admin | FR-012 |

## Unidades funcionales y taxonomía (FR-014 — heredan la del organismo padre)

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| GET/POST | `/api/organismos/:orgId/unidades-funcionales` | idéntica a `GET/PATCH /api/organismos/:orgId` — se resuelve contra el organismo padre, no contra la UF | FR-014 |
| GET/PATCH/DELETE | `/api/organismos/:orgId/unidades-funcionales/:ufId` | idéntica a la del organismo `:orgId` | FR-014 |
| GET/PUT | `/api/organismos/:orgId/taxonomia` | idéntica a la del organismo `:orgId` (1:1, no hay lista) | FR-014 |

**Caso de contrato explícito** (Edge Case de spec.md): `POST
/api/organismos/:orgId/unidades-funcionales` con un `:orgId` ajeno **MUST**
devolver `403`, incluso si quien llama es propietario de **otro**
organismo — no hay excepción "porque ya es propietario de algo".

## Grupos de jueces / pools (FR-015)

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| GET | `/api/pools-jueces` | lista solo los pools de la provincia del usuario, o todos si es admin | FR-015 |
| GET | `/api/pools-jueces/:id` | provincia del pool == provincia del usuario, o admin | FR-015 |
| POST | `/api/pools-jueces` | el body **MUST** traer una `provincia` igual a la del usuario, o el usuario **MUST** ser admin — si no, `403` | FR-015 |
| PATCH | `/api/pools-jueces/:id` | provincia del pool == provincia del usuario, o admin | FR-015 |
| DELETE | `/api/pools-jueces/:id` | provincia del pool == provincia del usuario, o admin | FR-015 |

## Usuarios (FR-016, FR-017)

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| GET | `/api/usuarios` | cualquier autenticado (visibilidad amplia confirmada) | FR-017 |
| GET | `/api/usuarios/:id` | cualquier autenticado, perfil completo (email, rol, provincia) | FR-017 |
| PATCH | `/api/usuarios/:id` | solo el propio usuario (`:id == usuarios.id` de la sesión) o admin | FR-016 |

## Localidades (FR-018, FR-019)

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| GET | `/api/localidades` | cualquier autenticado | FR-018 |
| GET | `/api/localidades/:id` | cualquier autenticado | FR-018 |
| POST/PATCH/DELETE | `/api/localidades*` | **no existen en este contrato** — 0 rutas de escritura; el mantenimiento es un proceso separado (FR-019) | FR-019 |

## Matriz de pruebas de contrato obligatorias (deriva de Success Criteria)

Cada fila de esta tabla es, como mínimo, un test de contrato (no de
implementación) — referencia directa a `spec.md`:

| Escenario | Resultado esperado | SC |
|---|---|---|
| Sin sesión, cualquier ruta de arriba salvo `/api/auth/*` de alta/login | `401` | SC-005 |
| Usuario sin relación con un organismo intenta `GET/PATCH/DELETE` sobre él | `403` | SC-002 |
| Usuario de provincia X sobre pool de provincia Y (no admin) | `403` | SC-003 |
| Usuario de provincia X sobre pool de provincia X | `200`/`204` según verbo | SC-003 |
| Admin sobre cualquier organismo/pool ajeno | `200`/`204` | SC-002, SC-003 |
| Login por método A, luego por método B con el mismo email ya vinculado | misma `usuarios.id` en `/api/auth/get-session` | SC-004 |
| Magic link reutilizado o vencido | `302` a `errorCallbackURL` con `?error=INVALID_TOKEN` en `/api/auth/magic-link/verify` (no `200`) — verificado en `backend/tests/integration/magic-link.test.ts` | SC-006 |
| `POST /api/organismos` con `propietario_id` distinto al del caller en el body | se ignora el body, se crea con el caller como propietario (no error, no lo respeta) | FR-013 |
