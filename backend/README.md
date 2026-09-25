# Backend/API del Observatorio de Oficinas Judiciales

Feature `002-backend-api-carga-datos`. Reemplaza el acceso directo del
navegador a PostgreSQL (Principio II) y reconstruye server-side el modelo de
autorización de `docs/firestore-rules-actuales.rules` (Principio VI) sobre
el modelo relacional ya migrado en `001-modelo-datos-relacional`, sin
modificarlo.

A diferencia de `migration/` (herramienta de un solo uso), esto **es un
servicio de larga vida**: corre de forma continua, es lo que el frontend
nuevo consume en producción.

## Requisitos

- Node.js 20 LTS.
- La base de `001-modelo-datos-relacional` ya aplicada (esquema `public` +
  semillas de catálogos como mínimo — ver
  `specs/001-modelo-datos-relacional/quickstart.md` Pasos 1-2).
- Las migraciones de `public.*` aplicadas (`npm run migrate:public`, ver más
  abajo) — `0001`/`0002` (`003-taxonomia-parametrizable`) reformulan
  `evaluaciones_taxonomicas` de 9 columnas fijas a una tabla de respuestas
  parametrizable por preguntas; `0003` (`004-fix-taxonomia-endpoint`) agrega
  la guarda de integridad organismo↔pregunta (ver "Endpoint de taxonomía"
  más abajo).

## Variables de entorno

Nada hardcodeado (Principio XIII) — todo viene de variables de entorno,
cargadas por `src/config/env.ts`:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | connection string de Postgres (mismo rol `observatorio_app` que usa `migration/`). |
| `BETTER_AUTH_SECRET` | secreto de firma de sesión/cookies de Better Auth. |
| `BETTER_AUTH_URL` | **obligatoria.** URL pública (origen) desde la que el navegador accede a la app, p. ej. `http://localhost:5173` en desarrollo con el frontend de `005` detrás del proxy de Vite, o el dominio real en producción. Better Auth la toma directamente del entorno (no pasa por `src/config/env.ts`) y la usa como único origen confiable: **sin ella, todo `POST` que lleve cookie de sesión responde `403 INVALID_ORIGIN`, incluso desde el mismo origen del backend**, sin importar el `Host`/`Origin` ni `changeOrigin` de un proxy (verificado el 2026-09-24 en `docs/resultado-verificacion-frontend-cookies-20260924.md`). No hay CORS configurado: el cliente debe ir same-origin. Los tests de `backend/` (`app.inject`) corren sin ella (verificado el 2026-09-24 con `tests/contract/auth.test.ts` y `organismos.test.ts`), por eso no figura en el comando de tests. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | credenciales OAuth de Google (Principio III). |
| `ACCESO_INICIAL_TTL_HORAS` | opcional, default `24`. Vigencia (en horas, entero > 0) del acceso inicial que un administrador entrega a un usuario recién dado de alta (007). |
| `PORT` | puerto HTTP (default `3000`). |

No hay todavía una variable para un proveedor de email real — ver
"Limitaciones conocidas" abajo.

## Cómo correr

```bash
npm install

# 1. Migrar el esquema `auth` (idempotente — no toca public.*)
npm run migrate:auth

# 2. Migrar el esquema `public.*` (idempotente — no toca auth.*)
npm run migrate:public

# 3. Levantar la API
DATABASE_URL="postgresql://..." \
BETTER_AUTH_SECRET="..." \
BETTER_AUTH_URL="http://localhost:5173" \
GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." \
  npm run dev
```

`npm run migrate:auth` usa `getMigrations`/`runMigrations` de
`better-auth/db/migration` (research.md, Decisión 3, actualización
2026-09-19) — **no** `@better-auth/cli`: ese paquete está deprecado y además
depende de un build nativo (`better-sqlite3`) que puede no compilar según el
entorno (pasó en el nuestro, por falta de `make`).

`npm run migrate:public` corre `scripts/migrate-public.ts`: el `Migrator` +
`FileMigrationProvider` de Kysely sobre los archivos `.ts` de
`migrations/` (`003-taxonomia-parametrizable`, research.md Decisión 1) —
primera vez que `public.*` tiene migraciones versionadas en vez de un
`db/schema.sql` aplicado a mano una sola vez. Transaccional (si algo falla
a mitad de camino, incluida cualquier reconciliación que la migración
haga, se revierte entera — Principio X) e idempotente (`migrate:public`
corrido de nuevo sobre una base al día imprime "Nada que migrar", no
reintenta migraciones ya aplicadas). Su propio historial de ejecución vive
en `migrations.kysely_migration`/`migrations.kysely_migration_lock` — un
esquema aparte, igual criterio que `auth.*` (infraestructura de una
herramienta, separada del dominio), no en `public`.

Para escribir una migración nueva: un archivo `NNNN_descripcion.ts` en
`migrations/` que exporte `up`/`down` (`Kysely<any>`, DDL/DML vía el tag
`sql` cuando el query builder no alcanza — funciones y triggers, por
ejemplo). El orden de ejecución es alfabético por nombre de archivo. Una
migración ya aplicada y trackeada **no se edita** — un ajuste posterior es
siempre una migración nueva (ver
`specs/003-taxonomia-parametrizable/research.md`, Decisión 5, para el caso
real que motivó esta regla).

## Cómo correr los tests

Contra la base real (no hay mocks en este proyecto) — requiere las mismas
variables de entorno que `npm run dev`:

```bash
DATABASE_URL="postgresql://..." \
BETTER_AUTH_SECRET="..." \
GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." \
  npx vitest run
```

Cada archivo de test limpia sus propios datos (prefijos `test-*` en emails y
en `descripcion` de pools) antes y después de correr — no debería dejar
rastro en `usuarios`/`organismos`/`grupos_jueces`/`localidades`. Ver
`tests/helpers/db.ts`.

## Estructura

```
src/
├── auth/          # Instancia de Better Auth, hook de identidad (Principio V),
│                  # proveedores (password/google/magic-link), acceso inicial (007)
├── authz/         # Reglas de autorización puras (esAdmin, esOwnerOEditor,
│                  # mismaProvincia) — traducción 1:1 de
│                  # docs/firestore-rules-actuales.rules
├── services/      # provisión de usuarios, rol, provincia (007; transacciones)
├── routes/        # organismos, pools-jueces, usuarios, localidades, auth, acceso-inicial
├── db/            # Pool de conexión pg (mismo patrón que migration/) +
│                  # kysely.ts (instancia dedicada a migrate:public)
├── http/          # Bridging Fastify <-> Fetch API + manejador central de errores (007)
└── config/        # Carga de variables de entorno (Principio XIII)

migrations/        # Migraciones versionadas de public.* (Migrator de
                    # Kysely, 003-taxonomia-parametrizable) — NNNN_*.ts
                    # con up()/down(), corridas por scripts/migrate-public.ts

tests/
├── contract/      # Status codes por recurso, contra contracts/api.md
├── integration/   # Escenarios de autorización cruzada, revocación, identidad
└── unit/          # Reglas de authz/ en aislamiento
```

Ver `specs/002-backend-api-carga-datos/contracts/api.md` para el contrato
completo de endpoints y `specs/002-backend-api-carga-datos/quickstart.md`
para la guía de validación manual paso a paso.

## Endpoint de taxonomía (`004-fix-taxonomia-endpoint`)

`GET`/`PUT /api/organismos/:orgId/taxonomia` fueron reconstruidos contra el
esquema de `003-taxonomia-parametrizable` — estaban rotos desde esa
migración (`docs/decisiones-pendientes.md`, D11, resuelta por esta
feature). `GET` agrupa las respuestas por pregunta (código/texto/tipo
incluidos); `PUT` reemplaza el conjunto completo de forma atómica y
traduce cualquier rechazo de trigger a un `400` identificable (nunca un
`500` genérico — `src/http/trigger-error.ts`, `SQLSTATE P0001`). Contrato
completo en `specs/004-fix-taxonomia-endpoint/contracts/api.md`.

Dos protecciones de integridad nuevas, relacionadas con un caso real
(organismo id=311, "OGA MEDIACIÓN") documentado en
`specs/003-taxonomia-parametrizable/spec.md`:

- **Protección A** (migración `0003`, trigger `trg_evaluacion_tipo_organismo_valido`):
  ninguna respuesta *nueva* puede guardarse para una pregunta que no
  aplica al tipo actual del organismo. No revalida datos ya existentes.
- **Protección B** (`PATCH /api/organismos/:id`, campo opcional
  `confirmarPerdidaTaxonomia`): cambiar el tipo de un organismo con
  respuestas que dejarían de aplicar exige confirmación explícita; sin
  ella, el pedido se rechaza listando qué se perdería. Sin ningún
  mecanismo de historial/archivado de lo eliminado — decisión explícita.

## Catálogos y asignaciones faltantes (`006-backend-endpoints-faltantes`)

`005-frontend-cliente` verificó que 5 grupos de datos no tenían ningún
endpoint — bloqueaba directamente 4 de sus historias de usuario. Esta
feature los agrega, **sin ninguna migración de esquema** (las 12
tablas/vista ya existían completas — `research.md`, Decisión 1):

- `GET /api/provincias`, `/api/denominaciones-simplificadas`,
  `/api/tipos-oficina`, `/api/tipos-uf`, `/api/fueros` — catálogos de
  referencia, solo lectura, cualquier autenticado (`src/routes/catalogos.ts`).
- `GET /api/organismos/:orgId/fuero` — detalle de fueros +
  `fuero_simplificado` (D3), solo lectura.
- `GET/POST/PATCH/DELETE /api/organismos/:orgId/unidades-funcionales/:ufId/asignaciones-jueces(/:asignacionId)` —
  asignación de jueces por UF (D8: exclusivo, pool completo, o
  subconjunto, cada uno con su cantidad).
- `GET/POST/DELETE /api/organismos/:orgId/editores(/:usuarioId)` —
  gestión de editores, restringida a propietario o admin (no a editores
  entre sí).
- `GET /api/taxonomia/preguntas[?tipoOficinaId=]` — catálogo completo de
  preguntas de taxonomía (`src/routes/taxonomia.ts`), distinto del
  endpoint de respuestas de `004` (que solo devuelve lo ya respondido).

Las reglas de integridad de las asignaciones de jueces y de los editores
ya estaban garantizadas por el esquema (`UNIQUE`/`CHECK`/`FK`, sin
triggers propios) — `src/http/trigger-error.ts` se generalizó
(`esRechazoDeIntegridad`, `mensajeDeIntegridad`) para traducir esos
rechazos a un `400` identificable, el mismo problema que `004` (D11) ya
había resuelto para triggers con `RAISE EXCEPTION`, ahora también para
constraints declarativos simples.

## Identidad y autorización (`007-identidad-autorizacion`)

Contrato completo: `specs/007-identidad-autorizacion/contracts/api.md`. Resumen operativo:

- **Nadie se da de alta solo.** Solo existen identidades para emails que ya están en `usuarios`
  (`src/auth/identidad-hook.ts`, por los tres métodos). No hay alta pública por contraseña
  (`disableSignUp`). El pedido de enlace de un email no dado de alta responde igual que el de uno dado de alta,
  pero no genera ni registra ningún enlace.
- **Cómo dar de alta a alguien** (solo admin): `POST /api/usuarios` con `{ email, rol, provinciaId }`. La respuesta
  trae, **una sola vez**, el `accesoInicial` (`token` + `vence`). El admin se lo hace llegar a la persona (no hay
  correo hasta la Fase C; se recomienda un enlace con el token en el **fragmento**: `…/primer-acceso#token=…`).
  La persona lo canjea en `POST /api/acceso-inicial/canjear { token, password }` (ruta pública, un solo uso), que fija su
  contraseña y deja la sesión iniciada. Si lo pierde: `POST /api/usuarios/:id/acceso-inicial` emite uno nuevo y el
  anterior deja de servir. Vencimiento: `ACCESO_INICIAL_TTL_HORAS` (24 por defecto).
- **Provincia y rol** los escribe solo un admin (`PATCH /api/usuarios/:id` con `provinciaId`; `PUT /api/usuarios/:id/rol`).
  Rigen en la siguiente solicitud del afectado, sin re-login. El sistema nunca queda sin administradores.
- **Cambiar la contraseña**: `POST /api/auth/change-password`. El servidor cierra siempre las demás sesiones y
  **rota la cookie de sesión** de la actual: el cliente debe aceptar el nuevo `Set-Cookie` (el navegador lo hace solo;
  un cliente que guarde el token a mano debe leer el nuevo).
- **Errores**: `http/errores-integridad.ts` traduce los rechazos de integridad causados por el cliente a `400 { error }`;
  lo inesperado sigue siendo `500`. Los rechazos de taxonomía traen `preguntaCodigo` y `preguntaTexto`.
- **Migración `0004`** (solo funciones, reversible): mensajes legibles de los triggers de taxonomía.
- **Pruebas**: el alta pública dejó de existir; `crearUsuarioDePrueba` (`tests/helpers/db.ts`) da de alta por el mismo
  servicio que la ruta y canjea el acceso inicial. La regla del último administrador se prueba en un esquema aislado
  (`tests/integration/ultimo-admin.test.ts`) para no tocar jamás el rol de los administradores reales.
- **Spikes** (`scripts/spike-007-*.ts`) se conservan como test de humo de compatibilidad con `better-auth@1.7.5`
  (versión fijada): `BETTER_AUTH_URL=http://localhost:5173 npx tsx scripts/spike-007-identidad.ts` debe dar `19/19 casos PASS`.

## Limitaciones conocidas (deuda reconocida, no silenciosa)

- **Rate limiting de login fallido no implementado** (Principio IV, SHOULD
  — no MUST para v1). Ver `docs/decisiones-pendientes.md` D9 para el detalle
  de qué se verificó y por qué queda pendiente.
- **Envío de magic link es un placeholder que loguea el link** (no hay
  proveedor de email real decidido todavía) — ver
  `src/auth/providers/magic-link.ts`. Desde `007` solo se registra el de emails dados de alta.
- **El canje del acceso inicial es público y sin rate limiting** (D10, Fase E): se apoya en un token de un solo uso,
  alta entropía y vencimiento. `POST /api/auth/reset-password` (de Better Auth) sigue alcanzable con el mismo token.
- **El puente Fastify↔Better Auth re-serializa el body ya parseado por
  Fastify** (`src/app.ts`) en vez de reenviar el buffer crudo — funciona
  para JSON (todos los endpoints de Better Auth lo son), pero es una
  simplificación a revisar si se agrega algún flujo no-JSON.
- **El flujo de Google OAuth no se probó de punta a punta** contra
  credenciales reales de Google (requiere un navegador real) — sí se probó
  que la ruta está configurada y devuelve una URL de autorización válida
  (`tests/contract/auth.test.ts`).
