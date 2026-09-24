# Contrato consumido: formas reales de las respuestas del backend

Feature `005-frontend-cliente`. Este documento **no define** endpoints —
fija la forma exacta que el cliente espera y cómo la normaliza. Fuente: código
de `reformulacion` (`backend/src/routes/*.ts`), leído el 2026-09-23. Los
`contracts/api.md` de `002`/`004`/`006` documentan rutas y autorización pero
**no** la forma de las respuestas; ante una divergencia gana el código y se
corrige este archivo.

Convenciones del cliente
- Base: rutas relativas `/api/...` (ver research.md, Decisión 3).
- Errores: `{ "error": string }` (+ `preguntasQueSePerderian` en un caso). Los
  de Better Auth (`/api/auth/*`) son `{ code, message }`.
- `204` = sin cuerpo (DELETE): no llamar `.json()`.
- `UsuarioId` = `string` (bigint serializado); en cuerpos de `POST` se envía
  `Number(id)`.
- "snake" = la respuesta viene en snake_case y el mapper la pasa a camelCase.

## Sesión y autenticación

| Uso | Llamada | Respuesta |
|---|---|---|
| Identidad del cliente (rol, provincia) | `GET /api/auth/session` | `200 { usuarioId: string, rol: "usuario_normal"\|"admin", provinciaId: number\|null }` · `401 { error }` |
| Login contraseña | `authClient.signIn.email({email,password,callbackURL:"/"})` | error `INVALID_EMAIL_OR_PASSWORD` para credencial errónea **y** para credencial revocada (indistinguibles — brecha G2) |
| Login Google | `authClient.signIn.social({provider:"google",callbackURL:"/"})` | `{url, redirect:true}`; el cliente navega a `url` |
| Magic link (pedir) | `authClient.signIn.magicLink({email,callbackURL:"/",errorCallbackURL:"/login"})` | `200`; el email es un placeholder (G4) |
| Magic link (consumir) | navegación a `/api/auth/magic-link/verify?...` | vencido/reusado → `302` a `errorCallbackURL?error=INVALID_TOKEN` |
| Cerrar sesión | `authClient.signOut()` | — |
| Métodos vinculados | `authClient.listAccounts()` | lista con `providerId` (`credential`, `google`, …) |
| Cambiar contraseña | `authClient.changePassword({currentPassword,newPassword})` | solo si existe cuenta `credential` (G3) |

## Catálogos (cualquier autenticado, solo lectura, sin paginación)

`GET /api/provincias | /api/denominaciones-simplificadas | /api/tipos-oficina | /api/tipos-uf | /api/fueros`
→ `[{ id: number, nombre: string }]` (orden por `id`).

`GET /api/localidades` → `[{ id, nombre, provincia_id, latitud, longitud }]` (snake; **todas**, sin filtro).

Se cargan una vez por sesión (`staleTime: Infinity`).

## Organismos

| Llamada | Respuesta |
|---|---|
| `GET /api/organismos` | `[{ id: number, denominacion: string, propietario_id: string }]` (snake) — propios + los que edita; admin: todos |
| `POST /api/organismos` body `{denominacion, denominacionSimplificadaId, tipoOficinaId, provinciaId}` (todos obligatorios, enteros salvo denominación) | `201 { id, denominacion, propietario_id }` · el body no puede fijar propietario |
| `GET /api/organismos/:id` | `SELECT *` de `organismos` (snake): incluye al menos `id, denominacion, denominacion_simplificada_id, tipo_oficina_id, provincia_id, propietario_id, estado_fueros, actualizado_a, firestore_id`. **Los campos exactos los define `db/schema.sql`; el mapper solo declara los que el cliente usa.** · `403` no autorizado · `404` |
| `PATCH /api/organismos/:id` body parcial + `confirmarPerdidaTaxonomia?: boolean` | `200 { id, denominacion, propietario_id }` · **`400 { error, preguntasQueSePerderian: [{codigo,texto}] }`** si cambiar `tipoOficinaId` dejaría respuestas sin aplicar y no vino la confirmación (Protección B) |
| `DELETE /api/organismos/:id` | `204` · `403` · `404` |

Nota: un organismo ajeno responde `403`, no `404` (no se oculta la existencia).

## Fuero (solo lectura)

`GET /api/organismos/:orgId/fuero` → `200 { fueros: [{id,nombre}], fueroSimplificado: string|null }`.
Organismo sin fueros → `{ fueros: [], fueroSimplificado: null }` (no es error).

## Unidades funcionales

`GET /api/organismos/:orgId/unidades-funcionales` y `GET .../:ufId` → `SELECT *` de `unidades_funcionales` (snake): `id, organismo_id, denominacion_unidad, localidad_id, tipo_uf_id, anio_implementacion, domicilio, telefono, mail, responsable, codigo_postal, …`.

`POST` body `{denominacionUnidad, localidadId, tipoUfId, anioImplementacion?, domicilio?, telefono?, mail?, responsable?, codigoPostal?}` → `201` UF completa.
`PATCH` body parcial de lo mismo → `200` UF completa. **`PATCH` usa `COALESCE`: no se puede vaciar un campo opcional enviando `null`/omitiéndolo — solo cambiarlo por otro valor.** El formulario de edición no debe ofrecer "borrar" un campo opcional ya cargado sin avisar esta limitación.
`DELETE` → `204` · `404`.

## Asignaciones de jueces (D8)

Base: `/api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces`

| Llamada | Respuesta |
|---|---|
| `GET` | `[{ id, grupoJuecesId, cantidadAsignada }]` (camel) |
| `POST {grupoJuecesId, cantidadAsignada}` | `201` asignación · `400 {error}` con uno de: `"Ya existe una asignación de esta unidad funcional a ese pool."`, `"La cantidad asignada debe ser mayor a 0."`, `"El pool de jueces indicado no existe."` |
| `PATCH /:asignacionId {cantidadAsignada}` | `200` asignación · `400` (cantidad) · `404` |
| `DELETE /:asignacionId` | `204` · `404` |

Cambiar el pool de una asignación = `DELETE` + `POST` (no hay edición in-place del pool).

## Pools de jueces (existente desde `002`)

`GET /api/pools-jueces` → `[{ id, descripcion, total_jueces, provincia_id }]` (snake; alcance = provincia del usuario, admin: todos).
`POST {provinciaId, descripcion?, totalJueces (>=0)}` → `201` pool · `403` si la provincia no es la del usuario y no es admin.
`PATCH /:id {descripcion?, totalJueces?}` · `DELETE /:id` → `204`.

## Editores

| Llamada | Autorización | Respuesta |
|---|---|---|
| `GET /api/organismos/:orgId/editores` | propietario/editor/admin | `[{ usuarioId: string, nombre: string\|null, email: string }]` (camel; `nombre` viene de `nombre_display`) |
| `POST /api/organismos/:orgId/editores {usuarioId: number}` | **solo propietario o admin** | `201 { usuarioId: number }` · `400` (`"Ese usuario ya es editor de este organismo."` / `"El usuario indicado no existe."`) · `403` a un editor |
| `DELETE /api/organismos/:orgId/editores/:usuarioId` | propietario o admin | `204` · `404` |

## Taxonomía

Catálogo — `GET /api/taxonomia/preguntas[?tipoOficinaId=<id>]` (cualquier autenticado):
```json
[{ "codigo": "string", "texto": "string", "grupo": "string",
   "tipoRespuesta": "opcion_unica|opcion_multiple|numerica|texto_libre",
   "opciones": [{ "codigo": "string", "etiqueta": "string" }] }]
```
`opciones` solo en las de opción (todas las posibles, ordenadas). Sin filtro: las 9. Con tipo real sin preguntas (coordinación, unidad operativa): `200 []`. Tipo inexistente / fuera de `smallint`: `400 { error }`.

Respuestas — `GET /api/organismos/:orgId/taxonomia` (propietario/editor/admin):
```json
[{ "pregunta": { "codigo","texto","grupo","tipoRespuesta" },
   "opciones": [{ "codigo","etiqueta" }],   // solo opción única/múltiple: las SELECCIONADAS
   "valorNumero": 0,                         // solo numerica
   "valorTexto": "…" }]                      // solo texto_libre
```
Solo preguntas ya respondidas. Opción única → `opciones` con 1 elemento.

Reemplazo — `PUT /api/organismos/:orgId/taxonomia`:
```json
{ "respuestas": [{ "preguntaCodigo": "string",
                   "opcionesCodigos": ["string"],   // opción única/múltiple
                   "valorNumero": 0,                // numérica
                   "valorTexto": "…" }] }           // texto libre
```
Reemplaza **todo** el conjunto en una transacción (lo omitido se borra). Devuelve `200` con la misma forma que el `GET`. Errores `400 { error }`: pregunta inexistente (`"Pregunta(s) inexistente(s): a, b"`), o el mensaje crudo del trigger de integridad (opción que no pertenece a la pregunta, pregunta que no aplica al tipo del organismo — Protección A, etc.). Ver research.md Decisión 4.7 sobre cómo se asocia el error a una pregunta.

## Usuarios

`GET /api/usuarios` → `[{ id: string, email, nombre_display: string|null, provincia_id: number|null, roles: string[]|null }]` (snake; cualquier autenticado).
`GET /api/usuarios/:id` → lo anterior + `email_verificado`, `foto_url`.
`PATCH /api/usuarios/:id {nombreDisplay?, provinciaId?, fotoUrl?}` (solo el propio o admin) → `200 { id, email, nombre_display, provincia_id, foto_url }`. **No acepta rol** (brecha G1).

## Códigos de estado y su tratamiento en el cliente

| Código | Tratamiento |
|---|---|
| `401` | sesión ausente/vencida → invalidar sesión, ir a `/login?returnTo=…` (FR-020, Edge Case de sesión vencida) |
| `403` | pantalla "No autorizado" (FR-021); nunca vacío ni degradado |
| `404` | pantalla "No encontrado" (misma que ruta inexistente) |
| `400` | mensaje `error` junto al campo/formulario que lo originó (FR-009) |
| `5xx` / red | mensaje genérico + reintento; sin perder lo tipeado |
