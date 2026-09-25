# Research: identidad y autorización (007)

Todo lo que sigue se verificó contra el código real de `reformulacion`, contra
`backend/node_modules/better-auth@1.7.5` (fuente instalada), contra la base
real, y —lo decisivo— con un **spike ejecutable**
(`backend/scripts/spike-007-identidad.ts`; salida completa en
`docs/resultado-verificacion-spike-007-20260925.md`: **19 de 19 casos PASS**,
0 filas de prueba restantes). Cada decisión cita su evidencia (Principio XII).

## Respuestas directas a las tres preguntas del pedido

| Pregunta | Respuesta corta | Decisión |
|---|---|---|
| ¿El hook de "verificar provisión" se compone con el que fija `auth.user.id`, o va aparte? | **En la misma función**: el `databaseHooks.user.create.before` de `002` (documentado, ya en uso) hace las dos cosas: **lanza** `APIError` si el email no está en `usuarios` y, si está, fija `auth.user.id`. Solo se le **quita** el `INSERT` | Decisión 1 |
| ¿Hay un mecanismo reutilizable para el acceso inicial de un solo uso con vencimiento? | **Sí, pero no el plugin de magic link**: el token `reset-password:*` de `auth.verification` (atómico, con vencimiento que fija quien lo crea, y su canje crea la credencial) | Decisión 3 |
| ¿Hace falta una columna nueva (p. ej. "cambio obligatorio en el primer acceso")? | **No.** Rol y primer acceso caben en las tablas existentes. La única migración (`0004`) es de funciones de trigger | Decisión 8 y data-model.md |

---

## Decisión 1 — Compuerta de provisión: el mismo `databaseHooks.user.create.before` de `002`

**Fuente**: `better-auth/dist/db/with-hooks.mjs` (`createWithHooks`), spikes
`backend/scripts/spike-007-hook-only.ts` y `spike-007-identidad.ts` (casos A1–A7).

**Decisión.** Una sola función, el hook `before` ya documentado y ya usado:
1. normaliza el email (minúsculas, sin espacios) y busca en `usuarios`;
2. si **no está**, `throw new APIError('FORBIDDEN', { code: 'ACCESO_NO_AUTORIZADO',
   message: 'No se pudo iniciar sesión con este email.' })` — mensaje genérico y
   uniforme que no revela si el email existe (FR-003);
3. si está, devuelve `{ data: { id: String(usuarios.id) } }` (lo que ya hacía en `002`).

Se **elimina la rama `INSERT INTO usuarios`**: era la puerta abierta de D14.

**Verificado (mismo hook, tres métodos, base real):** al lanzar el `APIError` con `code`
- contraseña → `403 {code, message}`;
- enlace → `302 …/login?error=ACCESO_NO_AUTORIZADO&error_description=…`;
- Google (`idToken`) → `403 {code, message}`;
- en los tres, 0 filas en `usuarios` y `auth.user`.
El hook recibe `ctx.path` (`/sign-up/email`, `/magic-link/verify`, `/sign-in/social`),
así que **sí** puede distinguir el método si hiciera falta.
Devolver `false` en cambio da errores distintos y opacos por flujo
(`FAILED_TO_CREATE_USER`, `?error=failed_to_create_user`, `OAUTH_LINK_ERROR`): por eso se **lanza**.

**Alternativas evaluadas.**

| Opción | Resultado |
|---|---|
| **A. `databaseHooks.user.create.before` lanzando `APIError`** (elegida) | Documentado, ya probado en `002`, un solo lugar, verificado en los 3 métodos |
| B. `user.validateUserInfo` (API 1.7.x) | También funciona (spike previo 19/19), pero **no figura en la página oficial de opciones**, solo en el código/JSDoc (`TODO: rename to validateUser`); exige contexto de endpoint (`403 validation_context_missing` fuera de él); aporta solo el ruteo por método, que el before-hook ya puede leer de `ctx.path`. Sin razón técnica que lo justifique → descartada |
| C. Dos `databaseHooks` | No se puede: `options.databaseHooks.user.create.before` admite una sola función |
| D. `disableSignUp` por método | No sirve: bloquea toda creación de `auth.user`, pero los 47 usuarios migrados no tienen `auth.user` y necesitan que se cree en su primer ingreso; la decisión es contra `usuarios`, no contra `auth.user` |

**Detalles.**
- Si el hook lanza algo que no es `APIError` (p. ej. caída de la base), la creación
  también aborta (no falla abierto), pero como `500`: el hook envuelve la consulta y
  convierte cualquier error en el `APIError` genérico o lo deja como 500 (se decide en tasks; ambos cierran).
- Alta administrada: no usa `createUser` (Decisión 4).
- **Tropiezo repetido de `002`**: `VALUES ($1, $1)` sobre `email citext` + `firestore_id text`
  falla con `42P08`. Todo SQL nuevo pasa parámetros separados.
- Pendiente de test real: callback GET de Google (T030); el camino de código es el mismo
  (`isAPIError && body.code` → redirección de error).

---

## Decisión 2 — Cerrar el alta pública por contraseña: `emailAndPassword.disableSignUp`

**Fuente**: `api/routes/sign-up.mjs:144`; spike A2, E1, E2.

El hook **no basta** para FR-004. El caso A2 lo muestra: con el email ya
provisionado, el hook *permite* el alta (correctamente: el email existe) y
`sign-up/email` entrega una sesión como ese usuario, sin verificar quién es
(la toma de cuenta descripta y reproducida el 2026-09-25 contra el backend real).
El cierre es quitar el alta pública por contraseña:

| Mecanismo | HTTP | API de servidor (`auth.api.signUpEmail`) | Veredicto |
|---|---|---|---|
| `emailAndPassword.disableSignUp: true` | `400 EMAIL_PASSWORD_SIGN_UP_DISABLED` | también `400` (E2) | **Elegido** |
| `disabledPaths: ['/sign-up/email']` | `404` (E1) | **sigue funcionando** (A2) | No alcanza solo |

**Decisión**: `disableSignUp: true`. Consecuencia buscada: una contraseña solo
nace por el acceso inicial (Decisión 3) o por un usuario ya autenticado. Los
helpers de prueba que creaban usuarios con `signUpEmail` se reescriben
(Decisión 10).

---

## Decisión 3 — Acceso inicial: token `reset-password:*` reutilizado, más un canje que además inicia sesión

**Fuente**: `api/routes/password.mjs` (`requestPasswordReset`, `resetPassword`,
líneas ~50–171), `plugins/magic-link/index.mjs`; spike B1–B6, C1–C2.

**Candidatos evaluados:**

| Mecanismo | ¿Un solo uso? | ¿Vencimiento propio? | ¿Sirve para *fijar contraseña*? | Veredicto |
|---|---|---|---|---|
| Plugin de **magic link** | sí (consumo atómico) | **no**: `expiresIn` es del plugin entero (hoy 300 s) y no por token | no: concede **sesión**, no contraseña | Descartado: 5 minutos no alcanzan para una entrega manual y no fija contraseña |
| **`reset-password:<token>`** en `auth.verification` | sí (`consumeVerificationValue` atómico) | **sí**: lo crea nuestro servicio con `expiresAt` propio | **sí**: `POST /reset-password` crea la cuenta `credential` si no existe | **Elegido** |
| Tabla/tokens propios | a construir | a construir | a construir | Descartado (el spec pide no construir un sistema nuevo) |

**Evidencia del spike (usuario provisionado, `auth.user` con `emailVerified=true`, sin credencial):**
- B1: canjear el token → `200` y se crea **exactamente 1** cuenta `credential`.
- B2: reusar el mismo token → `400 INVALID_TOKEN`. B3: token vencido → `400 INVALID_TOKEN`.
- B4: **dos canjes simultáneos → uno `200` y otro `400`** (atómico).
- B5: ingresa con la contraseña que ganó la carrera, **no** con la otra.
- B6: la política mínima de contraseña aplica (`400 PASSWORD_TOO_SHORT`).
- **Observación de diseño**: `requestPasswordReset` exige `sendResetPassword`
  configurado y busca el usuario en `auth.user`; nosotros **no lo configuramos**
  (queda `RESET_PASSWORD_DISABLED` en el endpoint público, cerrado a propósito
  hasta la Fase C) y **creamos el token directamente** con
  `internalAdapter.createVerificationValue({ identifier: 'reset-password:<token>', value: <auth.user.id>, expiresAt })`.
  Así el vencimiento es por token (default 24 h, configurable) sin tocar el
  vencimiento global de otros flujos.

**Diseño del flujo.**
1. **Emitir** (admin): genera un token aleatorio de alta entropía, borra los
   `reset-password:*` previos de ese usuario (**reemitir invalida el anterior**,
   FR-019) y crea el nuevo. Devuelve `{ token, vence }` al administrador; **no**
   lo escribe en logs (FR-022).
2. **Canjear**: hoy `POST /api/auth/reset-password {token, newPassword}` ya existe y
   funciona (B1–B6). Falta que el usuario **quede con sesión** (FR-017). Se agrega
   un endpoint delgado `POST /api/acceso-inicial/canjear {token, password}`
   que (a) lee el token **sin consumirlo** para resolver el email, (b) llama a
   `auth.api.resetPassword` (consumo atómico + creación de credencial) y (c)
   ingresa con `auth.api.signInEmail` reenviando el `Set-Cookie`. Ambos caminos
   quedan válidos; el nuestro es el contrato del frontend.
   - *Alternativa*: dejar que el cliente llame a `reset-password` y luego a
     `sign-in/email` (dos pasos, y el usuario tendría que reescribir su email).
     Se descartó por peor experiencia; el costo del endpoint propio es ~30 líneas.
3. **Canje sin sesión previa ⇒ ruta pública.** Es la única ruta de dominio sin
   `401` (además de `/api/auth/*`): se agrega a la lista de excepciones del hook
   global de `app.ts`. Respuestas **uniformes** ante token inválido/vencido/usado
   (`400`, sin distinguir), para no permitir explorar tokens.
4. **Dónde va el token en la URL** (decisión para la Fase B, registrada acá): en el
   **fragmento** (`https://…/primer-acceso#token=…`), no en la query; así no llega a
   ningún log de acceso ni al encabezado `Referer`. El canje lo envía por `POST`
   en el cuerpo.

**Vencimiento**: `ACCESO_INICIAL_TTL_HORAS`, default **24** (la entrega es manual;
el spec sugirió "del orden de horas"). Es de configuración, no de código.

**FR-020 (la contraseña sobrevive a un ingreso posterior por enlace) — verificado
con un contraste:**
- C1: con `auth.user.emailVerified = true` (lo que crea el alta administrada: el
  administrador **avala** el email) el ingreso posterior por enlace **no** toca la
  credencial (`cuentas = 1`).
- C2: con `emailVerified = false` ese mismo ingreso **borra** la credencial
  (`revokeUnprovenAccountAccess`: es lo que observó `005`). Por eso el alta
  administrada **debe** crear el `auth.user` con `emailVerified = true`.

**Lo que NO se verificó** (a validar al implementar, ya como test): que el token
canjeado por `POST /api/acceso-inicial/canjear` no aparezca en los logs de Fastify
(el cuerpo de un `POST` no se loguea por defecto, pero se comprueba con un test
que captura el log); y el comportamiento de `signInEmail` reenviado como
`Response` para copiar las cookies.

---

## Decisión 4 — Alta administrada: una transacción SQL, sin `createUser`

**Fuente**: spike B (inserta `auth.user` por SQL y funciona); `db/schema.sql`,
`\d usuarios`; `internal-adapter.mjs` (`createUser`).

`createUser` de Better Auth (a) dispara los hooks y (b)
no es transaccional con nuestro SQL. El alta administrada hace, en **una sola
transacción `pg`** (`conTransaccion`, ya existente):
1. `INSERT INTO usuarios (email, provincia_id, email_verificado, firestore_id)` con el
   email normalizado, `email_verificado = true` (avalado por el admin) y
   `firestore_id = 'api:<uuid>'` (misma convención que organismos/UF);
2. `INSERT INTO usuario_roles`: siempre `usuario_normal`, y además `admin` si el rol
   inicial es admin (invariante **verificada**: hoy los 47 usuarios tienen la fila
   `usuario_normal`, y los admins ambas);
3. `INSERT INTO auth."user" (id, name, email, "emailVerified", …)` con `id = usuarios.id::text`
   y `emailVerified = true`.
Luego (fuera de la transacción, es solo la tabla `verification`) se emite el
acceso inicial. Si esa emisión falla, el usuario queda dado de alta y el admin
puede **reemitir** (FR-019) — no hace falta compensación.

**Concurrencia**: `usuarios.email` es `citext UNIQUE`; dos altas simultáneas del mismo
email producen una `23505` que el manejador central (Decisión 7) traduce a
"ese email ya está dado de alta" (FR-019); ninguna deja filas parciales (la
transacción revierte).

**Acoplamiento reconocido**: se escribe en una tabla de Better Auth. Mitigación:
test de contrato que compara las columnas de `auth."user"` con las que reporta
`getMigrations(auth.options)` (ya usado en `scripts/migrate-auth.ts`).

**Alternativas**: `internalAdapter.createUser` dentro de un endpoint (rompe la
transacción y dispara los hooks); `auth.$context.adapter.create` (sin
transacción con `usuarios`); crear el `auth.user` *perezosamente* en el canje
(mezcla dos responsabilidades y hace que el token dependa de una fila que aún no
existe). Se descartaron.

---

## Decisión 5 — Rol: `usuario_normal` siempre, `admin` como agregado; último admin protegido

**Fuente**: `db/schema.sql` (`roles`, `usuario_roles`), consulta a la base
(2 roles: `admin`, `usuario_normal`; 47 usuarios con ≥1 rol; 3 admins),
`auth/resolve-identity.ts` (`rol` = `admin` si existe esa fila; si no,
`usuario_normal`).

Sin columna nueva. `PUT /api/usuarios/:id/rol {rol}` con `rol ∈ {admin,
usuario_normal}` significa "es admin / no es admin": **agrega o quita la fila
`admin`** y garantiza la fila `usuario_normal`. La identidad se relee **en cada
solicitud** (`resolverIdentidad`), por lo que el cambio rige en la siguiente
solicitud sin re-login (FR-013) — ya cubierto por el diseño de `002` (SC-007).

**Último administrador (FR-014)**: dentro de una transacción se bloquean las filas
admin (`SELECT … FOR UPDATE` sobre `usuario_roles` del rol admin), se cuenta, y
se rechaza si la operación dejaría 0. Sin el bloqueo, dos degradaciones
simultáneas de los dos últimos admins podrían dejar el sistema sin ninguno
(caso de carrera que el test de integración debe cubrir).

**Rol inexistente / usuario inexistente**: validados antes; el rechazo es `400`/`404`
con mensaje, nunca `500` (FR-015).

---

## Decisión 6 — Provincia: la escribe solo el admin; `403` completo y atómico

**Fuente**: `routes/usuarios.ts` (`PATCH`), `authz/pools-jueces.ts`,
`authz/rules.ts`; D20 en `docs/decisiones-pendientes.md`.

En `PATCH /api/usuarios/:id`, antes de tocar la base: si el llamador **no es admin**
y el cuerpo trae `provinciaId` **distinto del actual** (o el usuario objetivo no
es él mismo), responde **`403`** con mensaje explícito y **no aplica nada** de la
solicitud (ni el nombre) (FR-009). Reenviar la provincia **actual** no es un
cambio (FR-010): se procesa el resto y la respuesta refleja la provincia sin
cambios. Para un admin no hay restricción, salvo que la provincia exista (`FK` →
`400` con mensaje). Es la misma lógica que se usa al **crear** el usuario (Decisión 4).

Por qué compatible: el perfil de `005` envía `provinciaId` solo cuando tiene valor
y es el mismo que ya tiene → sigue funcionando hasta que la Fase B lo adapte.

**Alcance sobre `provincia = null`**: un usuario normal sin provincia que envíe
una provincia (cambio de `null` a un valor) es un cambio → `403`. La asigna un admin.

---

## Decisión 7 — Errores de integridad: un manejador central, no un `try/catch` por ruta

**Fuente**: `http/trigger-error.ts` (006), `pg_constraint` (27 FK en `public`),
D16; `500`s reproducidos en `005` (pool en uso, UF con localidad inexistente).

`006` resolvió esto ruta por ruta (asignaciones, editores). D16 ya proponía
generalizar; se decide un **`setErrorHandler` de Fastify** que:
1. si el error es de la clase **23** de Postgres (integridad) y lo causó el
   cliente, responde **`400`** con un mensaje de un **mapa por constraint**
   (extiende `MENSAJES_POR_CONSTRAINT`) y, si el constraint no está mapeado, con un
   mensaje genérico por tipo (`23503` referencia inexistente / en uso, `23505`
   duplicado, `23514` valor fuera de regla, `23502` falta un dato), **sin** filtrar
   nombres de tablas ni de columnas;
2. la ambigüedad de `23503` (mismo código al **insertar** un hijo con padre
   inexistente que al **borrar** un padre referenciado) se resuelve por el **método
   HTTP**, no por el texto de `detail` (que Postgres localiza según `lc_messages`):
   `DELETE` ⇒ "en uso", el resto ⇒ "no existe";
3. deja pasar como `500` todo lo demás (fallas reales), registrando el error.

Con eso los dos casos de `005` se cubren por el mapa (`unidad_funcional_grupo_jueces_grupo_jueces_id_fkey`
en `DELETE` ⇒ "pool en uso"; `unidades_funcionales_localidad_id_fkey` en
`POST/PATCH` ⇒ "localidad inexistente"), y **también** los que D16 marcaba como
probables (denominación simplificada, tipo de oficina, provincia de organismos;
provincia de pools/usuarios; tipo de UF; rol; usuario editor). El mapa completo
está en `contracts/api.md`. **A verificar por test** (no se probaron todos contra
el backend real hoy): que cada FK del mapa se dispare por las rutas de escritura.

Las rutas existentes quitan sus `try/catch` locales; `esRechazoDeIntegridad` /
`mensajeDeIntegridad` se absorben en el manejador (un único lugar).

**Alternativa descartada**: capturar y traducir en cada ruta (lo que hizo `006`):
deja cualquier ruta nueva o olvidada devolviendo `500`.

---

## Decisión 8 — Taxonomía legible: migración `0004` + respuesta estructurada (y por qué no una columna)

**Fuente**: `backend/migrations/0001` (`validar_respuesta_taxonomia`),
`0003` (`validar_pregunta_tipo_organismo`), `routes/organismos.ts` (`PUT`),
D18, D19; `taxonomia_preguntas.texto = codigo` (verificado por SQL).

Los `RAISE EXCEPTION` de los triggers formatean con **ids internos**
(`la pregunta 1 no aplica…`). Se decide:

1. **Migración `0004_taxonomia_mensajes_legibles`** (mismo patrón que 0001–0003:
   `up`/`down`, una migración aplicada no se edita): `CREATE OR REPLACE FUNCTION`
   sobre las dos funciones de trigger de las respuestas, con mensajes que nombran
   la pregunta por un **rótulo** (`codigo`, más `texto` si difiere — hoy son
   iguales, D19) y sin ids ni nombres de tabla; y, en cada `RAISE`, `USING
   DETAIL = 'preguntaCodigo=<codigo>'` para dar el dato estructurado sin parsear el
   mensaje. `down` restaura las funciones de `0001`/`0003`.
2. **El `PUT` traduce el rechazo** a `400 { error, preguntaCodigo, preguntaTexto }`
   leyendo `err.detail` (campo de `pg`, independiente del idioma del servidor) y
   consultando el texto de esa pregunta.
3. **Validación previa en la ruta** de lo que hoy solo atrapa el trigger de
   forma opaca: una `opcionesCodigos` que no pertenece a la pregunta produce hoy
   un `opcion_id` nulo y un error de tipo con ids; se valida antes y se responde
   "la opción «X» no existe para la pregunta «Y»" (`preguntaCodigo` incluido).
4. **Sin columna nueva**: el código de la pregunta ya es público y único
   (`taxonomia_preguntas.codigo`); no hace falta persistir nada más.

**Límite (dato, no código):** hasta que se carguen los enunciados reales (D19), el
"texto legible" **es** el código (`insercion_institucional`). El requisito se
cumple en lo que depende de este backend (identificar la pregunta sin ids
internos y con un campo utilizable); la legibilidad final depende de la carga de
datos y queda fuera (spec, Assumptions).

**Alternativas**: solo traducir en la API parseando ids del mensaje y buscándolos
(frágil, depende del formato textual); mover toda la validación a la API y dejar
los triggers como red de seguridad opaca (duplica reglas; los triggers son la
fuente de verdad de `003`/`004`).

---

## Decisión 9 — Cambio de contraseña: ya existe; el cierre de sesiones se fuerza en el servidor

**Fuente**: `api/routes/update-user.mjs` (`changePassword`), `005` (E2E de perfil
23c, 4 passed), spike D1–D2.

G3 se leyó en `005` como "no hay forma de cambiar la contraseña", pero **el cambio
con la contraseña actual ya funciona** (`POST /api/auth/change-password`, verificado
de punta a punta en `005`). Lo que falta es (a) fijarla por primera vez
(Decisión 3) y (b) FR-018: que las **demás** sesiones se cierren. Better Auth lo
hace si el cliente pasa `revokeOtherSessions: true`, pero eso es del cliente y
puede omitirse. Se fuerza en el servidor con `hooks.before` sobre la ruta
(`ctx.body.revokeOtherSessions = true`), verificado en D1:

- la contraseña anterior deja de servir (D2, `401`);
- **todas** las sesiones se revocan, se crea una nueva y se entrega en `Set-Cookie`:
  la cookie de la sesión actual **rota** (la anterior queda inválida). El navegador la
  reemplaza solo; un cliente que guarde el token a mano debe leer el nuevo.

**Usuario sin contraseña** que intenta cambiarla: Better Auth responde el error
propio (`400`, sin cuenta `credential`); el contrato lo documenta y la Fase B
muestra la indicación de US5-5. No se envuelve el endpoint.

---

## Decisión 10 — Pruebas: un solo punto de cambio y varios archivos de auth reescritos

**Fuente**: `grep` en `backend/tests` (51 usos de `sign-up/email`/`crearUsuarioDePrueba` en
19 archivos; 95 `it()` en total).

- `tests/helpers/db.ts` (`crearUsuarioDePrueba`) pasa a: `provisionarUsuario` (el
  **mismo servicio** que usa la ruta) + canje de un acceso inicial + `sign-in` para
  obtener la cookie. Los ~17 archivos de contrato/integración que solo necesitan
  "un usuario con sesión" siguen igual salvo el helper.
- **Se reescriben** los que prueban el flujo de autenticación en sí:
  `contract/auth.test.ts`, `integration/identity.test.ts`,
  `integration/magic-link.test.ts` (dejan de usar el alta pública; prueban el hook,
  el primer acceso y la identidad unificada con usuarios provisionados).
- **Nuevos**: `provision`, `acceso-inicial`, `rol-y-provincia-authz` (incluye la
  carrera del último admin), `password` (cambio + cierre de sesiones),
  `errores-integridad` (cada constraint del mapa) y mensajes de taxonomía.
- El spike se conserva como **test de humo** de la compatibilidad con Better Auth.

---

## Resumen de decisiones

| # | Decisión | Evidencia |
|---|---|---|
| 1 | `databaseHooks.user.create.before` lanzando `APIError` + fijar id (sin INSERT) | spike A1–A7 |
| 2 | `emailAndPassword.disableSignUp: true` cierra el alta pública (HTTP y API) | spike A2, E1, E2; reproducción de la toma de cuenta 2026-09-25 |
| 3 | Acceso inicial = token `reset-password:*` con vencimiento propio + endpoint de canje que inicia sesión | spike B1–B6, C1–C2 |
| 4 | Alta administrada por SQL en una transacción; `auth.user` con `emailVerified=true` | spike B, C |
| 5 | Rol: fila `admin` agregada/quitada; último admin protegido con bloqueo | consulta a `roles`/`usuario_roles` |
| 6 | Provincia solo admin; `403` atómico; reenviar la actual no es cambio | código de `usuarios.ts` |
| 7 | Manejador central de errores de integridad, mapa por constraint, `DELETE` ⇒ "en uso" | `pg_constraint`, D16, `500`s de `005` |
| 8 | Migración `0004` (funciones) + respuesta con `preguntaCodigo`; sin columna | migraciones 0001/0003, D18/D19 |
| 9 | Cambio de contraseña ya existe; `revokeOtherSessions` forzado en el servidor | spike D1–D2, `005` E2E |
| 10 | Helper de pruebas único + reescritura de los tests de auth | `grep` de `tests/` |
