# Research: Frontend del Observatorio (005-frontend-cliente)

Regenerado el 2026-09-24 tras las 7 decisiones de `spec.md` (Clarifications) y
tras mergear `reformulacion` en esta rama (el código de `006` ya está en el
árbol de trabajo). Cada decisión indica su fuente: **código real** del
repositorio, **`better-auth@1.7.5`** instalado en `backend/node_modules`, o
**documentación oficial** consultada el 2026-09-23. Lo que no se pudo
verificar sin correr el sistema contra la base real está marcado *"a validar
en quickstart"* (no se corrió el backend contra la base para esta
investigación, para no crear datos).

Qué cambió respecto de la corrida anterior:
- Decisión 3 (cookies) **reconfirmada** contra el árbol actual, no asumida.
- Decisión 4 (mapeo, D13): ahora es un mecanismo único que incluye el id de
  usuario `string → number`.
- Decisión 5 (brechas): reescrita con las decisiones resueltas; aparecen dos
  brechas nuevas (G5 alta de usuarios/D14, G6 borrado de pools).
- Decisión 7 (menú): **sin** sección de pools.
- Sin preguntas abiertas: las 7 quedaron resueltas en la spec.

---

## Decisión 1 — Ubicación: `frontend/`, app nueva junto a `backend/`, sin tocar `src/`

**Decisión**: proyecto nuevo en `frontend/` (mismo nivel que `backend/`, con su
propio `package.json`). El `src/` + `vite.config.js` + `tailwind.config.js` de
la raíz (SPA Firebase, Tailwind 3) no se modifican ni se reutilizan.

**Por qué**: Principio IX (la app actual sigue operativa hasta el cierre) y
XI (no portar código). La raíz usa Tailwind 3 + PostCSS y la integración
vigente de shadcn usa Tailwind 4 + `@tailwindcss/vite` (Decisión 2); convivir
en el mismo `package.json` obligaría a un cambio mayor sobre la app en
producción.

**Alternativas**: reemplazar `src/` en el lugar (rompe IX); monorepo con
workspaces (sobrecarga para dos paquetes).

**Consecuencia**: cambiar el root directory de Vercel a `frontend/` es un paso
de despliegue, fuera de esta feature (D5 sigue abierta; ver Decisión 8).

---

## Decisión 2 — shadcn/ui con Vite (no Next.js)

**Fuente**: `ui.shadcn.com/docs/installation/vite`, `/docs/cli`,
`/docs/components-json` (2026-09-23).

| Aspecto | Next.js (lo que se encuentra por defecto) | Vite (lo que aplica acá) |
|---|---|---|
| Tailwind | `postcss.config` + `tailwind.config.js` | **Tailwind v4** con `@tailwindcss/vite` en `vite.config.ts`; sin `tailwind.config.js` ni PostCSS |
| CSS de entrada | `app/globals.css` | `src/index.css` con `@import "tailwindcss";` |
| Alias `@/*` | un `tsconfig.json` | **dos** archivos: `tsconfig.json` y `tsconfig.app.json` (el template de Vite usa project references), **más** `resolve.alias` en `vite.config.ts` (requiere `@types/node`) |
| `components.json` | `rsc: true` | `rsc: false`, `tailwind.config: ""` (v4), `tailwind.css: "src/index.css"` |
| Init | `npx shadcn init` interactivo | `npx shadcn@latest init --template vite` (el CLI soporta Vite de primera clase) |

Secuencia (versiones vigentes al 2026-09-23: shadcn CLI 4.21.0, Tailwind
4.3.3, Vite 8.3.0 — *a validar al ejecutar*):

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node
# editar: src/index.css, vite.config.ts, tsconfig.json, tsconfig.app.json
npx shadcn@latest init --template vite
npx shadcn@latest add <componentes>
```

**Base de componentes**: el CLI ofrece `radix`, `base` o `aria`; se elige
**`radix`** (más documentación y ecosistema).

**Componentes** (mapeo a pantallas; no se instala `--all`):

| Necesidad | Componentes shadcn |
|---|---|
| Layout y navegación (FR-013) | `sidebar`, `breadcrumb`, `separator`, `sheet` (menú móvil), `collapsible` |
| Menú de usuario (perfil / ajustes / salir) | `dropdown-menu`, `avatar` |
| Formularios | `field` + `input`, `label`, `select`, `checkbox`, `radio-group`, `textarea`, `button` |
| Taxonomía dinámica (FR-007) | `radio-group` (única), `checkbox` (múltiple), `input` numérico, `textarea` |
| Listas (organismos, UF, usuarios, completitud) | `table`, `badge`, `input` de filtro |
| **Diálogo de asignación de jueces + pools (FR-011, FR-024)** | `dialog`, `select`, `input`, `table`, `alert-dialog` (borrado), `tabs` o `collapsible` para alternar "asignar" / "gestionar pools" dentro del diálogo |
| Confirmaciones y errores (Protección B, FR-021) | `alert-dialog`, `alert` |
| Estados de carga y avisos | `skeleton`, `spinner`, toast |
| Login | `tabs` (contraseña · enlace por email) + botón de Google |

**Pendiente a validar al instalar** (la documentación cambió de estructura y
el resumen obtenido no permitió cerrar los nombres): la guía de formularios
ahora documenta `Field` + `Controller` de react-hook-form (no el `Form`
histórico) y el componente de toast referenciado no es necesariamente
`sonner`. Regla: correr `shadcn add <nombre>` y quedarse con el que el CLI
resuelva; un nombre inexistente falla explícitamente (no es un riesgo
silencioso).

**Alternativas**: Tailwind 3 + shadcn legacy (la doc vigente ya no la cubre);
MUI / Mantine (el stack lo fijó el pedido).

---

## Decisión 3 — Sesión y cookies en desarrollo: proxy de Vite, same-origin (**reconfirmada 2026-09-24**)

La decisión de la corrida anterior se volvió a verificar contra el árbol
actual (con `006` mergeada), no se heredó:

1. `git grep -iE "cors|trustedOrigins|baseURL|BETTER_AUTH_URL|sameSite" -- backend/src backend/package.json`
   → **sin resultados**. `app.ts` registra solo `@fastify/cookie`; `cors` no
   está en las dependencias; `betterAuth({...})` (`backend/src/auth/index.ts`)
   no define `baseURL` ni `trustedOrigins`. **Sigue siendo válido.**
2. `better-auth@1.7.5`, `dist/api/middlewares/origin-check.mjs` →
   `validateOrigin`: todo `POST` que traiga cookie se valida contra
   `trustedOrigins` (por defecto, el propio baseURL) y responde
   `403 INVALID_ORIGIN` si no coincide; `callbackURL`, `errorCallbackURL`,
   `newUserCallbackURL` se validan contra la misma lista (los relativos se
   aceptan).
3. `dist/cookies/index.mjs`: cookie `httpOnly`, `sameSite: "lax"`; `Secure`
   solo si el baseURL es `https` o `NODE_ENV=production`. `localhost:5173` y
   `localhost:3000` son *same-site* (el puerto no cuenta), así que Lax no es
   el problema; lo que rompería un cliente cross-origin es **la ausencia de
   CORS (preflight) y el origin check**, no las cookies.
4. `resolverIdentidad` lee la cookie en cada request y el hook global
   responde `401 {error:"No autenticado"}` a toda ruta de dominio sin sesión
   (`app.ts`).

**Decisión**: en desarrollo el cliente **no** habla cross-origin. Vite hace
proxy de `/api` al backend, de modo que para el navegador todo es same-origin,
igual que en producción detrás de un mismo origen. **No se agrega CORS al
backend.**

```ts
// frontend/vite.config.ts (fragmento)
server: { proxy: { '/api': { target: 'http://localhost:3000' } } } // sin changeOrigin
```

- El cliente usa **siempre rutas relativas** (`/api/...`), incluido
  `createAuthClient()` de Better Auth (sin `baseURL`, o
  `window.location.origin`). `fetch` con credenciales por defecto
  (`same-origin`); no hace falta `include`.
- **`changeOrigin` debe quedar en `false`** (default de Vite): el puente
  Fastify→Better Auth arma la URL con `request.hostname` (`app.ts`); con
  `false` el `Host` es `localhost:5173`, igual al `Origin` del navegador, y el
  origin check pasa. Con `true` el `Host` sería `:3000`, el `Origin` seguiría
  en `:5173` y volvería el `403 INVALID_ORIGIN`.
- **Backend en dev con `BETTER_AUTH_URL=http://localhost:5173`** (Better Auth
  desaconseja inferir el baseURL, doc oficial de opciones). Consecuencia: el
  `redirect_uri` de Google es `http://localhost:5173/api/auth/callback/google`
  y hay que registrarlo en la credencial de desarrollo. Los `callbackURL`
  que envía el cliente son **relativos** (`/`, `/organismos`).
- Sin tokens en `localStorage`/`sessionStorage` (Principio IV): la cookie es
  `httpOnly` y la gestiona el navegador.
- **Producción**: mismo origen para estáticos y `/api` (reverse proxy o
  rewrite). Hoy `vercel.json` solo reescribe `/(.*)` → `/index.html`, que
  capturaría `/api/*`; D5 (topología) sigue abierta. No bloquea esta feature
  porque el cliente usa rutas relativas y funciona igual con el proxy de
  Vite, un rewrite de Vercel o un reverse proxy propio.

**Alternativas descartadas**: (a) cross-origin real en dev — exige cambios de
backend (`@fastify/cors` con `credentials`, `trustedOrigins`), fuera del
alcance, y haría que dev y prod difieran justo en auth; (b) bearer token — el
backend usa cookies y dejaría tokens al alcance de JS.

**A validar en quickstart (spike, escenario 0, antes de las pantallas)**:
login por contraseña vía el proxy → `GET /api/auth/session` 200 con cookie
en `localhost:5173`. La lectura del código lo predice; no se ejecutó.

---

## Decisión 4 — Capa de mapeo por recurso (D13): casing, ids y validación en un solo mecanismo

**Problema verificado** (código de `reformulacion`; los `contracts/api.md` de
`006` no documentan la forma de las respuestas, solo rutas y errores):

- **Casing mixto**: snake_case en organismos (`propietario_id`,
  `tipo_oficina_id`), UF (`denominacion_unidad`), usuarios (`nombre_display`,
  `provincia_id`), pools (`total_jueces`), localidades; camelCase en
  asignaciones, editores, fuero y taxonomía; los cuerpos de `POST`/`PATCH`
  siempre camelCase.
- **Ids de usuario `bigint`** serializados como **string** en las respuestas
  (`propietario_id`, `usuarioId` de `/api/auth/session` y de editores,
  `id` de `/api/usuarios`), pero `POST /editores` exige `usuarioId: Integer`
  (número) y `PATCH/DELETE` los reciben por path.

**Decisión (D13, `docs/decisiones-pendientes.md`)**: no se toca el backend. Un
único mecanismo en `frontend/src/api/`: **un esquema zod por recurso** que, en
una sola pasada, (1) valida la forma de la respuesta, (2) normaliza casing a
camelCase, y (3) convierte el id de usuario **`string → number`**. El resto de
la app solo ve tipos de dominio.

- `UsuarioId` en el dominio es **`number`**. La conversión vive en un helper
  compartido (`api/ids.ts`): `usuarioIdDesdeWire(s: string): number` valida
  `Number.isSafeInteger` y **lanza** si no (un id fuera de rango sería un
  fallo del contrato, no algo que enmascarar). Con 47 usuarios hoy no hay
  riesgo práctico; el chequeo hace que un cambio futuro del tipo de id falle
  ruidosamente.
- Dirección inversa (cuerpos y paths): ya son `number`, sin conversión — por
  eso normalizar a número en el dominio evita el `Number(id)` disperso que
  planteaba la versión anterior.
- Comparación "¿soy propietario?": `organismo.propietarioId === sesion.usuarioId`
  (number con number).
- Un esquema que no coincide con la respuesta real produce un error tipado
  (`ContratoInesperado`) con el recurso y el campo, visible en desarrollo y
  test — detecta deriva del backend sin depender de tests de otro paquete.
- Cada módulo `api/<recurso>.ts` exporta: `WireSchema` (forma cruda
  exacta), el tipo de dominio inferido y las funciones de cliente. Ninguna
  pantalla importa tipos "wire".
- `DELETE` devuelve `204` sin cuerpo: el cliente HTTP no llama `.json()` a
  ciegas.
- Deuda (ya registrada en D13): otro cliente futuro (p. ej. "digesto")
  tropezaría con la misma inconsistencia; normalizar el backend sería una
  feature propia.

**Alternativas**: normalizar en el backend (descartado por D13);
`camelcase-keys` genérico (no resuelve ids ni valida forma, y esconde
deriva); mappers manuales sin validación (más código, sin detección de
deriva).

Otras formas que condicionan el diseño (detalle en
`contracts/consumed-api.md`):

- `GET /api/organismos` → solo `{id, denominacion, propietario_id}`; tipo,
  provincia y fuero salen del detalle (`GET /:id`, `SELECT *`) y de
  `/fuero`.
- **Taxonomía = dos endpoints con formas distintas que hay que combinar**:
  catálogo `GET /api/taxonomia/preguntas?tipoOficinaId=` (todas las opciones
  posibles) y respuestas `GET /organismos/:id/taxonomia` (`opciones` = solo
  las **seleccionadas**, y solo preguntas ya respondidas). `PUT` reemplaza el
  conjunto **completo**: omitir una respuesta la borra, así que el formulario
  siempre envía todo. Una múltiple sin selección se omite (= no responder).
- Los errores de taxonomía vienen como `400 {error: <mensaje del trigger>}`
  sin campo estructurado que nombre la pregunta; FR-009 se cumple resaltando
  la pregunta cuyo `codigo`/`texto` aparece en el mensaje y mostrando el
  mensaje completo junto al formulario. *A validar en quickstart contra los
  mensajes reales de `backend/migrations/0001..0003`.*
- `PATCH` de UF y de organismo usa `COALESCE`: **no se puede vaciar un campo
  opcional ya cargado** (enviar `null`/omitir no lo borra). El formulario de
  edición no ofrece "vaciar" sin avisar.
- `GET /api/localidades` devuelve todas; el combo de UF filtra en el cliente
  por la provincia del organismo.

---

## Decisión 5 — Brechas entre la spec y el backend, y cómo se resuelven

Con `006` mergeada, los cinco grupos de endpoints originales existen. Lo que
queda, verificado contra el código:

| # | Brecha | Evidencia | Resolución (decisión de la spec) |
|---|---|---|---|
| G1 | Sin endpoint para **cambiar el rol** de un usuario (`PATCH /api/usuarios/:id` solo acepta `nombreDisplay`, `provinciaId`, `fotoUrl`) | `routes/usuarios.ts` | **Decisión 1**: US9 en solo lectura; control de rol deshabilitado con explicación → `007` |
| G2 | Contraseña revocada y contraseña incorrecta lanzan el mismo `INVALID_EMAIL_OR_PASSWORD` | `better-auth/dist/api/routes/sign-in.mjs:320-334` | **Decisión 2**: no es una limitación, es lo deseado. Mensaje genérico único ante cualquier fallo, con acceso a los otros dos métodos. No se intenta distinguir nada (ni el `code`, ni tiempos, ni textos) |
| G3 | Sin forma de **fijar contraseña nueva** desde el cliente: `setPassword` es `serverOnly`; `request-password-reset` requiere `sendResetPassword`, que `auth/index.ts` no configura; `change-password` exige la actual | `better-auth/dist/api/routes/update-user.mjs:195`; `auth/providers/password.ts` | **Decisión 3**: diferido a `007`. Perfil: cambiar contraseña solo si `listAccounts()` muestra `credential`; si no, aviso |
| G4 | Magic link no se envía por email (`sendMagicLink` loguea en consola) | `auth/providers/magic-link.ts` | Fuera de alcance; el cliente implementa el flujo completo, en dev el link sale del log del backend |
| G5 | Nadie controla el alta: cualquiera puede crear identidad por contraseña (ruta de Better Auth), Google o magic link; tampoco hay endpoint para que un admin cree usuarios | `auth/identity-hook.ts` (crea `usuarios` si no existe); `docs/decisiones-pendientes.md` **D14** | **Decisión 5**: el cliente no ofrece registro. El cierre real es de backend (D14, opción 1: rechazar emails no provisionados; primera prioridad de `007`). El cliente debe **estar listo** para ese rechazo (ver abajo) |
| G6 | **`DELETE /api/pools-jueces/:id` de un pool con asignaciones responde 500**: la FK `unidad_funcional_grupo_jueces.grupo_jueces_id` no tiene `ON DELETE` (NO ACTION) y la ruta no captura el error de integridad | `db/schema.sql:163`, `routes/pools-jueces.ts` (DELETE sin try/catch) | Nueva. El diálogo de pools ofrece "eliminar", pero ante un 500 muestra "No se pudo eliminar: el pool puede estar asignado a otras unidades funcionales" (sin detalles internos). Corrección real (400 con mensaje, como hizo `006` con asignaciones) → `007` |

**Preparación para D14 (sin depender de que `007` exista)**: cuando el backend
rechace un email no provisionado, el rechazo llegará por: (a) `signIn.magicLink`
→ error de Better Auth; (b) el callback de Google → redirección a
`errorCallbackURL` con `?error=<código>`. La pantalla de login lee
`?error=` y los errores de `signIn.*`, y muestra: el mensaje de "enlace
inválido o vencido" para `INVALID_TOKEN`; un mensaje genérico de "no se pudo
iniciar sesión con este email; si creés que deberías tener acceso, contactá a
un administrador" para cualquier otro código. El texto exacto del rechazo lo
define `007`; el cliente no interpreta códigos desconocidos más allá de
mostrar el mensaje genérico (no revela si el email existe — coherente con la
Decisión 2). *No verificable hoy: el hook de D14 no existe.*

Otros hechos verificados que condicionan el diseño:

- **Identidad del cliente**: `GET /api/auth/session` (ruta propia, no la de
  Better Auth) → `{usuarioId: string, rol, provinciaId}`; es la única fuente
  de rol. `useSession()` de Better Auth no trae el rol (sirve para email y
  nombre).
- **Editores**: `GET` cualquiera con acceso; `POST`/`DELETE` solo propietario
  o admin (un editor recibe 403). Para elegir a quién agregar, `GET
  /api/usuarios` (lectura amplia; `roles` puede venir `null`).
- **Modelo D8**: no existen "modos" en la base; todo es `(UF, pool,
  cantidadAsignada)`. La UI ofrece los tres atajos (grupo exclusivo, pool
  completo, subconjunto) como ayuda de carga y **no persiste un modo**.
  "Exclusivo" = un pool que solo usa esa UF (se crea desde el mismo
  diálogo); "pool completo" = `cantidadAsignada == totalJueces`;
  "subconjunto" = menor. La tabla `asignacion_fueros` (fuero por
  asignación) existe en el esquema pero `006` no la expone: fuera de alcance.
- **Pools (decisión 4)**: `GET /api/pools-jueces` filtra por la provincia del
  usuario (admin: todos), snake_case. `POST` exige `provinciaId` igual a la
  del usuario o rol admin (si no, 403). Consecuencias para el diálogo:
  - Crear: `provinciaId` = provincia del organismo si el usuario es admin; la
    del usuario si no. Si un editor de otra provincia abre un organismo cuya
    provincia difiere de la suya, no puede ver ni crear pools de esa
    provincia: el diálogo lo indica ("solo podés gestionar pools de tu
    provincia") y muestra las asignaciones existentes por id
    ("pool #N, fuera de tu provincia") en vez de fallar.
  - Editar: `PATCH {descripcion?, totalJueces?}`; borrar: ver G6.
  - `cantidadAsignada > totalJueces` **advierte, no bloquea** (D8: no hay
    tope en el modelo).
- **Fuero**: un organismo nuevo tiene `estado_fueros='sin_fueros_asignados'`
  y `GET /fuero` → `{fueros: [], fueroSimplificado: null}`; no hay endpoint
  para asignar fueros, así que siempre solo lectura (FR-005).
- **Provincia (decisión 6)**: `POST /api/organismos` exige `provinciaId`, y el
  backend **no** lo compara con la provincia del usuario (control de UX, no de
  acceso — Principio II). `usuario_normal`: campo fijo con `sesion.provinciaId`
  (alta bloqueada con explicación si es `null`); admin: `select` editable en
  el alta y en la edición (`PATCH` acepta `provinciaId`).
- **Completitud (US7, decisión 7)**: no hay endpoint agregado. Con 117
  organismos (`docs/resultado-verificacion-fueros-20260918.md`) el cálculo
  implica por organismo `GET /:id`, `GET /:id/unidades-funcionales` y, solo si
  el catálogo aplicable a su tipo no está vacío, `GET /:id/taxonomia`
  (≈ 250–350 requests, solo admin). El catálogo de preguntas se pide **una vez
  por `tipoOficinaId`** (pocos tipos) y se cachea; si viene `[]`, la taxonomía
  cuenta como **completa** sin pedir respuestas (evita requests). Fan-out con
  concurrencia 6 y progreso visible; endpoint agregado = mejora futura de
  backend.

---

## Decisión 6 — Stack complementario

| Necesidad | Decisión | Por qué / alternativas |
|---|---|---|
| Ruteo | `react-router` (data router, `createBrowserRouter`) | Estándar para SPA con Vite; guardas por rol (FR-016/FR-020). Descartado TanStack Router (más piezas para ~11 pantallas). |
| Datos del servidor | `@tanstack/react-query` | Cache + invalidación tras mutaciones (la lista se actualiza sin recargar — US2), estados de carga/error uniformes y un punto único para interceptar `401`. |
| Auth client | `better-auth/client` (misma versión que el backend, 1.7.5) + `magicLinkClient()` | Cubre `signIn.email/social/magicLink`, `signOut`, `changePassword`, `listAccounts`. Las rutas de dominio usan un `fetch` propio. |
| Formularios y mapeo | `react-hook-form` + `zod` + `@hookform/resolvers` | La misma dependencia `zod` sirve a la capa de mapeo (Decisión 4), a los formularios y al esquema dinámico de taxonomía. |
| PDF (US7) | `jspdf` + `jspdf-autotable` | La spec pide generación en cliente; ya son las librerías de la app vieja (4.2.1 / 5.0.8), se instalan como dependencia nueva, sin portar código. |
| Pruebas unitarias | `vitest` + Testing Library + `jsdom` | Mismo runner que el backend. Cubren: esquemas de mapeo (casing, ids), esquema de taxonomía, guardas, completitud. |
| Pruebas E2E | `@playwright/test` contra backend real y base de pruebas | El backend no usa mocks (README); la superficie riesgosa es auth/cookies/proxy. Mocks de red solo para casos no reproducibles (sesión vencida a mitad de formulario, 500 del borrado de pool). |
| Sesión | `GET /api/auth/session` en TanStack Query (`retry: false` en 401) | `401` → invalidar y redirigir a `/login?returnTo=`. Sin estado global de auth aparte. |
| DataStudio | `VITE_DATASTUDIO_URL` (variable de build, pública); si falta, el ítem de menú se oculta | FR-015; la spec asume URL estable pero no la da. |

Versiones vigentes al 2026-09-23 (`npm view`): vite 8.3.0, react 19.3.0,
tailwindcss / `@tailwindcss/vite` 4.3.3, react-router 8.4.0,
`@tanstack/react-query` 5.103.2, react-hook-form 7.88.0, zod 4.6.5, vitest
5.0.1, `@playwright/test` 1.63.0, shadcn CLI 4.21.0, `@vitejs/plugin-react`
6.1.1. Se fijan en el lockfile al instalar. La app vieja usa
`react-router-dom@7`; en la versión vigente el paquete es `react-router`
(confirmar el nombre de import al instalar).

---

## Decisión 7 — Jerarquía de menús (US5, FR-013): sin sección de pools

```
Barra lateral
├─ Mis organismos                    → /organismos
│    └─ dentro de un organismo (pestañas): Datos · Unidades funcionales · Taxonomía · Editores
│         └─ dentro de una UF: diálogo "Asignación de jueces" (asignar · gestionar pools)
├─ Tableros (DataStudio) ↗           → URL externa
└─ Administración  (solo admin)
     ├─ Gestión de organismos        → /admin/organismos   (completitud + PDF)
     └─ Usuarios                     → /admin/usuarios     (solo lectura)
Menú de usuario
├─ Perfil                            → /perfil
├─ Ajustes                           → /ajustes            (punto de entrada mínimo)
└─ Cerrar sesión
```

- **No hay ruta ni ítem `/pools`** (decisión 4, FR-013/FR-024, SC-009): los
  pools se crean, editan y eliminan únicamente desde el diálogo de
  asignación de una UF.
- **No hay ruta de registro** (decisión 5, FR-022).
- Perfil, Ajustes y Tableros a ≤ 2 clics desde cualquier pantalla (SC-005: ≤ 3).
- Editores viven dentro del organismo (pestaña), visibles para propietario y
  admin — coherente con el backend, que permite al propietario gestionarlos.
- Rutas admin: guarda de UX + `401`/`403` del backend como control real; un
  no-admin ve la misma pantalla que ante una ruta inexistente (FR-016).

---

## Decisión 8 — Fuera de esta feature (dependencias)

- **`007-backend`** (orden de prioridad según D14): (1) rechazo de altas no
  provisionadas y endpoint de alta por admin; (2) cambio de rol de usuario;
  (3) fijar contraseña; (4) `DELETE` de pool con error de integridad
  identificable (G6).
- Proveedor de email real para el magic link (G4).
- Topología de despliegue (D5): mismo origen para `/api` y estáticos.
- Registrar el `redirect_uri` de Google para desarrollo (`:5173`).
- Solicitud de acceso con aprobación de admin: backlog ítem 9 (no se
  implementa ni se prepara UI).
