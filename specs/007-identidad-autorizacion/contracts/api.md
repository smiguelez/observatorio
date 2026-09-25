# Contrato de API: identidad y autorización (007)

Feature `007-identidad-autorizacion`. **Extiende** `002/contracts/api.md`,
`004/contracts/api.md` y `006/contracts/api.md`; no repite lo que no cambia.
Convenciones heredadas: `401` sin sesión (sin excepción salvo lo indicado),
`403` autenticado sin permiso, cuerpo de error `{ "error": string }` para las
rutas de dominio y `{ "code", "message" }` para `/api/auth/*` (Better Auth).
Los recursos **nuevos** usan camelCase; los ids `bigint` viajan como **string**
(D13/D17, sin cambios).

## 1. Usuarios — operaciones nuevas y cambiadas

| Método | Ruta | Autorización | FR |
|---|---|---|---|
| POST | `/api/usuarios` | **solo admin** | FR-016, 019, 021 |
| POST | `/api/usuarios/:id/acceso-inicial` | **solo admin** | FR-016, 019 |
| PUT | `/api/usuarios/:id/rol` | **solo admin** | FR-012–015 |
| PATCH | `/api/usuarios/:id` | el propio usuario o admin; **`provinciaId` solo admin** | FR-008–011 |
| POST | `/api/acceso-inicial/canjear` | **pública** (sin sesión; ver nota) | FR-017, 022 |

### `POST /api/usuarios` — alta administrada

Body:
```json
{ "email": "persona@ejemplo.org", "rol": "usuario_normal", "provinciaId": 3, "nombreDisplay": "Opcional" }
```
- `email`: formato válido, se normaliza (minúsculas, sin espacios).
- `rol`: `"usuario_normal"` o `"admin"`.
- `provinciaId`: **obligatoria** si `rol` es `usuario_normal`; opcional (o `null`) si es `admin`.

`201`:
```json
{ "id": "1401", "email": "persona@ejemplo.org", "provinciaId": 3, "roles": ["usuario_normal"],
  "accesoInicial": { "token": "<alta entropía>", "vence": "2026-09-26T14:00:00.000Z" } }
```
`accesoInicial.token` es **la única vez** que el sistema lo entrega: el administrador se
lo hace llegar a la persona (sin correo, Fase C). Se recomienda armar el enlace con el
token en el **fragmento** (`…/primer-acceso#token=<token>`), no en la query.

Errores (`400`, salvo indicado): email inválido · `"Ese email ya está dado de alta."`
(sin modificar al existente) · rol inválido · `"La provincia es obligatoria para un usuario normal."` ·
`"La provincia indicada no existe."` · `403` no admin · `401`.
Atómico: ante cualquier rechazo, **0 filas** en `usuarios`, `usuario_roles`, `auth.user`.

### `POST /api/usuarios/:id/acceso-inicial` — reemitir

Sin body. `201 { "token": "…", "vence": "…" }`. Invalida el acceso inicial anterior de
ese usuario (FR-019). `404 { error }` si el usuario no existe; `403` no admin.

### `PUT /api/usuarios/:id/rol`

Body `{ "rol": "admin" | "usuario_normal" }` (= "es admin / no es admin"; la fila
`usuario_normal` se conserva siempre). `200 { "id": "…", "roles": ["usuario_normal","admin"] }`.
Rige en la **siguiente** solicitud del usuario afectado, sin re-login (FR-013).

Errores: `403` no admin · `404` usuario inexistente · `400` rol inválido ·
`400 "El sistema no puede quedarse sin administradores."` si la operación
dejaría 0 admins (incluye que el último se quite el rol a sí mismo).

### `PATCH /api/usuarios/:id` — cambio respecto de `002`

Body sin cambios (`nombreDisplay?`, `provinciaId?`, `fotoUrl?`). Nuevas reglas:

| Quién | `provinciaId` | Resultado |
|---|---|---|
| admin | cualquiera válido | se guarda; rige desde la siguiente solicitud del afectado |
| admin | inexistente | `400 "La provincia indicada no existe."` |
| no admin (sobre sí mismo) | **distinta** de la actual (incluye `null`→valor) | **`403 { "error": "La provincia de un usuario solo la puede asignar un administrador." }`** y **no se aplica nada** de la solicitud |
| no admin | **igual** a la actual | no es un cambio: se procesa el resto; la respuesta refleja la provincia sin cambios (FR-010) |
| no admin (sobre otro usuario) | — | `403` (regla de `002`, sin cambios) |

Nunca `200` con un cambio ignorado (FR-009).

### `POST /api/acceso-inicial/canjear` — canje (público)

Body `{ "token": "…", "password": "…" }`. `200 { "usuarioId": "1401" }` **más
`Set-Cookie` de sesión** (queda con sesión iniciada, FR-017). La contraseña queda
fijada; los demás métodos siguen disponibles (FR-020).

Errores (uniformes, no distinguen causa): `400 { "error": "El acceso inicial no es válido o venció." }`
(token inexistente, usado, vencido o reemplazado) · `400 { "error", "code": "PASSWORD_TOO_SHORT" | "PASSWORD_TOO_LONG" }`
(la política se valida **antes** de mirar el token, para no filtrar su validez).

> **Nota — única ruta de dominio sin `401`.** No hay sesión antes del canje. Se agrega a la
> lista de excepciones del hook global de `app.ts` junto con `/api/auth/*`. Se apoya en
> un token de un solo uso, alta entropía y vencimiento; el rate limiting de login sigue
> pendiente (D10, Fase E). El endpoint público de Better Auth `POST /api/auth/reset-password`
> **sigue alcanzable** con el mismo token (mismo mecanismo, sin iniciar sesión); no se cierra
> porque es el que usa la librería.

## 2. Superficie de autenticación (`/api/auth/*`) — qué cambia

| Ruta | Antes | Ahora |
|---|---|---|
| `POST /sign-up/email` | crea usuario con cualquier email | **`400 EMAIL_PASSWORD_SIGN_UP_DISABLED`** siempre (HTTP y API de servidor) |
| `POST /sign-in/social` + `GET /callback/google` (email **no** provisionado) | crea usuario | rechazo: los flujos de navegador **redirigen** a `errorCallbackURL?error=ACCESO_NO_AUTORIZADO&error_description=No+se+pudo+iniciar+sesi%C3%B3n+con+este+email.`; el flujo con `idToken` responde `403 { code:"ACCESO_NO_AUTORIZADO", message }`. **0 filas** creadas |
| `POST /sign-in/magic-link` (email no provisionado) | crea token y registra el enlace | **`200 { status: true }` idéntico** al de un email provisionado, pero **no** se registra ni envía ningún enlace utilizable (FR-003) |
| `GET /magic-link/verify` (usuario **provisionado**, primer ingreso) | crea `usuarios` si faltaba | crea `auth.user` con `id = usuarios.id` y sesión; no toca `usuarios` |
| `POST /sign-in/email` | igual | igual (mensaje único, sin cambios) |
| `POST /change-password` | igual; cerrar sesiones dependía del cliente | el servidor **fuerza** `revokeOtherSessions`: todas las sesiones se revocan, se crea una nueva y se entrega en **`Set-Cookie`** (la cookie de sesión **rota**); la contraseña anterior deja de servir |
| `POST /request-password-reset` | `400 RESET_PASSWORD_DISABLED` | igual, **a propósito** (habilitarlo requiere envío de correo: Fase C) |

Código de rechazo de ingreso: **`ACCESO_NO_AUTORIZADO`**, con descripción **uniforme** que
no revela si el email existe. Un usuario sin credencial que intenta `change-password`
recibe el error propio de Better Auth (`400`, cuenta `credential` inexistente): la
forma de tener contraseña es el acceso inicial.

## 3. Taxonomía — forma del rechazo (`PUT /api/organismos/:orgId/taxonomia`)

`400 { "error": string, "preguntaCodigo": string, "preguntaTexto": string }` para todo rechazo
originado en una regla de integridad de las respuestas. **Sin ids internos ni nombres de tablas.**

| Caso | `error` (ejemplo) |
|---|---|
| La pregunta no aplica al tipo del organismo | `La pregunta «insercion_institucional» no aplica al tipo de organismo actual.` |
| Opción que no pertenece a la pregunta / inexistente | `La opción «Z» no existe para la pregunta «insercion_institucional».` |
| Valor de un tipo que la pregunta no admite | `La pregunta «autonomia» admite una opción; se recibió un valor de otro tipo.` |
| Dos respuestas a una pregunta de opción única | `La pregunta «autonomia» admite una sola respuesta.` |
| Pregunta inexistente | (sin cambios de `004`) `Pregunta(s) inexistente(s): a, b` |

`preguntaTexto` es el `texto` cargado; **hoy coincide con el código** (D19, dato aún sin
cargar). Si hay varias respuestas inválidas se informa al menos la primera (spec, US7-4).
La misma forma aplica al `400` de Protección A. Los rechazos de `PATCH /api/organismos/:id`
(Protección B) **no cambian** (ya listaban códigos y textos).

## 4. Rechazos de integridad — manejador central (D16)

Todo error de clase 23 de Postgres causado por datos del cliente responde
**`400 { "error": string }`** con un mensaje del mapa; lo inesperado sigue siendo `500`.
`23503` se desambigua por **método HTTP**: `DELETE` ⇒ "en uso", el resto ⇒ "no existe".

| Constraint (27 FK relevadas; solo las alcanzables por el cliente) | Mensaje |
|---|---|
| `unidad_funcional_grupo_jueces_grupo_jueces_id_fkey` — `DELETE /api/pools-jueces/:id` | `El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes de eliminarlo.` |
| `unidad_funcional_grupo_jueces_grupo_jueces_id_fkey` — alta de asignación | `El pool de jueces indicado no existe.` (sin cambios de `006`) |
| `unidades_funcionales_localidad_id_fkey` — `POST`/`PATCH` UF | `La localidad indicada no existe.` |
| `unidades_funcionales_tipo_uf_id_fkey` | `El tipo de unidad funcional indicado no existe.` |
| `organismos_denominacion_simplificada_id_fkey` | `La denominación simplificada indicada no existe.` |
| `organismos_tipo_oficina_id_fkey` | `El tipo de oficina indicado no existe.` |
| `organismos_provincia_id_fkey`, `grupos_jueces_provincia_id_fkey`, `usuarios_provincia_id_fkey` | `La provincia indicada no existe.` |
| `usuario_roles_rol_id_fkey` | `El rol indicado no existe.` |
| `organismo_editores_usuario_id_fkey` | `El usuario indicado no existe.` (sin cambios) |
| `usuarios_email_key` (UNIQUE) | `Ese email ya está dado de alta.` |
| `organismo_editores_pkey`, `unidad_funcional_grupo_jueces_unidad_funcional_id_grupo_jue_key` | (sin cambios de `006`) |
| cualquier otro `23503` / `23505` / `23514` / `23502` | mensajes **genéricos** por tipo ("el dato indicado no existe" / "ya existe" / "valor fuera de lo permitido" / "falta un dato"), sin nombres de tablas ni columnas |

Los `try/catch` locales de las rutas se quitan; el mapa vive en un solo lugar
(`http/errores-integridad.ts`).

## 5. Impacto en clientes existentes (no es alcance, es consecuencia)

- **`frontend/` (005)**: (a) el formulario de perfil sigue funcionando mientras reenvíe la
  provincia **actual**; un cambio de provincia dará `403`; (b) las **pruebas E2E** de
  `frontend/tests/e2e/helpers/backend.ts` (`crearUsuarioConClave`) crean usuarios por
  `sign-up/email`, que deja de existir: hay que darlos de alta por `POST /api/usuarios` y
  canjear el acceso; (c) el cliente tiene que aceptar la **rotación de la cookie** al cambiar
  la contraseña; (d) el rechazo de ingreso llega como `?error=ACCESO_NO_AUTORIZADO` (ya
  manejado como mensaje genérico).
- **`backend/tests/`**: `crearUsuarioDePrueba` y los tests de auth se reescriben (research,
  Decisión 10).
- **Fase B** (frontend): pantallas de alta administrada, de rol/provincia y de primer acceso
  consumen este contrato.
