# Contrato consumido (delta sobre `005`): endpoints de `007`

Feature `008-frontend-identidad-fase-b`. **Extiende** `005/contracts/consumed-api.md`; no repite lo que no cambia. Todas las formas son **literales,
capturadas el 2026-09-25 contra un servidor real** (`research.md` Decisiones 1–2); los tokens se redactan y los datos de personas son de prueba.
Origen de cada endpoint: `specs/007-identidad-autorizacion/contracts/api.md`. Cookie de sesión: `httpOnly` (el cliente nunca la lee).

## Endpoints nuevos o modificados

| Método | Ruta | Quién | Cuerpo de entrada | Éxito | Módulo del cliente |
|---|---|---|---|---|---|
| POST | `/api/usuarios` | admin | `{ email, rol, provinciaId?, nombreDisplay? }` | `201` alta + acceso inicial | `api/usuarios.ts` → `crearUsuario` |
| POST | `/api/usuarios/:id/acceso-inicial` | admin | — (sin cuerpo; **no** enviar `content-type` JSON) | `201 { token, vence }` | `api/usuarios.ts` → `emitirAccesoInicial` |
| PUT | `/api/usuarios/:id/rol` | admin | `{ rol: "admin" \| "usuario_normal" }` | `200 { id, roles }` | `api/usuarios.ts` → `cambiarRol` |
| PATCH | `/api/usuarios/:id` | propio o admin | `{ nombreDisplay?, provinciaId?, fotoUrl? }` (**`provinciaId` solo admin**) | `200` (snake_case, sin cambios) | `actualizarUsuario` (existente) |
| POST | `/api/acceso-inicial/canjear` | **pública** | `{ token, password }` | `200 { usuarioId }` + `Set-Cookie` | `api/acceso-inicial.ts` → `canjearAccesoInicial` |
| DELETE | `/api/pools-jueces/:id` | según provincia | — | `204` | `eliminarPool` (existente, simplificado) |
| PUT | `/api/organismos/:orgId/taxonomia` | según organismo | `{ respuestas: [...] }` | `200` | `guardarTaxonomia` (existente) |

`content-type: application/json` solo si hay cuerpo: Fastify rechaza (`400`) un `POST`/`DELETE` con ese encabezado y cuerpo vacío. El `http()` existente ya
lo respeta (`headers` solo si `body !== undefined`); la reemisión llama sin `body`.

## Respuestas de éxito (literales)

```json
// POST /api/usuarios  → 201
{"id":"2386","email":"persona@ejemplo.test","provinciaId":3,"roles":["usuario_normal"],
 "accesoInicial":{"token":"<redactado>","vence":"2026-09-26T17:43:30.616Z"}}

// POST /api/usuarios  (rol admin, sin provincia) → 201
{"id":"2387","email":"admin@ejemplo.test","provinciaId":null,"roles":["usuario_normal","admin"],"accesoInicial":{…}}

// POST /api/usuarios/:id/acceso-inicial → 201
{"token":"<redactado>","vence":"2026-09-26T17:43:30.889Z"}

// POST /api/acceso-inicial/canjear → 200   (+ Set-Cookie: better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax)
{"usuarioId":"2386"}

// PUT /api/usuarios/:id/rol → 200
{"id":"2386","roles":["usuario_normal","admin"]}
```

**Casing**: los cinco anteriores son camelCase; `PATCH /api/usuarios/:id` y `GET /api/usuarios[/:id]` siguen en snake_case (D13). Ids `bigint` como `string`.

## Errores: forma y tratamiento en el cliente

| Forma | Estados | Cómo se muestra |
|---|---|---|
| `{ "error": string }` | `400`, `403`, `404`, `401` | `ApiError.message` = `error`, **tal cual**, junto al campo o diálogo |
| `{ "error": string, "code": "PASSWORD_TOO_SHORT" \| "PASSWORD_TOO_LONG" }` | `400` (canje) | error del campo contraseña (mensaje del servidor); no cambia de estado a "acceso no válido" |
| `{ "error": "El acceso inicial no es válido o venció." }` | `400` (canje) | estado **"acceso no válido"** con **texto propio del cliente** único (el del servidor no se muestra para no depender de él) |
| `{ "error": string, "preguntaCodigo": string, "preguntaTexto": string }` | `400` (taxonomía) | resalta la pregunta si está en el formulario + mensaje |
| `{ "error": string }` sin `preguntaCodigo` | `400` (taxonomía: `Pregunta(s) inexistente(s): …`) | solo el mensaje |
| `{ "statusCode": 400, "code": "FST_ERR_VALIDATION", "error": "Bad Request", "message": "…" }` | `400` (validación de esquema) | **mensaje genérico propio** ("Los datos enviados no son válidos."), nunca "Bad Request" (`research.md` Decisión 2) |
| `{ "message": "Invalid email or password", "code": "INVALID_EMAIL_OR_PASSWORD" }` | `401` (login) | mensaje de login único de `005` (sin cambios) |

`401` en el canje no se espera (es público); un `401` en cualquier otra llamada sigue el tratamiento de `005` (sesión vencida).
`403` de una mutación: además de mostrar su mensaje, invalida la sesión (`research.md` Decisión 7).

## Respuestas de rechazo relevantes (literales)

Ver la tabla completa de `research.md` Decisión 2. Las que las pantallas de esta feature muestran directamente:

- Alta duplicada: `{"error":"Ese email ya está dado de alta."}` · provincia obligatoria: `{"error":"La provincia es obligatoria para un usuario normal."}`
- Provincia por un no admin: `{"error":"La provincia de un usuario solo la puede asignar un administrador."}` (`403`)
- Pool en uso: `{"error":"El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes de eliminarlo."}`
- Taxonomía: `{"error":"La pregunta «autonomia» no aplica al tipo de organismo actual.","preguntaCodigo":"autonomia","preguntaTexto":"autonomia"}`
- **Último administrador** (`400 {"error":"El sistema no puede quedarse sin administradores."}`): forma **no capturada en el servidor real** — degradar al último admin exigiría
  quitarle el rol a los administradores reales de la base. La forma y el texto están cubiertos por el test de `007` en un esquema aislado
  (`backend/tests/integration/ultimo-admin.test.ts`) y por el mapeo genérico `{error}` de `ErrorNegocio`; el E2E de esta feature lo verifica **sin tocar admins reales**
  (ver `quickstart.md`, escenario 8).
