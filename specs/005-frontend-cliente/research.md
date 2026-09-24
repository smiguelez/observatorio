# Research: Frontend del Observatorio (005-frontend-cliente)

Todo lo que sigue se verificó contra el código real de `reformulacion`
(`backend/src/**`, con `006-backend-endpoints-faltantes` ya mergeada), contra
`backend/node_modules/better-auth@1.7.5` (la versión instalada), o contra
documentación oficial consultada el 2026-09-23. Cada decisión indica cuál de
las tres fuentes la respalda (Principio XII). Lo que **no** se pudo verificar
sin correr el sistema queda marcado *"a validar en quickstart"*.

> Nota de proceso: la rama de trabajo (`005-frontend-cliente`) todavía no
> contiene el código de `006`. Se leyó con `git show reformulacion:<ruta>`.
> Antes de implementar, mergear `reformulacion` en esta rama.

---

## Decisión 1 — Ubicación: `frontend/`, app nueva junto a `backend/`, sin tocar `src/`

**Decisión**: proyecto nuevo en `frontend/` (mismo nivel que `backend/`, cada
uno con su `package.json`). El `src/` + `vite.config.js` + `tailwind.config.js`
de la raíz (SPA Firebase, Tailwind 3) **no se modifican ni se reutilizan**.

**Por qué**: Principio IX (la app actual sigue operativa hasta el cierre) y XI
(no portar código). Además la raíz usa Tailwind 3 + PostCSS, y la integración
actual de shadcn usa Tailwind 4 + `@tailwindcss/vite` (Decisión 2): convivir
en el mismo `package.json` obligaría a un cambio mayor sobre la app en
producción.

**Alternativas**: reemplazar `src/` en el lugar (rompe IX); monorepo con
workspaces (sobrecarga para 2 paquetes).

**Consecuencia**: el reemplazo de la SPA vieja en Vercel (cambiar el root
directory a `frontend/`) es un paso de despliegue, fuera de esta feature (D5
sigue abierta — ver Decisión 8).

---

## Decisión 2 — shadcn/ui con Vite (no Next.js)

**Fuente**: `ui.shadcn.com/docs/installation/vite`, `/docs/cli`,
`/docs/components-json` (consultadas 2026-09-23).

Diferencias reales respecto de la guía de Next.js:

| Aspecto | Next.js (lo que se encuentra por defecto) | Vite (lo que aplica acá) |
|---|---|---|
| Tailwind | `postcss.config` + `tailwind.config.js` | **Tailwind v4** con el plugin `@tailwindcss/vite` en `vite.config.ts`; sin `tailwind.config.js`, sin PostCSS |
| CSS de entrada | `app/globals.css` | `src/index.css` con `@import "tailwindcss";` |
| Alias `@/*` | `tsconfig.json` (uno) | **dos** archivos: `tsconfig.json` **y** `tsconfig.app.json` (el template de Vite usa project references; si el alias solo está en uno, el CLI o el compilador no lo resuelven) **más** `resolve.alias` en `vite.config.ts` (necesita `@types/node` por `path`) |
| `rsc` en `components.json` | `true` | `false` |
| `tailwind.config` en `components.json` | ruta al archivo | `""` (vacío, v4) |
| `tailwind.css` | `app/globals.css` | `src/index.css` |
| Init | `npx shadcn init` interactivo | `npx shadcn@latest init --template vite` (el CLI soporta Vite como framework de primera clase) |

Comandos (a validar en quickstart, versiones vigentes 2026-09-23: shadcn CLI
4.21.0, Tailwind 4.3.3, Vite 8.3.0):

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node
# editar: src/index.css, vite.config.ts, tsconfig.json, tsconfig.app.json
npx shadcn@latest init --template vite
npx shadcn@latest add <componentes>
```

**Base de componentes**: el CLI actual ofrece elegir base (`radix`, `base`,
`aria`). Se elige **`radix`** (más documentación y ecosistema; la app vieja ya
usaba Radix — solo como dato, no se porta nada).

**Lista de componentes a instalar** (mapeada a pantallas — no se instala
`--all`):

| Necesidad (FR/US) | Componentes shadcn |
|---|---|
| Layout y navegación jerárquica (FR-013, US5) | `sidebar`, `breadcrumb`, `separator`, `sheet` (menú móvil), `collapsible` |
| Menú de usuario: perfil / ajustes / salir (US5, US6) | `dropdown-menu`, `avatar` |
| Formularios (US1–US6) | `form`/`field` + `input`, `label`, `select`, `checkbox`, `radio-group`, `textarea`, `button` |
| Taxonomía dinámica (FR-007) | `radio-group` (opción única), `checkbox` (múltiple), `input type=number`, `textarea` |
| Listas / gestión (US2, US7, US9) | `table`, `badge`, `input` (filtro), `pagination` o filtro simple |
| Confirmaciones y errores (FR-009, FR-021, Protección B) | `alert-dialog`, `dialog`, `alert`, toasts |
| Estados de carga | `skeleton`, `spinner` |
| Login por tabs (US1) | `tabs` |

**Pendiente a validar al instalar (no se pudo cerrar leyendo la doc)**: las
páginas de documentación cambiaron de estructura — la de formularios ya
documenta el patrón `Field` + `Controller` de react-hook-form (no el `Form`
histórico), y la de toasts referenciada apuntó a un componente `toast`
distinto de `sonner`. Regla: al implementar, correr `npx shadcn@latest add
<nombre>` y quedarse con el que el CLI resuelva; si un nombre no existe, el
CLI falla explícitamente (no es un riesgo silencioso). Formularios:
`react-hook-form` + `zod` + `@hookform/resolvers`.

**Alternativas**: Tailwind 3 + shadcn legacy (descartada: la doc vigente ya
no la cubre y el CLI asume v4); Material UI / Mantine (el stack lo fijó el
pedido: shadcn/ui).

---

## Decisión 3 — Sesión y cookies: **proxy de Vite en desarrollo**, no CORS cross-origin

**Lo verificado (código real, no supuesto)**:

1. `backend/src/app.ts` **no registra `@fastify/cors`** (solo `@fastify/cookie`)
   y `backend/package.json` no lo tiene como dependencia. Un `fetch` desde
   `http://localhost:5173` a `http://localhost:3000` con `credentials:
   'include'` falla en el preflight: el navegador no llega a leer ninguna
   respuesta.
2. `backend/src/auth/index.ts` **no configura `baseURL` ni `trustedOrigins`**.
   Better Auth valida el header `Origin` de todo `POST` que traiga cookie
   contra `trustedOrigins` (por defecto solo su propio baseURL) y responde
   `403 INVALID_ORIGIN` si no coincide
   (`better-auth/dist/api/middlewares/origin-check.mjs`, `validateOrigin`).
   Aunque se agregara CORS, el login con contraseña estando en otro puerto
   fallaría por acá. También se validan `callbackURL`/`errorCallbackURL`
   contra la misma lista (relevante para Google y magic link).
3. Atributos de cookie por defecto: `sameSite: "lax"`, `httpOnly`; `Secure`
   solo si el baseURL es `https` o `NODE_ENV=production`
   (`better-auth/dist/cookies/index.mjs`). `localhost:5173` y `localhost:3000`
   son *same-site* (el puerto no cuenta para "site"), así que `Lax` no
   bloquearía la cookie — el bloqueo real es CORS + origin check, no
   SameSite.
4. La resolución de identidad lee la cookie en **cada** request
   (`resolve-identity.ts`) y devuelve `401` sin sesión — es lo que dispara
   FR-020 en el cliente.

**Decisión**: en desarrollo, el cliente **no** habla cross-origin. Vite hace
de proxy de `/api` hacia el backend, de modo que para el navegador todo es
same-origin, igual que en producción detrás de un mismo origen:

```ts
// frontend/vite.config.ts (fragmento)
server: {
  proxy: {
    '/api': { target: 'http://localhost:3000' }, // changeOrigin: NO activarlo
  },
}
```

y el cliente usa siempre **URL relativas** (`/api/...`), también para el
cliente de Better Auth (`createAuthClient()` sin `baseURL`, o `baseURL:
window.location.origin`).

**Detalle crítico — `changeOrigin` debe quedar en `false` (default de Vite)**:
el puente Fastify→Better Auth arma la URL con `request.hostname` (`app.ts`).
Con `changeOrigin: false` el `Host` que llega es `localhost:5173`, igual al
`Origin` del navegador → el origin check pasa sin tocar el backend. Con
`changeOrigin: true` el `Host` pasaría a `localhost:3000`, `Origin` seguiría
siendo `5173` y volvería el `403 INVALID_ORIGIN`.

**Variable de entorno del backend para dev**: `BETTER_AUTH_URL=http://localhost:5173`
(Better Auth desaconseja inferir el baseURL desde el request — doc oficial
de opciones). Consecuencias:
- El `redirect_uri` de Google pasa a ser
  `http://localhost:5173/api/auth/callback/google`; hay que registrarlo en la
  consola de Google Cloud (credencial de desarrollo). *A validar en
  quickstart — el flujo Google real no está probado de punta a punta ni en
  `002` (README, "Limitaciones conocidas").*
- Los `callbackURL` que manda el cliente deben ser **relativos** (`"/"`,
  `"/organismos"`): `isTrustedOrigin(..., {allowRelativePaths: true})` los
  acepta y se resuelven contra el mismo origen.

**Producción**: el diseño asume mismo origen (frontend estático + `/api`
enrutado al backend por el mismo host/reverse proxy). Hoy `vercel.json` solo
tiene el rewrite SPA (`/(.*)` → `/index.html`), que **capturaría `/api/*`**;
y la topología real (D5: Cloudflare Tunnel, dónde se sirve el frontend) sigue
abierta. Esto no bloquea esta feature porque el código del cliente usa rutas
relativas y funciona igual con un proxy de Vite, un rewrite de Vercel, o un
reverse proxy propio — pero queda como **dependencia de despliegue** (ver
plan.md, Riesgos).

**Cliente HTTP**: `fetch` con `credentials: 'same-origin'` (default) — no hace
falta `include`. Sin tokens en `localStorage`/`sessionStorage` (Principio IV;
la cookie es `httpOnly`).

**Alternativas evaluadas**:
- *Cross-origin real en dev* (CORS + `trustedOrigins`): exige **cambios en el
  backend** (agregar `@fastify/cors` con `credentials: true`, `trustedOrigins`,
  y un `sameSite: "none"` + `Secure` si algún día fueran sitios distintos),
  fuera del alcance ("no se modifica el backend"), y haría que dev y prod
  difieran justo en la superficie más delicada (auth). Descartada.
- *Bearer token*: el backend usa cookies, no hay plugin `bearer` activo.
  Descartada (Principio II/IV: dejaría tokens al alcance de JS).

**A validar en quickstart (spike de 30 min, antes de las pantallas)**: login
con contraseña vía proxy → `GET /api/auth/session` devuelve 200 con la cookie
seteada por `localhost:5173`. La lectura del código lo predice; no se corrió
el backend contra la base real para esta investigación (se evitó crear
datos).

---

## Decisión 4 — Forma real de la respuesta de cada endpoint (contrato consumido)

Detalle completo por endpoint en `contracts/consumed-api.md`. Hallazgos que
**cambian el diseño** respecto de lo que un cliente asumiría:

1. **Los `contracts/api.md` de `006` no documentan la forma de las
   respuestas** — solo rutas, autorización y errores. La forma real se leyó
   del código de las rutas (`routes/*.ts`) y de `006/data-model.md`.
2. **Casing inconsistente entre endpoints**: los catálogos y `usuarios`/
   `organismos`/`unidades-funcionales`/`pools-jueces` devuelven **snake_case**
   (`SELECT *`, `propietario_id`, `total_jueces`, `nombre_display`), mientras
   asignaciones, editores, fuero y taxonomía devuelven **camelCase**
   (`grupoJuecesId`, `usuarioId`, `tipoRespuesta`). Los cuerpos de
   `POST`/`PATCH` son camelCase siempre. → capa `api/` con tipos y mappers
   por endpoint; ninguna pantalla toca la forma cruda.
3. **IDs `bigint` llegan como string**: `usuarios.id` (y por tanto
   `propietario_id`, `usuarioId` de editores, `usuarioId` de
   `/api/auth/session`) es `bigint` y `pg` lo serializa como string. Pero los
   `POST` (`{usuarioId}` en editores) exigen `Integer` (number). → tipo
   `UsuarioId = string` en el cliente; convertir con `Number()` solo al
   armar el body. La comparación "¿soy propietario?" es string-vs-string.
4. **`GET /api/organismos` devuelve solo `{id, denominacion,
   propietario_id}`** — sin tipo, provincia ni fuero. La lista muestra
   denominación y rol del usuario sobre él (propio/editor/admin, deducido
   comparando `propietario_id` con `usuarioId` de la sesión); el detalle
   (`GET /:id`, `SELECT *`) trae `tipo_oficina_id`, `provincia_id`,
   `denominacion_simplificada_id`, `estado_fueros`, etc.
5. **Taxonomía: dos endpoints, dos formas, hay que combinarlos**:
   - Catálogo `GET /api/taxonomia/preguntas?tipoOficinaId=` →
     `[{codigo, texto, grupo, tipoRespuesta, opciones?: [{codigo,
     etiqueta}]}]` (`opciones` solo en las de opción; **todas** las opciones
     posibles).
   - Respuestas `GET /api/organismos/:orgId/taxonomia` →
     `[{pregunta:{...}, opciones?: [...], valorNumero?, valorTexto?}]` donde
     `opciones` son **solo las seleccionadas** (mismo nombre de campo, distinto
     significado que en el catálogo) y solo para preguntas ya respondidas.
   - `PUT` reemplaza el conjunto **completo**: el formulario debe enviar
     **todas** las respuestas (las precargadas y las nuevas); omitir una
     ya respondida la borra. Una múltiple sin selección se omite (equivale a
     no responder — coincide con el Edge Case de la spec).
   - Formulario = catálogo filtrado por el `tipo_oficina_id` del organismo
     (`GET /:orgId`) ⊕ respuestas existentes precargadas por `codigo`.
     Coordinación y unidad operativa → catálogo `[]` → mostrar estado vacío
     explícito ("este tipo de organismo no tiene taxonomía aplicable"), no un
     formulario en blanco. Un `tipoOficinaId` inexistente → `400`.
   - Una respuesta numérica lee `Number(null) = 0` cuando falta el valor
     (`organismos.ts`, `obtenerTaxonomiaOrganismo`): pero la fila solo existe
     si fue respondida, así que no es ambiguo en la práctica.
6. **Errores**: cuerpo `{error: string}` para 400/401/403/404 (más
   `preguntasQueSePerderian` en el 400 de Protección B). Errores de Better
   Auth tienen otra forma (`{code, message}`). `DELETE` devuelve `204` sin
   cuerpo — el cliente HTTP no debe hacer `.json()` a ciegas.
7. **Errores de taxonomía identifican la pregunta solo por el texto del
   `message`** del trigger (`err.message` crudo en el `400`), no por un campo
   estructurado — FR-009 ("identificar qué pregunta") se cumple parseando o
   mostrando ese mensaje junto al formulario, y resaltando la pregunta cuando
   el mensaje contiene su `codigo`/`texto`. *A validar en quickstart contra
   los mensajes reales de los triggers (`backend/migrations/0001..0003`).*

---

## Decisión 5 — Brechas reales entre la spec y el backend (verificadas)

La spec 005 asumía que `006` cubría todo. Al mapear cada historia contra el
código real, quedan **cuatro** brechas, dos de ellas bloqueantes para un FR:

| # | Brecha | Evidencia | Impacto | Decisión propuesta |
|---|---|---|---|---|
| G1 | **No existe ningún endpoint para cambiar el rol de un usuario.** `PATCH /api/usuarios/:id` acepta solo `nombreDisplay`, `provinciaId`, `fotoUrl`; `usuario_roles` solo se lee. | `routes/usuarios.ts` | **FR-019 / US9 parcial**: se puede *listar* usuarios y sus roles, **no** otorgar/quitar admin. | US9 se implementa en modo **lectura** (lista + detalle + roles) con el control de cambio de rol **deshabilitado y explicado**; cambio de rol → dependencia de backend nueva (`007`, análoga a `004`/`006`). *Requiere confirmación — ver plan.md.* |
| G2 | **La revocación de contraseña no es distinguible de una contraseña incorrecta.** Falta de cuenta `credential` y contraseña errónea lanzan el mismo `INVALID_EMAIL_OR_PASSWORD` (401) a propósito (anti-enumeración). | `better-auth/dist/api/routes/sign-in.mjs:320-334` | **FR-002 / US1 escenario 4** no se puede cumplir literalmente ("cuando falla *porque* fue invalidada"). | Ante **cualquier** `INVALID_EMAIL_OR_PASSWORD`, mostrar un mensaje que incluya la causa posible ("Email o contraseña incorrectos. Si verificaste tu email por enlace, tu contraseña anterior fue invalidada por seguridad") + acceso directo a "ingresar con enlace por email". *Requiere confirmación — es una desviación de la letra de FR-002.* |
| G3 | **No hay forma de fijar una contraseña nueva desde el cliente** para quien perdió la credencial. `setPassword` es `serverOnly` (no expone HTTP); `request-password-reset` requiere `sendResetPassword`, que `backend/src/auth/index.ts` no configura (solo `emailAndPassword: {enabled: true}`); `change-password` exige la contraseña actual. | `better-auth/dist/api/routes/update-user.mjs:195`; `auth/providers/password.ts` | **US1 esc. 4 ("forma clara de fijar una contraseña nueva") y FR-014 ("cambiar contraseña")** solo valen para quien **ya tiene** credencial. | Perfil: "Cambiar contraseña" (con contraseña actual) solo si `list-accounts` muestra `providerId: 'credential'`; si no, se informa que ese método no está activo y que fijarlo requiere backend (dependencia `007`). |
| G4 | **El magic link no se envía por email** — `sendMagicLink` loguea el link en consola del backend (placeholder explícito). | `auth/providers/magic-link.ts`; README "Limitaciones conocidas" | SC-001 con magic link no es verificable por un usuario real todavía. Ya documentado en `002`; no es alcance de 005. | El cliente implementa el flujo completo; en desarrollo el link se toma del log del backend. Dependencia de proveedor de email (sin decidir). |

Ninguna de las cuatro se resuelve tocando el backend desde esta feature
("Cualquier cambio al backend … es dependencia, no alcance"). G1 y G3 son
candidatas naturales a un `007-backend-...` (mismo patrón que `004` y `006`).

Otros datos verificados que condicionan el diseño (no son brechas):

- **Rol y provincia del usuario actual**: `GET /api/auth/session` (propio, no
  el de Better Auth) → `{usuarioId: string, rol: 'usuario_normal'|'admin',
  provinciaId: number|null}`. Es la única fuente de rol para el cliente; el
  objeto de sesión de Better Auth (`get-session`, `useSession()`) **no** trae
  el rol. `useSession()` sirve para email/nombre, no para autorización de UX.
- **Roles en `GET /api/usuarios`**: `roles: string[]` (nunca `null` si tiene
  alguno; puede ser `null` si no tiene ninguno por el `array_agg ... FILTER`).
- **Editores**: `GET` cualquiera con acceso al organismo; `POST`/`DELETE`
  solo propietario o admin (un editor recibe 403). La UI muestra el gestor
  de editores a propietario y admin (US8 lo pide para admin; el propietario
  también puede — coherente con el backend, no se restringe de más). Para
  elegir a quién agregar hay que usar `GET /api/usuarios` (lectura amplia).
- **Pools**: `GET /api/pools-jueces` filtra por la provincia del usuario
  (admin: todos) y devuelve snake_case. Un editor de otra provincia no vería
  los pools de la provincia del organismo → si `asignaciones` referencia un
  `grupoJuecesId` que no está en la lista, mostrarlo como "pool #N (fuera de
  tu provincia)" en lugar de fallar.
- **Modelo D8**: en la base no existen los "modos" exclusivo/pool
  completo/subconjunto — todo es `(UF, pool, cantidadAsignada)`. "Exclusivo" =
  un pool que solo usa esa UF; "pool completo" = `cantidadAsignada ==
  total_jueces`; "subconjunto" = menor. La UI ofrece esos tres atajos como
  ayuda de carga, pero **no persiste un modo** (no hay dónde). Crear un
  exclusivo implica primero `POST /api/pools-jueces` (endpoint existente,
  alcance por provincia) y luego la asignación.
- **Fuero**: un organismo recién creado tiene `estado_fueros =
  'sin_fueros_asignados'` y `GET /fuero` → `{fueros: [], fueroSimplificado:
  null}`; no hay endpoint para asignar fueros, así que en el alta el fuero se
  muestra siempre vacío/solo lectura (coincide con FR-005).
- **Provincia en el alta**: `POST /api/organismos` exige `provinciaId`; el
  backend **no** compara con la provincia del usuario (a diferencia de los
  pools). "Provincia solo lectura" = prellenada con `provinciaId` de la
  sesión y no editable para `usuario_normal` (control de UX, no de acceso —
  Principio II); si el usuario no tiene provincia cargada, se bloquea el alta
  con un mensaje que lo explique. Para admin el selector es editable
  (supuesto a confirmar).
- **Localidades**: `GET /api/localidades` devuelve **todas** (sin filtro por
  provincia); el combo de UF se filtra en el cliente por `provincia_id` del
  organismo.
- **Completitud (US7)**: no existe endpoint agregado. Con 117 organismos
  (`docs/resultado-verificacion-fueros-20260918.md`) el checklist requiere
  por organismo `GET /:id`, `GET /:id/unidades-funcionales`, `GET
  /:id/taxonomia` → ≈ 350 requests, admin únicamente. Decisión v1: fan-out
  desde el cliente con concurrencia limitada (6) y progreso visible, cache de
  TanStack Query; si resulta lento, un endpoint agregado es la mejora natural
  (backend, no esta feature).

---

## Decisión 6 — Stack complementario

| Necesidad | Decisión | Por qué / alternativas |
|---|---|---|
| Ruteo | `react-router` (data router, `createBrowserRouter`, loaders no obligatorios) | Estándar con Vite SPA; guardas de ruta por rol para FR-016/FR-020. Descartado TanStack Router (más piezas para 12 pantallas). |
| Datos del servidor | `@tanstack/react-query` | Cache + invalidación tras mutaciones (lista aparece inmediatamente tras el alta — US2), reintentos, estados de carga/error uniformes, y un lugar único para interceptar `401`. |
| Auth client | `better-auth/client` (misma versión que el backend, hoy 1.7.5) con `magicLinkClient()` | Cubre `signIn.email`, `signIn.social`, `signIn.magicLink`, `signOut`, `changePassword`, `listAccounts`. Las rutas de dominio (`/api/organismos…`) usan un `fetch` propio. |
| Formularios | `react-hook-form` + `zod` + `@hookform/resolvers` | Recomendado por la doc de shadcn vigente; el formulario de taxonomía se genera con un esquema zod construido en runtime a partir del catálogo. |
| PDF (US7) | `jspdf` + `jspdf-autotable` | La spec exige generación en cliente; ya son las librerías de la app vieja (4.2.1 / 5.0.8) — se reinstalan como dependencia nueva, sin portar código. |
| Pruebas unitarias/componentes | `vitest` + `@testing-library/react` + `jsdom` | Mismo runner que el backend (Vitest). |
| Pruebas E2E | `@playwright/test` contra **backend real** + base real de pruebas | El backend del proyecto no usa mocks (README); la superficie riesgosa es auth/cookies/proxy, que un mock no ejercita. Los mocks de red quedan solo para casos de error difíciles de provocar (sesión vencida a mitad de formulario). |
| Estado de sesión | Solo `GET /api/auth/session` en TanStack Query (`staleTime` corto, `retry: false` en 401) | No hay estado global de auth aparte; `401` → invalidar y redirigir a `/login` con `returnTo`. |
| DataStudio | URL en `VITE_DATASTUDIO_URL` (env de build); si falta, el ítem de menú se oculta | FR-015; la spec asume "URL estable" pero no la da. |

Versiones vigentes al 2026-09-23 (`npm view`): vite 8.3.0, react 19.3.0,
tailwindcss/@tailwindcss/vite 4.3.3, react-router 8.4.0, @tanstack/react-query
5.103.2, react-hook-form 7.88.0, zod 4.6.5, vitest 5.0.1, @playwright/test
1.63.0, shadcn CLI 4.21.0, @vitejs/plugin-react 6.1.1. Se fijan al instalar
(`package-lock.json`). Nota: la app vieja usa `react-router-dom@7`; en la
versión vigente el paquete unificado es `react-router` — confirmar el nombre
de import al instalar.

---

## Decisión 7 — Jerarquía de menús (ajuste deliberado, US5)

Diseñada por criterio de uso, no copiando la actual. Propuesta (validar con
Santi antes de `tasks`):

```
Barra lateral (sidebar)
├─ Mis organismos                    → /organismos              (todos)
│    └─ (dentro de un organismo, pestañas) Datos · Unidades funcionales · Taxonomía · Editores
├─ Pools de jueces                   → /pools                   (todos; alcance por provincia)
├─ Tableros (DataStudio) ↗           → URL externa              (todos)
└─ Administración  (solo admin)
     ├─ Gestión de organismos        → /admin/organismos        (completitud + PDF)
     └─ Usuarios                     → /admin/usuarios
Menú de usuario (arriba a la derecha / pie del sidebar)
├─ Perfil                            → /perfil
├─ Ajustes                           → /ajustes                 (punto de entrada; contenido mínimo)
└─ Cerrar sesión
```

- Perfil, Ajustes y Tableros a ≤ 2 clics desde cualquier pantalla (SC-005:
  ≤ 3).
- "Pools de jueces" aparece como sección propia porque el backend ya expone
  el CRUD (`/api/pools-jueces`) y el flujo "exclusivo" de US4 lo necesita;
  la spec no lo lista como pantalla explícita — **a confirmar** (ver plan.md,
  Preguntas abiertas). Si se rechaza, la creación de pools se reduce al
  diálogo dentro de la asignación de jueces de una UF.
- La asignación de editores vive **dentro** del organismo (pestaña), visible
  para propietario y admin, no como una pantalla admin aparte — así el
  propietario también puede usarla, como permite el backend.
- Rutas de admin: guarda de UX + `403`/`401` del backend como control real.
  Un no-admin en `/admin/*` ve la misma pantalla que una ruta inexistente
  (FR-016), no un "acceso denegado" distinto.

---

## Decisión 8 — Lo que queda fuera de esta feature (dependencias)

- Backend nuevo para G1 (cambio de rol), G3 (fijar contraseña sin la actual)
  → propuesto `007-backend-...`.
- Proveedor de email real para magic link (G4).
- Topología de despliegue (D5): mismo origen para `/api` y estáticos.
- Registrar el `redirect_uri` de Google para desarrollo.
- No se agrega pantalla de **registro** (`sign-up/email`): la spec no la pide
  y crear cuentas con contraseña sin verificar el email choca con el Principio
  V (una cuenta no verificada es justo lo que `revokeUnprovenAccountAccess`
  borra después). Un usuario nuevo entra por Google o magic link (el hook de
  identidad lo da de alta en `usuarios`). *A confirmar.*
