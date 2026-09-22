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
- Las migraciones de `public.*` de `003-taxonomia-parametrizable` aplicadas
  (`npm run migrate:public`, ver más abajo) — reformulan
  `evaluaciones_taxonomicas` de 9 columnas fijas a una tabla de respuestas
  parametrizable por preguntas.

## Variables de entorno

Nada hardcodeado (Principio XIII) — todo viene de variables de entorno,
cargadas por `src/config/env.ts`:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | connection string de Postgres (mismo rol `observatorio_app` que usa `migration/`). |
| `BETTER_AUTH_SECRET` | secreto de firma de sesión/cookies de Better Auth. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | credenciales OAuth de Google (Principio III). |
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
│                  # proveedores (password/google/magic-link)
├── authz/         # Reglas de autorización puras (esAdmin, esOwnerOEditor,
│                  # mismaProvincia) — traducción 1:1 de
│                  # docs/firestore-rules-actuales.rules
├── routes/        # organismos, pools-jueces, usuarios, localidades, auth
├── db/            # Pool de conexión pg (mismo patrón que migration/) +
│                  # kysely.ts (instancia dedicada a migrate:public)
├── http/          # Helpers de bridging Fastify <-> Fetch API
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

## Limitaciones conocidas (deuda reconocida, no silenciosa)

- **Rate limiting de login fallido no implementado** (Principio IV, SHOULD
  — no MUST para v1). Ver `docs/decisiones-pendientes.md` D9 para el detalle
  de qué se verificó y por qué queda pendiente.
- **Envío de magic link es un placeholder que loguea el link** (no hay
  proveedor de email real decidido todavía) — ver
  `src/auth/providers/magic-link.ts`.
- **El puente Fastify↔Better Auth re-serializa el body ya parseado por
  Fastify** (`src/app.ts`) en vez de reenviar el buffer crudo — funciona
  para JSON (todos los endpoints de Better Auth lo son), pero es una
  simplificación a revisar si se agrega algún flujo no-JSON.
- **El flujo de Google OAuth no se probó de punta a punta** contra
  credenciales reales de Google (requiere un navegador real) — sí se probó
  que la ruta está configurada y devuelve una URL de autorización válida
  (`tests/contract/auth.test.ts`).
- **`GET`/`PUT /api/organismos/:orgId/taxonomia` están rotos** desde que se
  aplicó la migración de esquema de `003-taxonomia-parametrizable`: `PUT`
  falla en firme (columnas de la forma vieja de 9 columnas que ya no
  existen), `GET` no tira error pero devuelve una forma de datos
  incorrecta. Sin cobertura de test desde que se creó el endpoint — ver
  `docs/decisiones-pendientes.md` D11. Se resuelve con la feature de
  backend sobre la taxonomía nueva, no acá.
