# Research: Fase B del frontend — consumir 007

Feature `008-frontend-identidad-fase-b`. Todo lo de esta página se **verificó el 2026-09-25** contra el código real
(`backend/src/routes/`, `backend/src/http/errores-integridad.ts`, `frontend/src/`) y contra un **servidor real**
(`tsx src/app.ts` en el puerto 3055 con `BETTER_AUTH_URL=http://localhost:3055`, base real, usuarios `test-frontend-*`
eliminados al terminar: 47 usuarios, 3 admins, 0 residuos). Las respuestas citadas son **literales** (con los tokens
redactados). Convención heredada de `005`: cada decisión cita su fuente y lo no verificable está marcado.

Estado de partida medido: `frontend/` con `vitest` **18 archivos / 152 tests pasan**, `tsc -b --noEmit` limpio;
Playwright lista **60 tests en 15 archivos**, de los cuales **los 15 archivos** dependen de `crearUsuarioConClave`
(hoy roto por `007`).

---

## Decisión 1 — Forma de los endpoints nuevos: camelCase, ids como string; los viejos siguen en snake_case (D13 confirmado)

**Fuente**: servidor real (tabla abajo) + `backend/src/routes/usuarios.ts`, `acceso-inicial.ts`, `services/usuarios.ts`.

| Endpoint | Estado | Cuerpo real (literal) | Casing |
|---|---|---|---|
| `POST /api/usuarios` (admin) | `201` | `{"id":"2386","email":"…","provinciaId":3,"roles":["usuario_normal"],"accesoInicial":{"token":"<redactado>","vence":"2026-09-26T17:43:30.616Z"}}` | **camelCase**, `id` string |
| `POST /api/usuarios` (admin, rol admin sin provincia) | `201` | `{"id":"2387","email":"…","provinciaId":null,"roles":["usuario_normal","admin"],"accesoInicial":{…}}` | camelCase; `provinciaId: null`; un admin trae **las dos** filas de rol |
| `POST /api/usuarios/:id/acceso-inicial` (admin) | `201` | `{"token":"<redactado>","vence":"2026-09-26T17:43:30.889Z"}` | camelCase |
| `POST /api/acceso-inicial/canjear` (**público**) | `200` | `{"usuarioId":"2386"}` + `Set-Cookie: better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax` | camelCase; `usuarioId` string |
| `PUT /api/usuarios/:id/rol` (admin) | `200` | `{"id":"2386","roles":["usuario_normal","admin"]}` / `{"id":"2386","roles":["usuario_normal"]}` | camelCase |
| `PATCH /api/usuarios/:id` (**sin cambios de forma**) | `200` | `{"id":"2386","email":"…","nombre_display":"Persona Uno","provincia_id":6,"foto_url":null}` | **snake_case** (como en `002`) |
| `GET /api/usuarios/:id` (sin cambios) | `200` | `{"id":"2386","email":"…","nombre_display":"…","email_verificado":true,"foto_url":null,"provincia_id":6,"roles":["usuario_normal"]}` | snake_case |
| `GET /api/auth/session` (sin cambios) | `200` | `{"usuarioId":"2386","rol":"usuario_normal","provinciaId":6}` | camelCase |

**Conclusión (a pedido: "no asumas que aquí es distinto")**: **D13 sigue vigente**. Los endpoints **nuevos** de `007` son
camelCase y los **modificados** (`PATCH`, `GET /usuarios/:id`) conservan snake_case. La capa de mapeo de
`frontend/src/api/` los absorbe **sin mecanismo nuevo**: un esquema zod por recurso; para los nuevos el "mapeo" se reduce a
convertir `id`/`usuarioId` `string → number` con `idWire`/`usuarioIdDesdeWire` (ya existentes, `src/api/ids.ts`) y
`vence` (ISO string) `→ Date`. No se toca ninguno de los esquemas existentes salvo lo indicado en las Decisiones 9 y 10.

Verificado también: tras `PUT rol` y `PATCH provincia`, el `GET /api/auth/session` **con la misma cookie** ya devuelve
el `rol`/`provinciaId` nuevos (`{"usuarioId":"2386","rol":"admin","provinciaId":3}`, luego `"provinciaId":6`): el servidor
relee la identidad en cada solicitud, sin re-login (FR-021 de `008` se decide en el cliente, Decisión 7).

## Decisión 2 — Formas de los errores; hallazgo: un `400` de validación de esquema mostraría "Bad Request"

**Fuente**: servidor real + `frontend/src/api/http.ts` (`extraerMensaje`).

Rechazos de dominio (todos `Content-Type: application/json`, cuerpo `{ "error": string, … }`):

| Caso | Estado | Cuerpo literal |
|---|---|---|
| Alta: email ya dado de alta (otro casing) | `400` | `{"error":"Ese email ya está dado de alta."}` |
| Alta: email inválido | `400` | `{"error":"El email no tiene un formato válido."}` |
| Alta: usuario normal sin provincia | `400` | `{"error":"La provincia es obligatoria para un usuario normal."}` |
| Alta / PATCH: provincia inexistente | `400` | `{"error":"La provincia indicada no existe."}` |
| Alta / PUT rol: rol inválido | `400` | `{"error":"El rol indicado no existe."}` |
| Alta sin sesión | `401` | `{"error":"No autenticado"}` |
| PUT rol: no admin | `403` | `{"error":"Solo un administrador puede cambiar el rol de un usuario."}` |
| PUT rol / reemitir: usuario inexistente | `404` | `{"error":"No encontrado"}` |
| PATCH: no admin cambia provincia | `403` | `{"error":"La provincia de un usuario solo la puede asignar un administrador."}` |
| Canje: token usado / reemplazado / falso | `400` | `{"error":"El acceso inicial no es válido o venció."}` (**idéntico** en los tres casos) |
| Canje: contraseña corta / larga | `400` | `{"error":"La contraseña debe tener al menos 8 caracteres.","code":"PASSWORD_TOO_SHORT"}` / `{"error":"La contraseña no puede superar los 128 caracteres.","code":"PASSWORD_TOO_LONG"}` (se validan **antes** de mirar el token) |
| Borrar pool en uso | `400` | `{"error":"El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes de eliminarlo."}` |
| UF con localidad inexistente | `400` | `{"error":"La localidad indicada no existe."}` |
| Taxonomía: pregunta que no aplica al tipo | `400` | `{"error":"La pregunta «autonomia» no aplica al tipo de organismo actual.","preguntaCodigo":"autonomia","preguntaTexto":"autonomia"}` |
| Taxonomía: opción inexistente | `400` | `{"error":"La opción «ZZZ» no existe para la pregunta «autonomia».","preguntaCodigo":"autonomia","preguntaTexto":"autonomia"}` |
| Taxonomía: dos respuestas / valor de otro tipo | `400` | `{"error":"La pregunta «autonomia» admite una sola respuesta.","preguntaCodigo":…,"preguntaTexto":…}` / `…admite una opción; se recibió un valor de otro tipo.` |
| Taxonomía: pregunta inexistente | `400` | `{"error":"Pregunta(s) inexistente(s): no_existe"}` (**sin** `preguntaCodigo`) |
| Login por contraseña de un alta **sin canjear** (sin credencial) | `401` | `{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}` (igual que contraseña errónea) |

**Hallazgo**: los rechazos de **validación de esquema** de Fastify tienen otra forma —
`{"statusCode":400,"code":"FST_ERR_VALIDATION","error":"Bad Request","message":"body must have required property 'rol'"}`
(también con `params/id` mal formado y con `token` vacío en el canje). `extraerMensaje` prefiere `error` sobre `message`
(`http.ts`), así que hoy un cuerpo así se mostraría como **"Bad Request"**. Las pantallas nuevas validan en el cliente
antes de enviar (FR-009, FR-001), por lo que no debería ocurrir; aun así **la pantalla pública no puede mostrar
"Bad Request"**. **Decisión**: `extraerMensaje` reconoce `code === 'FST_ERR_VALIDATION'` y devuelve un mensaje genérico en
español ("Los datos enviados no son válidos."); cambio mínimo y compartido, con test. No se cambia nada más de `http.ts`.

## Decisión 3 — La ruta pública del canje reutiliza el patrón de `/login`; no hay mecanismo de excepción que crear

**Fuente**: `frontend/src/routes.tsx`, `src/auth/guards.tsx`, `src/routes/login/LoginPage.tsx`, `src/main.tsx`,
`tests/unit/routes/login.test.tsx`.

- La tabla `rutas` es un arreglo de `RouteObject` con **una sola ruta pública**: `{ path: '/login', element: <LoginPage /> }`,
  **hermana** (nivel superior) del árbol protegido `{ element: <RequireAuth/>, children: [{ element: <AppLayout/>, … }] }`.
  No existe ningún flag ni lista de excepciones: **"pública" = estar fuera del subárbol de `RequireAuth`**.
- **Las pantallas de error NO son públicas**: `NoAutorizado` (`/no-autorizado`) y el comodín `*` → `NoEncontrado` están
  **dentro** de `RequireAuth` + `AppLayout`; un visitante sin sesión que abre una ruta inexistente es redirigido a
  `/login?returnTo=…` (FR-020). El único patrón público reutilizable es `/login`.
- `LoginPage` no usa `AppLayout` (pantalla completa, `<main>` propio) y hace `if (sesion) return <Navigate … />`. El canje
  **no** debe copiar ese redirect (FR-014 pide avisar y reemplazar), pero sí su estructura.
- El `401` global (`main.tsx`, `alFallar`) es inocuo en una ruta pública: `obtenerSesion()` convierte el `401` en `null`
  (`sesion.ts`) y, si no había sesión, `alFallar` solo deja `CLAVE_SESION = null`; no abre el diálogo de sesión vencida.
- **Decisión**: agregar `{ path: '/primer-acceso', element: <PrimerAccesoPage /> }` **junto a `/login`**, fuera de
  `RequireAuth`. Cero cambios en guardas, en `RequireAuth` o en `main.tsx`. `/registro`, `/signup` y `/pools` siguen cayendo
  en el comodín (FR-015/FR-022): se agrega un test que lo fija.
- Los tests de rutas existentes usan `createMemoryRouter(rutas, …)`; el canje se puede probar igual con
  `initialEntries: ['/primer-acceso#token=…']` (`useLocation().hash` funciona en memoria; `window.location.hash` no,
  por eso se lee del router, ver Decisión 4).

## Decisión 4 — Manejo del acceso en el navegador: fragmento leído una vez, quitado con reemplazo, solo en memoria

**Fuente**: `007/research.md` Decisión 3 (el acceso viaja en el fragmento `#token=…`), `007/contracts/api.md` §1.

- **Lectura**: `useState(() => extraerToken(useLocation().hash))` en el **primer render** (puro, seguro con `StrictMode`).
- **Quitado (FR-013)**: un efecto ejecuta `navigate({ hash: '' }, { replace: true })`: reemplaza la entrada actual del historial
  (el acceso desaparece de la barra de direcciones y del historial, y "atrás" no lo recupera). Funciona igual con
  `createBrowserRouter` y con `createMemoryRouter` (testeable). El fragmento **nunca** se envía al servidor ni aparece en
  `Referer`, por definición.
- **Solo memoria**: el token vive en estado del componente; **no** va a `localStorage`, `sessionStorage`, cookies ni al caché de
  TanStack Query. La contraseña tampoco se persiste.
- **Alta (admin)**: el token que devuelve `POST /api/usuarios` **no debe quedar en el caché de mutaciones** de TanStack Query
  (una mutación conserva su `data` durante `gcTime`, 5 min por defecto, aunque el componente se desmonte). Decisión: la
  mutación se declara con `gcTime: 0` y el componente copia el resultado a su estado local, lo muestra y llama `reset()` al
  cerrar. Test: tras cerrar, el caché de mutaciones no contiene el token.
- **Canje**: una mutación de TanStack Query también conserva sus **variables** (`{ token, password }`) durante `gcTime`. El canje se hace con una
  llamada directa (`await canjearAccesoInicial(...)`) desde el manejador del formulario, **sin** `useMutation`, para que ni el acceso ni la contraseña
  pasen por el caché. Test: tras enviar, `queryClient.getMutationCache().getAll()` está vacío y ninguna consulta contiene esos valores.
- **Copiar**: `navigator.clipboard.writeText` (contexto seguro: `localhost` y producción HTTPS); si no está disponible, el
  campo de solo lectura queda seleccionado para copiar a mano. **No verificado en navegador**: el permiso del portapapeles en
  Playwright requiere `grantPermissions`; se prueba en el E2E.

## Decisión 5 — Alta administrada y reemisión: diálogo dentro de `/admin/usuarios`, sin ruta ni menú nuevos

**Fuente**: `AdminUsuariosPage.tsx`, `routes.tsx`, `components/ui/{dialog,alert-dialog,select,checkbox}.tsx` (ya instalados).

- Botón "Dar de alta un usuario" sobre la lista → `Dialog` en **dos pasos**: (1) formulario (email, rol, provincia) con
  `react-hook-form` + `zod`; (2) resultado: enlace, vencimiento y aviso de un solo uso, con "Copiar enlace".
- Cerrar el paso 2 **sin haber copiado** pide confirmación (`AlertDialog`) — el aviso de la spec. Copiar lo marca como copiado.
- Acción "Emitir acceso nuevo" por fila → `AlertDialog` ("el anterior dejará de servir") → mismo paso 2.
- El enlace se arma con `window.location.origin + '/primer-acceso#token=' + token` (mismo origen en dev por el proxy y en prod).
- Sin ruta nueva ⇒ el menú (`menu.ts`) y `navegacion.spec` no cambian.
- Provincia: obligatoria si rol = usuario normal, opcional si admin (espejo de la regla del servidor, que sigue decidiendo).
- **Alternativa descartada**: pantalla propia `/admin/usuarios/nuevo`: agrega ruta, migas y test de menú para un formulario de tres campos.

## Decisión 6 — Edición de rol y provincia: dos acciones independientes por usuario (una solicitud cada una)

**Fuente**: contrato de `007` (`PUT …/rol` y `PATCH …` son endpoints separados), `useActualizarUsuario`.

- Por fila, un `Dialog` "Editar usuario" con **dos secciones independientes**: *Rol* (botón "Hacer administrador" /
  "Quitar rol de administrador") y *Provincia* (`SelectCatalogo` + "Guardar provincia"). Cada sección envía **una** solicitud:
  no hay guardado parcial entre rol y provincia.
- **Quitar el rol admin** abre `AlertDialog` de confirmación (FR-017); otorgarlo y cambiar provincia no.
- Los errores del servidor (`{error}`) se muestran junto a la sección (FR-018), y la fila vuelve al estado real (se
  re-consulta la lista; no hay estado optimista).
- **La provincia no se puede quitar** (el `PATCH` usa `COALESCE`): el selector no ofrece "sin provincia" (FR-022).
- **Autodescenso**: si el usuario editado es el de la sesión y pierde el rol, tras el éxito se invalida la sesión y se navega a
  `/organismos` (FR-020); `RequireAdmin` ya muestra "no encontrado" para no admins, pero navegar evita dejarlo en una URL de admin.
- Se reemplaza el control deshabilitado y el aviso `aviso-rol` de `005` (US9 deja de ser solo lectura).

## Decisión 7 — Sesión vigente: hoy puede quedar vieja hasta 30 s; se relee al cambiar de pantalla y ante un `403`

**Fuente**: `frontend/src/auth/useSesion.ts` (`staleTime: 30_000`), `AppLayout.tsx`, `main.tsx`.

Hallazgo: la sesión (`rol`, `provinciaId`) se cachea 30 s. Si un admin cambia el rol o la provincia de alguien con la app
abierta, esa persona seguiría viendo el permiso/prefill viejo hasta 30 s (sin refetch por foco si no cambió el foco). FR-021
exige "en la siguiente pantalla o acción". **Decisión**: (a) `AppLayout` invalida `CLAVE_SESION` en cada cambio de
`location.pathname` (una consulta liviana por navegación; 47 usuarios); (b) el `MutationCache.onError` de `main.tsx` invalida
`CLAVE_SESION` ante un `403` (el servidor dice "sin permiso": la identidad puede haber cambiado). La invalidación refresca en
segundo plano sin desmontar la pantalla (`useSesion` devuelve el dato previo mientras tanto; `cargando` es solo el primer `isPending`).
- **Alternativa descartada**: `staleTime: 0` global (una consulta por cada montaje de componente que usa la sesión).

## Decisión 8 — Perfil de solo lectura y mensaje de alta sin provincia

**Fuente**: `PerfilPage.tsx` (envía `provinciaId` si no es `null`), `OrganismoNuevoPage.tsx` (`alta-sin-provincia`).

- Perfil: para `rol === 'usuario_normal'` la provincia se muestra como texto (nombre del catálogo) con la nota "La asigna un
  administrador"; el guardado **no** incluye `provinciaId` (el `PATCH` con `COALESCE` no lo necesita). Para admin el selector
  sigue (el servidor lo permite a un admin; verificado en vivo sobre **otro** usuario — sobre sí mismo usa el mismo camino de código, `actualizarUsuario` con `esAdmin`, pero no se probó por separado).
- Alta de organismo: el texto real hoy es "Para dar de alta un organismo primero tenés que completar tu provincia en tu
  perfil." con un enlace al perfil (el pedido decía "elegí tu provincia"; se corrige el texto real). Pasa a "Pedile a un
  administrador que te asigne una provincia." **sin** enlace al perfil. `data-testid="alta-sin-provincia"` se conserva.
- El prefill de provincia ya sale de `sesion.provinciaId`; con la Decisión 7 refleja la vigente.

## Decisión 9 — Pools: se elimina `PoolEnUsoError`; se muestra el mensaje del servidor

**Fuente**: `src/api/pools.ts`, `PoolsPanel.tsx` (línea 81: ya muestra `err.message`), `tests/unit/api/unidades-asignaciones-pools.test.ts`.

- `eliminarPool` pasa a `await http(…DELETE…)` sin `try/catch`: un `400 {error}` produce un `ApiError` cuyo `message` **es** el
  texto del servidor (`extraerMensaje`), y `PoolsPanel` ya lo renderiza (`err instanceof Error ? err.message`). No hace falta
  código nuevo en el panel salvo actualizar el comentario obsoleto.
- Se borra `PoolEnUsoError` (código muerto, Principio XI). Su test unitario ("500 con code 23503 → PoolEnUsoError") se reemplaza
  por "400 `{error}` → `ApiError` con el mensaje del servidor"; el E2E `unidades-asignaciones` (que esperaba `500` + `23503` y el
  texto del cliente) espera `400` + el texto real y que el pool siga en la lista.
- Las demás respuestas `400 {error}` nuevas (localidad inexistente, provincia inexistente, etc.) ya se muestran por el mismo
  camino (`ApiError.message`) sin trabajo adicional (Assumption de la spec).

## Decisión 10 — Taxonomía: se usa `preguntaCodigo`/`preguntaTexto` del cuerpo; se elimina la búsqueda en el texto

**Fuente**: `TaxonomiaForm.tsx` (línea 47), `features/taxonomia/mezclar.ts` (`preguntasDelError`), respuestas reales de la Decisión 2.

- `ApiError` ya conserva el cuerpo (`error.cuerpo`). Se lee con un esquema zod mínimo
  `{ preguntaCodigo?: string, preguntaTexto?: string }` (`.safeParse`, nunca lanza): si `preguntaCodigo` existe **y** está en el
  catálogo del formulario, se resalta esa pregunta; en cualquier otro caso solo se muestra el mensaje (FR-029).
- `preguntasDelError` (busca el código dentro del texto) **se elimina** junto con sus tests: es exactamente lo que FR-028 pide dejar
  de hacer. El texto nuevo cita el código entre «», así que la búsqueda vieja "funcionaba por coincidencia"; con el campo
  estructurado ya no hace falta y no debe quedar como respaldo silencioso.
- Verificado: `"Pregunta(s) inexistente(s): no_existe"` **no** trae `preguntaCodigo` ⇒ no se resalta nada (correcto: esa pregunta ni
  está en el formulario).
- El servidor informa **una** pregunta por rechazo (la primera); no se intenta listar varias.
- No se agrega `opcionCodigo` (el servidor no lo envía; la opción va dentro del mensaje) — desvío ya registrado en `D18` de `007`.

## Decisión 11 — Alcance de la actualización de los E2E de `005` (FR-031), confirmado antes del plan

**Fuente**: `frontend/tests/e2e/**` (15 archivos, 60 tests), `helpers/backend.ts`, `scripts/grabar-fixtures.mjs`, prueba en vivo del bootstrap.

**Qué se rompió, medido**: `crearUsuarioConClave` hace `POST /api/auth/sign-up/email`, que `007` responde `400 EMAIL_PASSWORD_SIGN_UP_DISABLED`.
Lo llaman **los 15 archivos** (22 llamadas, algunas dentro de un bucle) en su `beforeAll`: hoy **los 60 tests fallan antes de empezar**. `scripts/grabar-fixtures.mjs`
(graba las respuestas reales de los tests de contrato) usa el mismo `sign-up`.

**Diseño del reemplazo (verificado en vivo)**: no hay forma de dar de alta sin un admin autenticado, y no hay admin sin credenciales
⇒ hace falta **un único arranque por SQL** (el único punto que toca SQL para crear identidad; el resto usa la API de `007`):

1. `asegurarAdminDeFixtures()`: si no existe `test-frontend-boot@example.test`, inserta por SQL `usuarios` (+ roles `admin` y
   `usuario_normal`) + `auth."user"` (`emailVerified=true`) + una fila `auth.verification` `reset-password:<token aleatorio>`; luego
   **`POST /api/acceso-inicial/canjear`** con `CLAVE` (verificado: `200 {"usuarioId":"…"}` + cookie) y **`sign-in/email`** para obtener la cookie.
2. `crearUsuarioConClave(email, opts?)`: con esa cookie, **`POST /api/usuarios`** (alta administrada) y **`POST /api/acceso-inicial/canjear`**
   con `CLAVE`. Es decir, cada fixture recorre el flujo real de `007` (alta + canje) — lo que pide FR-031.
3. `opts.provinciaId`: el alta exige provincia para el usuario normal, pero los 60 tests **parten de un usuario sin provincia**
   (y algunos la fijan con `asignarProvincia`). Para no cambiar el estado de partida de los tests existentes, el valor por defecto **deja la provincia
   en `NULL` por SQL después del alta** (mismo estado que hoy); `opts.provinciaId: number` la conserva. Es el único "atajo" y queda documentado.
4. Helper nuevo `crearUsuarioSinClave(email, provinciaId?)`: alta administrada **sin canjear** (cuenta dada de alta, sin contraseña).
5. `limpiarFixtures` suma el borrado de las filas `reset-password:*` (guardan el id de usuario, no el email: el mismo hueco que `007` corrigió en
   `backend/tests/helpers/db.ts`) y del admin de arranque.
6. No se cachea el admin entre archivos (cada archivo hace `limpiarFixtures()` al empezar y lo borraría): se verifica/crea en cada llamada.

**Clasificación de los 15 archivos** (revisada línea por línea):

| Tipo | Archivos | Trabajo |
|---|---|---|
| **A. Solo el helper** (el flujo bajo prueba no cambia) | `accesibilidad`, `admin-organismos`, `admin-organismos-reales`, `comparacion-visual`, `editores`, `evidencia-visual`\*, `navegacion`, `sesion-vencida` (**8 archivos**) | Ninguno más allá del helper. \* solo genera imágenes: `admin-usuarios.png` cambia con la UI nueva y se agregan las del alta y del canje |
| **B. Comportamiento que cambió** (assertion nueva) | `login`, `perfil`, `admin-usuarios`, `organismos`, `unidades-asignaciones`, `taxonomia`, `recorrido-sc002` (**7 archivos**) | Reescritura puntual, listada abajo |
| **C. Nuevos** | alta + canje (US1/US2), rol/provincia (US3), seguridad del acceso en el navegador (SC-004); `accesibilidad` suma `/primer-acceso` y el diálogo | Archivos/tests nuevos |

Detalle de B (cada uno con su causa verificada):
- **`login.spec` — `REVOCADO`**: su premisa era "alta con contraseña **sin** verificar el email + magic link ⇒ Better Auth borra la credencial". Con `007` el alta
  administrada crea el `auth.user` con `emailVerified = true` (FR-020 de `007`), así que **esa credencial ya no se revoca**; el fixture no reproduce nada. Se redefine la
  tercera causa como **"cuenta dada de alta que nunca fijó contraseña"** (`crearUsuarioSinClave`): verificado en vivo que da `401 INVALID_EMAIL_OR_PASSWORD`, el mismo cuerpo
  que una contraseña errónea; la aserción central (tres causas ⇒ mismo mensaje, G2 de `005`) se conserva.
- **`login.spec` test 3 (magic link `ENLACE`) y `perfil.spec` 23d (`SIN`)**: piden un enlace para un email que **no existe**; desde `007` un email no dado de alta **no genera ningún
  enlace** (verificado: `0` filas de verificación) y `ultimoMagicLink` fallaría. Se dan de alta con `crearUsuarioSinClave` antes de pedir el enlace (además, 23d gana realismo:
  es exactamente "cuenta sin contraseña"). Se agrega un test de que el pedido de enlace de un email **no** dado de alta muestra el mismo "enlace enviado".
- **`perfil.spec` 23a**: elegía 'Córdoba' en el selector; pasa a "la provincia se ve de solo lectura y guardar el nombre funciona sin enviar provincia" (y para admin sigue editable).
- **`admin-usuarios.spec` 21/22**: verificaba "No disponible" y `aviso-rol`; pasa a verificar el cambio de rol/provincia reales (SQL como verdad independiente).
- **`organismos.spec` 8 y `recorrido-sc002`**: el texto `completar tu provincia` → `Pedile a un administrador…`. `recorrido-sc002` se **redefine** (SC-002 de `008`): un admin da de alta a la persona **con provincia**,
  la persona canjea su acceso por la UI y completa alta de organismo + taxonomía sin elegir provincia ni recargar.
- **`unidades-asignaciones.spec` pool en uso**: espera `[400]`, cuerpo con el texto real, mensaje del servidor en pantalla y el pool aún en la base.
- **`taxonomia.spec` 13/13b**: 13 ya prueba un `400` real por deriva de tipo (Protección A) y su aserción `no aplica al tipo de organismo` **sigue valiendo** con el texto nuevo; se le agrega verificar `preguntaCodigo` en la respuesta y el resaltado de esa pregunta; 13b (mock) pasa a mockear el cuerpo estructurado.
- **`evidencia-visual.spec`**: solo genera imágenes (`admin-usuarios.png` cambia con la UI nueva; se agregan las del alta y del canje, con datos anonimizados).

**Confirmado, con qué se corre**: los E2E siguen exigiendo backend en `:3000` con `BETTER_AUTH_URL=http://localhost:5173` y `DATABASE_URL`;
la suite es serial (1 worker) y limpia por prefijo `test-frontend-`. **Alcance de esta decisión**: `frontend/tests/e2e/helpers/backend.ts`,
los 7 archivos de tipo B, los nuevos de tipo C y `scripts/grabar-fixtures.mjs`. Ningún cambio en `backend/`.

## Decisión 12 — Fixtures reales y tests unitarios

**Fuente**: `scripts/grabar-fixtures.mjs`, `tests/unit/api/fixtures/{wire.ts,real/*.json}`, `tests/unit/api/contrato.test.ts`.

- `grabar-fixtures.mjs` se actualiza al mismo flujo (arranque por SQL + alta + canje) y **graba** nuevos JSON reales:
  `usuario-alta.json` (201), `acceso-reemitido.json` (201), `canje.json` (200), `rol.json` (200), y los cuerpos de error
  (`error-alta-duplicado`, `error-canje-invalido`, `error-canje-password-corta`, `error-pool-en-uso`, `error-taxonomia-pregunta`,
  `error-validacion-fastify`). **Se anonimizan** email/nombre y **se redactan tokens** (regla de `005`; y `D15`: nunca datos reales de personas).
- Tests unitarios nuevos/ajustados: esquemas de los recursos nuevos contra los JSON reales; `extraerMensaje` con `FST_ERR_VALIDATION`;
  `eliminarPool` con `400`; `TaxonomiaForm` con cuerpo estructurado (y sin pregunta / pregunta fuera del formulario); ruta pública
  `/primer-acceso` (con y sin fragmento; fragmento quitado; `/registro`, `/signup`, `/pools` → 404); página de canje (validación, mensaje único, aviso de sesión);
  alta (validación de provincia por rol; token fuera del caché de mutaciones); edición de rol/provincia (confirmación, errores, autodescenso).

## Decisión 13 — Cookie y proxy de desarrollo para el canje: sin configuración nueva

**Fuente**: `vite.config.ts`, `005/research.md` Decisión 3, cabecera real del canje.

El canje devuelve `Set-Cookie` con los mismos atributos que el login (`HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`), generado por
Better Auth (`signInEmail`); el proxy `/api` de Vite (sin `changeOrigin`) es same-origin, así que el navegador la guarda igual que en el login.
La ruta del canje **no** valida `Origin` (verificado: `200` sin encabezado `Origin`); de todos modos el navegador lo envía en un `POST`
same-origin y `BETTER_AUTH_URL=http://localhost:5173` sigue siendo requisito para los `POST` con cookie de las demás pantallas.
**No verificado en navegador** (se cubre en el E2E de canje): que la sesión quede iniciada tras el canje vía proxy.

## Decisión 14 — Política de contraseña en el cliente

**Fuente**: respuestas reales del canje (`PASSWORD_TOO_SHORT` 8, `PASSWORD_TOO_LONG` 128).

Constantes `CONTRASENA_MIN = 8` y `CONTRASENA_MAX = 128` en un solo módulo del cliente, usadas por el formulario de canje (y reutilizables
por el cambio de contraseña de `005`, que hoy valida por su cuenta). El servidor sigue siendo el que decide: si responde `PASSWORD_TOO_SHORT/LONG`,
el formulario lo muestra como error del campo. Campos con `autoComplete="new-password"`.

---

## Resumen de decisiones

| # | Decisión | Evidencia |
|---|---|---|
| 1 | Endpoints nuevos camelCase + ids string; los modificados siguen snake_case; el mapeo existente los absorbe | respuestas reales |
| 2 | Errores `{error, …}`; `extraerMensaje` trata `FST_ERR_VALIDATION` (hoy diría "Bad Request") | respuestas reales + `http.ts` |
| 3 | `/primer-acceso` como hermana de `/login` fuera de `RequireAuth`; las de error **no** son públicas | `routes.tsx`, `guards.tsx` |
| 4 | Fragmento leído del router, quitado con `replace`, solo en memoria; `gcTime: 0` en la mutación del alta | `007` D3, TanStack Query |
| 5 | Alta y reemisión en diálogos dentro de `/admin/usuarios` | componentes ya instalados |
| 6 | Rol y provincia: dos acciones independientes; confirmación solo al quitar admin; autodescenso navega | contrato de `007` |
| 7 | Sesión: invalidar al navegar y ante `403` (hoy `staleTime` 30 s) | `useSesion.ts` |
| 8 | Perfil de solo lectura (usuario normal); mensaje sin provincia sin enlace | `PerfilPage`, `OrganismoNuevoPage` |
| 9 | Se elimina `PoolEnUsoError`; se muestra el mensaje del `400` | `pools.ts`, `PoolsPanel.tsx` |
| 10 | Taxonomía por `preguntaCodigo` estructurado; se elimina la búsqueda en el texto | `TaxonomiaForm.tsx`, respuestas reales |
| 11 | E2E: 15 archivos / 60 tests rotos; helper con arranque SQL + alta + canje; 8 solo-helper, 7 con cambio, nuevos aparte | inventario + prueba en vivo |
| 12 | Fixtures reales grabados y anonimizados; tests unitarios listados | `grabar-fixtures.mjs` |
| 13 | Sin configuración nueva de cookie/proxy; verificar en E2E | cabecera real |
| 14 | Política de contraseña 8–128 en una constante | respuestas reales |
