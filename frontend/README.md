# Frontend del Observatorio (`005-frontend-cliente`)

Cliente web nuevo que reemplaza la SPA de `src/` (React + Firebase, que **no** se toca ni se reutiliza).
Consume el backend de `../backend` (`002`/`003`/`004`/`006`). Diseño en `../specs/005-frontend-cliente/`.

Stack: Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (base Radix) · React Router ·
TanStack Query · react-hook-form + zod · cliente de Better Auth.

## Cómo correr en desarrollo

Requisitos: Node 20+, el backend levantado y la base de `001` con las migraciones al día
(ver `../backend/README.md`).

```bash
# 1. Backend (puerto 3000). BETTER_AUTH_URL es OBLIGATORIA: sin ella todo POST con cookie da 403 INVALID_ORIGIN.
cd backend
BETTER_AUTH_URL="http://localhost:5173" DATABASE_URL=... BETTER_AUTH_SECRET=... \
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run dev

# 2. Frontend (puerto 5173)
cd frontend
npm install
npm run dev
```

### Cookies de sesión: proxy same-origin, sin CORS

El backend usa cookies de sesión (Better Auth) y **no tiene CORS**. Por eso en desarrollo el navegador
nunca habla con `:3000`: Vite hace proxy de `/api` (`vite.config.ts`) y todo el cliente usa **rutas
relativas** (`/api/...`), igual que en producción detrás de un mismo origen. No hay que configurar CORS
ni `trustedOrigins`. Detalle y evidencia: `../docs/resultado-verificacion-frontend-cookies-20260924.md`.
En producción `/api` debe llegar al backend por el mismo origen que los estáticos (topología: D5, abierta).

### Variables

| Variable | Dónde | Uso |
|---|---|---|
| `VITE_DATASTUDIO_URL` | `frontend/.env.local` (ver `.env.example`) | URL pública del tablero externo. Sin ella, el ítem "Tableros" no se muestra. No es un secreto |
| `BETTER_AUTH_URL` | entorno del **backend** | `http://localhost:5173` en desarrollo |

Credenciales de Google y de la base pertenecen al backend (Principio XIII): nada de eso vive acá.

## Scripts

```bash
npm run dev         # servidor de desarrollo
npm run build       # tsc -b + vite build
npm run typecheck   # tsc -b (incluye src/ y tests/)
npm run lint        # oxlint
npm test            # Vitest (unitarias y de componentes)
npm run test:e2e    # Playwright contra backend y base REALES
```

### Pruebas E2E

Corren contra el backend real y la base local (sin mocks del backend). Crean usuarios/organismos con
prefijo `test-frontend-*` y los **borran** al terminar. Requieren:

- `DATABASE_URL` (la misma base que usa el backend) y `psql` en el PATH — para armar y limpiar fixtures.
- `BACKEND_LOG`: archivo donde se redirige el stdout del backend (el magic link se **loguea**, no se envía).
- Backend y `npm run dev` corriendo; para `navegacion.spec.ts`, el dev server con
  `VITE_DATASTUDIO_URL=https://datastudio.example.test/reporte`.
- Chromium de Playwright: `npx playwright install chromium` (y sus librerías del sistema). **Sin ninguna fuente instalada en el
  sistema el texto no se dibuja** y Playwright ve los elementos como "hidden" (los `<h1>` miden 0×0): en un servidor sin
  fuentes hay que instalar al menos una (p. ej. `fonts-dejavu-core`).
- **Cómo se crean los usuarios de fixtures (008)**: `007` eliminó el alta pública por contraseña. `helpers/backend.ts`
  (`crearUsuarioConClave`) hace **alta administrada + canje del acceso inicial** por la API real (`POST /api/usuarios` y
  `POST /api/acceso-inicial/canjear`). El **único** arranque por SQL es el admin de fixtures `test-frontend-boot@example.test`
  (hace falta un admin autenticado para dar de alta y no hay admin sin credenciales); se crea/verifica en cada llamada y se
  borra con el resto por prefijo, junto con los `reset-password:*` que dejen. Por defecto el usuario queda **sin provincia**
  (por SQL, el estado de partida de los tests de 005); `{ provinciaId: n }` conserva la que dio el alta.
  `crearUsuarioSinClave` da de alta **sin canjear** (cuenta que nunca fijó contraseña).

`comparacion-visual.spec.ts` (SC-007) necesita además la SPA vieja: ver `tests/visual/spa-vieja/README.md`; sin
`VIEJA_URL` se omite. Ojo con el disco: esa SPA instala ~500 MB de `node_modules` en un directorio temporal.

Los archivos de evidencia se escriben a donde indiquen `*_EVIDENCIA` / `*_PNG` (ver cada spec).

## Estructura

```
src/
├── api/            un módulo por recurso: esquema zod (wire → dominio), funciones y hooks TanStack
├── auth/           sesión, guardas de ruta, aviso de sesión vencida
├── components/     ui/ (shadcn), layout/ (sidebar, menú de usuario, breadcrumbs), forms/
├── features/       taxonomia/ (formulario dinámico), asignaciones/ (diálogo de jueces y pools), completitud/
└── routes/         una carpeta por pantalla
tests/unit/         Vitest (mapeo, guardas, taxonomía, completitud…)
tests/e2e/          Playwright
scripts/            grabar-fixtures.mjs (recaptura respuestas reales del backend)
```

## Convenciones que importan

### Capa de mapeo (D13, `docs/decisiones-pendientes.md`)

El backend no es uniforme y **no se toca**: la capa `src/api/` lo normaliza en un solo lugar. Cada recurso
tiene un esquema zod que **valida** la respuesta, la pasa a **camelCase** y convierte los ids `bigint`
(que llegan como **string**) a `number` (`api/ids.ts`, `idWire`). Las pantallas solo ven tipos de dominio;
ninguna importa tipos "wire". Un cambio de forma en el backend falla con `ContratoInesperado` (recurso y
campo) y rompe la suite de contrato (`tests/unit/api/contrato.test.ts`, con respuestas reales grabadas
por `scripts/grabar-fixtures.mjs`).

- **smallint** (catálogos, `tipo_oficina_id`, `provincia_id`) → `number` en el wire; **bigint** (organismos,
  UF, pools, asignaciones, localidades, usuarios) → `string`. El dominio usa siempre `number`.
- Un `DELETE` no debe declarar `content-type: application/json` sin cuerpo (Fastify responde 400): el
  cliente HTTP (`api/http.ts`) solo lo declara cuando hay cuerpo.
- Con `callbackURL`, `authClient.signIn.email` hace que el navegador **navegue** a esa URL (recarga
  completa): el re-ingreso por sesión vencida lo omite a propósito.

### Autorización

La autorización real es del backend (Principio II). Las guardas de ruta, los controles ocultos o
deshabilitados y "provincia fija" son experiencia de usuario. Todo `401`/`403`/`404` se trata de forma
distinta y visible; un no-admin en `/admin/*` ve lo mismo que ante una ruta inexistente.

### Lo que NO existe a propósito

Ruta o menú de pools (se gestionan **solo** dentro del diálogo de asignación de una UF) y pantalla de registro
público: no hay forma de crearse una cuenta solo. Desde `007`/`008` **sí** existen, para un administrador, el alta de
usuarios con acceso inicial (`/admin/usuarios`) y el cambio de rol/provincia; y la pantalla pública `/primer-acceso`
(única, además de `/login`, que se abre sin sesión) donde la persona invitada fija su contraseña con el enlace que le pasó el
administrador. El acceso viaja en el **fragmento** de la URL, se quita de la dirección al leerlo y nunca se persiste.

## Limitaciones conocidas

Ver `../docs/resultado-verificacion-frontend-20260924.md` (hallazgos por historia) y
`../specs/005-frontend-cliente/tasks.md` (T030 pendiente: Google sin credencial de desarrollo).
