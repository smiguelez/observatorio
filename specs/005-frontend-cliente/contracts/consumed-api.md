# Contrato consumido: formas reales de las respuestas del backend

Feature `005-frontend-cliente`. Este documento **no define** endpoints —
fija la forma exacta que el cliente espera (la forma "wire") y cómo la
normaliza la capa de mapeo (D13; research.md, Decisión 4). Fuente: código de
`backend/src/routes/*.ts` (con `006` ya mergeada), releído el 2026-09-24. Los
`contracts/api.md` de `002`/`004`/`006` documentan rutas y autorización pero
**no** la forma de las respuestas; ante una divergencia gana el código y se
corrige este archivo.

Convenciones del cliente
- Base: rutas relativas `/api/...` (ver research.md, Decisión 3).
- Errores: `{ "error": string }` (+ `preguntasQueSePerderian` en un caso). Los
  de Better Auth (`/api/auth/*`) son `{ code, message }`.
- `204` = sin cuerpo (DELETE): no llamar `.json()`.
- **Regla real (verificada el 2026-09-24 con respuestas grabadas, `frontend/tests/unit/api/fixtures/real/`)**: TODA columna `bigint` llega como **string** — ids de organismo, UF, pool, asignación, localidad y usuario, y sus FK (`propietario_id`, `organismo_id`, `localidad_id`, `grupoJuecesId`, `usuarioId`) —, aun en los recursos camelCase; las `smallint` (`tipo_oficina_id`, `tipo_uf_id`, `provincia_id`, `anio_implementacion`) y `integer` llegan como number. Las tablas de más abajo indican `string→number` solo donde importa; la regla vale para todos.
- **Mapeo (D13)**: cada respuesta pasa por un esquema zod por recurso que la
  valida, la pasa a camelCase ("snake" = viene en snake_case) y convierte los
  **ids de usuario `string → number`** (`usuarios.id` es `bigint` y la API lo
  serializa como string). Los cuerpos de `POST` ya piden número, así que en
  el dominio `UsuarioId` es siempre `number`. Un id no entero seguro lanza
  `ContratoInesperado`.

## Sesión y autenticación

| Uso | Llamada | Respuesta |
|---|---|---|
| Identidad del cliente (rol, provincia) | `GET /api/auth/session` | `200 { usuarioId: string→number, rol: "usuario_normal"\|"admin", provinciaId: number\|null }` · `401 { error }` |
| Login contraseña | `authClient.signIn.email({email,password,callbackURL:"/"})` | cualquier error → **un único mensaje genérico** (Decisión 2 de la spec); credencial errónea, cuenta inexistente y credencial revocada son indistinguibles por diseño y el cliente no intenta distinguirlos |
| Login Google | `authClient.signIn.social({provider:"google",callbackURL:"/"})` | `{url, redirect:true}`; el cliente navega a `url` |
| Magic link (pedir) | `authClient.signIn.magicLink({email,callbackURL:"/",errorCallbackURL:"/login"})` | `200`; el email es un placeholder (G4). Tras `007`/D14 un email no provisionado será rechazado: el cliente muestra el mensaje genérico de "no se pudo iniciar sesión" |
| Magic link (consumir) | navegación a `/api/auth/magic-link/verify?...` | vencido/reusado → `302` a `errorCallbackURL?error=INVALID_TOKEN` |
| Cerrar sesión | `authClient.signOut()` | — |
| Métodos vinculados | `authClient.listAccounts()` | lista con `providerId` (`credential`, `google`, …) |
| Cambiar contraseña | `authClient.changePassword({currentPassword,newPassword})` | solo si existe cuenta `credential`; **no hay** "fijar contraseña" desde el cliente (G3, diferido a `007`) |
| Registro | — | **No se consume** `/api/auth/sign-up/email` (FR-022). La ruta existe en el backend; cerrarla es D14/`007` |

## Catálogos (cualquier autenticado, solo lectura, sin paginación)

`GET /api/provincias | /api/denominaciones-simplificadas | /api/tipos-oficina | /api/tipos-uf | /api/fueros`
→ `[{ id: number, nombre: string }]` (orden por `id`).

`GET /api/localidades` → `[{ id (bigint: string→number), nombre, provincia_id, latitud, longitud }]` (snake; **todas**, sin filtro; el combo de UF se filtra en el cliente por la provincia del organismo).

Se cargan una vez por sesión (`staleTime: Infinity`).

## Organismos

| Llamada | Respuesta |
|---|---|
| `GET /api/organismos` | `[{ id: string→number, denominacion: string, propietario_id: string→number }]` (snake) — propios + los que edita; admin: todos |
| `POST /api/organismos` body `{denominacion, denominacionSimplificadaId, tipoOficinaId, provinciaId}` (todos obligatorios, enteros salvo denominación) | `201 { id, denominacion, propietario_id }` · el body no puede fijar propietario · el backend **no** compara `provinciaId` con la del usuario: que sea fija para `usuario_normal` es UX (decisión 6) |
| `GET /api/organismos/:id` | `SELECT *` de `organismos` (snake): incluye al menos `id, denominacion, denominacion_simplificada_id, tipo_oficina_id, provincia_id, propietario_id, estado_fueros, actualizado_a, firestore_id`. **Los campos exactos los define `db/schema.sql`; el mapper solo declara los que el cliente usa.** · `403` no autorizado · `404` |
| `PATCH /api/organismos/:id` body parcial (incluye `provinciaId`: solo el admin tiene el control en la UI, decisión 6) + `confirmarPerdidaTaxonomia?: boolean` | `200 { id, denominacion, propietario_id }` · **`400 { error, preguntasQueSePerderian: [{codigo,texto}] }`** si cambiar `tipoOficinaId` dejaría respuestas sin aplicar y no vino la confirmación (Protección B) |
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
| `GET` | `[{ id, grupoJuecesId, cantidadAsignada }]` (camel, pero **`id` y `grupoJuecesId` son bigint => string**; `cantidadAsignada` number) |
| `POST {grupoJuecesId, cantidadAsignada}` | `201` asignación · `400 {error}` con uno de: `"Ya existe una asignación de esta unidad funcional a ese pool."`, `"La cantidad asignada debe ser mayor a 0."`, `"El pool de jueces indicado no existe."` |
| `PATCH /:asignacionId {cantidadAsignada}` | `200` asignación · `400` (cantidad) · `404` |
| `DELETE /:asignacionId` | `204` · `404` |

Cambiar el pool de una asignación = `DELETE` + `POST` (no hay edición in-place del pool).

## Pools de jueces (existente desde `002`) — solo se consumen desde el diálogo de asignación

`GET /api/pools-jueces` → `[{ id (bigint: string→number), descripcion, total_jueces, provincia_id }]` (snake; alcance = provincia del usuario, admin: todos).
`POST {provinciaId, descripcion?, totalJueces (>=0)}` → `201` pool · `403` si la provincia no es la del usuario y no es admin. El diálogo envía la provincia del organismo si es admin, la del usuario si no.
`PATCH /:id {descripcion?, totalJueces?}` → `200` pool.
`DELETE /:id` → `204`. **Con asignaciones existentes responde `500`** (FK sin `ON DELETE`, ruta sin captura; brecha G6): el cliente lo trata como "no se pudo eliminar, el pool puede estar asignado a otras UF".

## Editores

| Llamada | Autorización | Respuesta |
|---|---|---|
| `GET /api/organismos/:orgId/editores` | propietario/editor/admin | `[{ usuarioId: string→number, nombre: string\|null, email: string }]` (camel; `nombre` viene de `nombre_display`) |
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

`GET /api/usuarios` → `[{ id: string→number, email, nombre_display: string|null, provincia_id: number|null, roles: string[]|null }]` (snake; cualquier autenticado).
`GET /api/usuarios/:id` → lo anterior + `email_verificado`, `foto_url`.
`PATCH /api/usuarios/:id {nombreDisplay?, provinciaId?, fotoUrl?}` (solo el propio o admin) → `200 { id, email, nombre_display, provincia_id, foto_url }`. **No acepta rol** (brecha G1; US9 en solo lectura). No existe endpoint de alta de usuarios (G5).

## Códigos de estado y su tratamiento en el cliente

| Código | Tratamiento |
|---|---|
| `401` | sesión ausente/vencida → invalidar sesión, ir a `/login?returnTo=…` (FR-020, Edge Case de sesión vencida) |
| `403` | pantalla "No autorizado" (FR-021); nunca vacío ni degradado |
| `404` | pantalla "No encontrado" (misma que ruta inexistente) |
| `400` | mensaje `error` junto al campo/formulario que lo originó (FR-009) |
| `5xx` / red | mensaje genérico + reintento; sin perder lo tipeado |
