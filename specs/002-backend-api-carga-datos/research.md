# Research: Backend/API — autorización y carga de datos

Feature `002-backend-api-carga-datos`. Todas las decisiones de esta fase
cierran los gates pendientes del Constitution Check (Principios III/IV/V) y
las dos preguntas técnicas explícitas del usuario (framework HTTP,
librería de autenticación + dónde vive la sesión).

---

## Decisión 1 — Framework HTTP: Fastify

**Decisión**: Fastify, con `@fastify/type-provider-typebox` para validación
de esquema con inferencia de tipos TS.

**Rationale**: es la elección explícita del usuario ("Fastify es el default
a menos que algo lo desaconseje"). No encontré ninguna razón técnica
concreta para desaconsejarlo en este contexto: el ecosistema de plugins
oficiales cubre lo que la feature necesita sin librerías de terceros
frágiles — `@fastify/cookie` para cookies de sesión, `@fastify/oauth2` como
alternativa de bajo nivel si hiciera falta bypassear Better Auth en algún
flujo puntual, y una integración de Better Auth para Fastify ya existe como
paquete de la comunidad (`fastify-better-auth`), confirmando que la
combinación es un camino transitado, no experimental.

**Alternatives considered**: Express — descartado; no aporta nada que
Fastify no tenga para este caso (validación de esquema nativa de Fastify vs.
tener que sumar `zod`/`joi` a mano en Express; mejor soporte de TypeScript
de fábrica en Fastify). No until surgió ninguna limitación de Fastify que
justificara el cambio, así que se mantiene el default pedido.

Sources:
- [Fastify ecosystem](https://fastify.dev/ecosystem/)
- [fastify-better-auth (GitHub)](https://github.com/flaviodelgrosso/fastify-better-auth)
- [fastify/fastify-oauth2 (GitHub)](https://github.com/fastify/fastify-oauth2)

---

## Decisión 2 — Librería de autenticación: Better Auth (no Lucia, no Passport.js)

**Hallazgo que cambia la premisa de la pregunta**: Lucia (la opción que
sugería el pedido original) **fue deprecada como librería en marzo de
2025**. Su propio mantenedor la reconvirtió en un recurso educativo ("copiá
este código a tu proyecto") en vez de un paquete instalable — la razón
documentada es que los adaptadores de base de datos eran una complejidad
que no pagaba su costo. No es viable evaluarla hoy como "librería de sesión
multi-proveedor ya armada": ya no es una librería que se instale y mantenga
con actualizaciones. Traigo esto explícitamente porque el pedido la nombraba
como ejemplo concreto — la conclusión no es "Lucia sí o no", es que la
opción tal como se planteó ya no existe.

**Decisión**: **Better Auth**, como sucesor directo del rol que iba a
cumplir Lucia: librería de sesión multi-proveedor, activamente mantenida,
con contraseña + OAuth (incluye Google) + magic link como plugin oficial,
agnóstica de ORM/base (adaptador nativo para `pg`/Postgres vía Kysely),
soporte de esquema Postgres personalizado (`database.schemaName`), e
integración ya existente con Fastify.

**Rationale**:
- Cubre los tres métodos de autenticación del Principio III con
  configuración, no con código de flujo hecho a mano: email+contraseña
  nativo, `socialProviders.google` para Google Sign-In, y el plugin
  `magic-link` oficial para el tercer método.
- Hashing de contraseñas: scrypt por default (`@noble/hashes/scrypt`, salt
  aleatorio por usuario, formato `{salt}:{key}`, parámetros N=16384 r=16
  p=1) — scrypt es una de las tres opciones que exige el Principio IV
  ("bcrypt, argon2id o scrypt"), así que **no hace falta escribir ni
  auditar código de hashing propio**; el `passwordHasher` es reemplazable
  por argon2id después sin tocar el resto del sistema si se decide
  endurecerlo.
- Mantenimiento a largo plazo: comparado con armar los tres flujos a mano
  sobre Passport.js (que no tiene noción nativa de magic link ni de sesión
  persistida — cada estrategia de Passport requiere su propio middleware, y
  la unificación de identidad entre las tres tendría que escribirse y
  probarse por completo en este proyecto), Better Auth ya trae esa
  unificación resuelta y probada por un proyecto de terceros con
  comunidad activa — el costo de mantenimiento que queda del lado nuestro
  es de *integración* (adaptador a nuestro esquema), no de *reimplementar
  criptografía y flujos de sesión*.

**Alternatives considered**:
- **Lucia**: descartada — deprecada, ver hallazgo arriba.
- **Passport.js**: descartada como opción principal. Es genérica y madura
  para estrategias OAuth, pero no resuelve out-of-the-box ni sesión
  persistida ni magic link ni unificación de identidad entre métodos —
  cada uno de esos tres puntos (que son justamente los que exige la
  constitución, Principios III/IV/V) quedaría como código propio a
  mantener indefinidamente. Se reconsideraría solo si Better Auth resultara
  no poder integrarse con el esquema existente (ver Decisión 3) sin
  reescribir su capa de datos — no fue el caso.
- **Auth.js (NextAuth)**: no evaluada en profundidad — está más acoplada al
  ecosistema Next.js/edge; Better Auth es agnóstica de framework y ya tiene
  integración Fastify de la comunidad, que es justo lo que necesita este
  proyecto.

Sources:
- [Lucia Auth is Dead - What's Next for Auth? (Wisp CMS)](https://www.wisp.blog/blog/lucia-auth-is-dead-whats-next-for-auth)
- [A fresh start · lucia-auth/lucia · Discussion #1714](https://github.com/lucia-auth/lucia/discussions/1714)
- [Better Auth](https://better-auth.com/)
- [Better Auth — Security (password hashing)](https://better-auth.com/docs/reference/security)
- [Password Hashing in 2026: Argon2 vs bcrypt vs scrypt (reintech.io)](https://reintech.io/blog/password-hashing-2026-argon2-bcrypt-scrypt-comparison)

---

## Decisión 3 — Identidad: Better Auth NO reemplaza `usuarios`, se reconcilia contra ella (Principio V, gate crítico)

**El riesgo concreto**: el esquema por default de Better Auth crea su
propia tabla `user` (con sus propios campos obligatorios — `email`,
`emailVerified`, `name`, `image`, timestamps) y genera su propio id. Si se
usara tal cual, el sistema tendría **dos tablas de identidad**: `usuarios`
(la ya migrada y referenciada por FK desde `organismos`,
`organismo_editores`, `usuario_roles`) y la `user` de Better Auth — exactamente
la "fusión/duplicación de identidad" que el Principio V prohíbe, y además
en violación directa de la instrucción explícita de no tocar la feature 001.

**Decisión**: Better Auth vive en un **esquema Postgres separado** (`auth`,
vía la opción `database.schemaName` que la librería soporta de forma
nativa), con sus tablas propias (`auth.user`, `auth.session`,
`auth.account`, `auth.verification`) — pero **el `id` de `auth.user` para
cada persona se fija, en el momento de creación, al valor string de
`usuarios.id`** (no al id que Better Auth generaría por default), usando su
hook de ciclo de vida `databaseHooks.user.create.before`: ese hook resuelve
o crea la fila en `usuarios` (por email, `INSERT ... ON CONFLICT` /
`SELECT` previo) y le devuelve a Better Auth `{ ...datos, id: String(usuarioId) }`
para que la persista con ese id. A partir de ahí, resolver "qué usuario del
dominio es esta sesión" es: `sesión → auth.user.id (string) → Number(...) →
usuarios.id` — una conversión, no un join contra una segunda fuente de
identidad ni una tabla puente adicional.

Esto dejauna consecuencia importante y deliberada: **cero cambios al
esquema de `001-modelo-datos-relacional`** (ninguna columna nueva en
`usuarios`, ningún `ALTER TABLE`) — toda la superficie nueva de esta
feature vive en el esquema `auth`, aditivo. Cumple la instrucción explícita
del usuario de no tocar esa feature.

**Riesgo residual — ESTADO: RESUELTO por spike (T007, 2026-09-19). Resultado: GO.**

Ejecutado contra la base real (`observatorio`, mismo `DATABASE_URL` que usa
`migration/`), con `better-auth@1.7.5` instalado en `backend/`
(`backend/scripts/spike-identity.ts`, DDL de spike en
`backend/scripts/create-auth-schema.sql`).

**Lectura del código fuente de la librería** (`node_modules/better-auth/dist/db/with-hooks.mjs`,
función `createWithHooks`) muestra el mecanismo exacto:

```js
const toRun = hooks[model]?.create?.before;
if (toRun) {
  const result = await toRun(actualData, context);
  if (typeof result === "object" && "data" in result)
    actualData = { ...actualData, ...result.data };
}
created = await adapter.create({ model, data: actualData, forceAllowId: true });
```

Dos hallazgos que corrigen el research original: (1) el hook debe devolver
`{ data: { id: ... } }`, no el objeto completo con `id` sobrescrito (como
asumía la Decisión 3 original); (2) `createWithHooks` **siempre** pasa
`forceAllowId: true` al adaptador para el camino que usan `signUpEmail`,
OAuth y magic link — así que el `id` que venga en `actualData` (vía el hook)
se respeta sin necesitar ninguna config adicional.

**Evidencia empírica** (no solo lectura de código — corrida real vía
`auth.api.signUpEmail`, el mismo flujo que usaría un cliente real):

```
[spike] usuarios.id creado para spike-identidad@example.observatorio.test: 144
[spike] hook user.create.before devuelve { data: { id: '144' } }

=== EVIDENCIA: fila real en auth."user" ===
┌─────────┬───────┬─────────────────────────────────────────────┬──────────────────────────┐
│ (index) │ id    │ email                                        │ createdAt                 │
├─────────┼───────┼─────────────────────────────────────────────┼──────────────────────────┤
│ 0       │ '144' │ 'spike-identidad@example.observatorio.test'  │ 2026-09-19T19:04:12.310Z │
└─────────┴───────┴─────────────────────────────────────────────┴──────────────────────────┘
=== EVIDENCIA: fila real en public.usuarios ===
┌─────────┬───────┬─────────────────────────────────────────────┬────────────────────────┐
│ (index) │ id    │ email                                        │ firestore_id            │
├─────────┼───────┼─────────────────────────────────────────────┼────────────────────────┤
│ 0       │ '144' │ 'spike-identidad@example.observatorio.test'  │ 'spike-identidad-test' │
└─────────┴───────┴─────────────────────────────────────────────┴────────────────────────┘

[spike] auth."user".id = "144"
[spike] String(public.usuarios.id) = "144"
[spike] RESULTADO: GO — coinciden, el hook fija el id correctamente
```

`auth."user".id` y `public.usuarios.id` coinciden exactamente ("144" en
ambos). Limpieza post-spike verificada: `public.usuarios` volvió a 47 filas
(baseline de la reconciliación de US2), `public.*` sigue con las mismas 19
tablas (0 tablas nuevas — el spike no tocó el esquema de dominio).

### Actualización 2026-09-19 — estrategia de migraciones para `auth.*`: adaptador confirmado, causa raíz real, y la vía oficial correcta

Pregunta a responder: ¿qué adaptador tiene configurado nuestra instancia de
Better Auth (Kysely, o `pg` directo), y qué implica eso para si el DDL
manual del spike es la respuesta correcta?

**1. Nuestro adaptador es Kysely — confirmado leyendo el código, no supuesto.**

Nuestra config es `database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth' }`.
En `node_modules/@better-auth/kysely-adapter/dist/index.mjs`, la función
`createKyselyAdapter(config)` maneja esa forma exacta en la rama
`if ("dialect" in db)`:

```js
if ("dialect" in db) {
  const schemaName = db.schemaName;
  const kysely = new Kysely({ dialect: db.dialect });
  return { kysely: schemaName ? kysely.withSchema(schemaName) : kysely, ... };
}
```

Devuelve una instancia real de `Kysely`. Más aún: **no existe una vía "pg
directo" que evite Kysely** en el adaptador Postgres incluido de Better
Auth — si en vez de la forma explícita hubiéramos pasado el `pg.Pool` crudo
(`database: pool`), la misma función lo habría envuelto igual
(`if ("connect" in db) dialect = new PostgresDialect({ pool: db })`), solo
que sin poder pasar `schemaName`. La única forma de terminar con
`kysely: null` (y ahí sí, ningún mecanismo de migración de Kysely aplicaría)
es pasar un adaptador custom completo (`DBAdapterInstance`, tipo Prisma/
Drizzle o uno escrito a mano implementando `create`/`update`/`findMany`) —
que **no es nuestro caso** y no está planteado en ningún lado de este plan.

**Conclusión de la pregunta**: tu hipótesis (CLI solo aplica al adaptador
Kysely) es correcta como regla general, pero **no es la causa de la falla
que vimos** — sí estamos en Kysely, así que el mecanismo de migración de
Better Auth (que opera sobre la instancia Kysely vía `db.introspection`,
`db.schema.createSchema()`, etc.) es aplicable a nuestro caso.

**2. La causa real de que `npx @better-auth/cli migrate` fallara: build nativo roto en este entorno, no incompatibilidad de adaptador.**

Investigando por qué fallaba sin mensaje (`exit 1`, sin salida), instalé el
paquete localmente para ver el error real en vez de dejar que `npx` lo
silenciara:

```
npm error gyp ERR! stack Error: not found: make
...
npm error gyp ERR! cwd .../backend/node_modules/better-sqlite3
```

`@better-auth/cli` depende transitivamente de `better-sqlite3` (un addon
nativo) y este entorno no tiene `make`/toolchain de compilación instalado
— la instalación del propio CLI fallaba, no la migración en sí. Es un
problema de entorno (`build-essential` ausente), no de nuestro adaptador. En
un host con `make` instalado, es plausible que `@better-auth/cli` sí
funcionara — **pero eso no lo hace la vía recomendada**: `npm view
@better-auth/cli deprecated` confirma independientemente "Package no longer
supported", y su última versión (1.4.21 estable) va rezagada respecto de
`better-auth@1.7.5` — un riesgo de mantenimiento aparte del bug de build.

**3. La vía oficial correcta: `better-auth/db/migration`, empaquetada en el paquete PRINCIPAL, sin dependencias nativas — probada y funciona.**

`better-auth`(core, no el CLI separado) expone `getMigrations`/`runMigrations`
como subpath público (`"./db/migration"` en su `package.json`, resuelto a
`dist/db/get-migration.mjs`). Es el mismo motor que usaría el CLI
internamente, pero invocable en proceso, sin `better-sqlite3` ni ningún
binario nativo. Probado en vivo (`backend/scripts/migrate-auth.ts`)
contra la base real:

```
[investigación] toBeCreated (tablas nuevas): ["user", "session", "account", "verification"]
[investigación] SQL que se ejecutaría (compileMigrations()):

create schema if not exists "auth";
create table "auth"."user" (...);
create table "auth"."session" (..., "userId" text not null references "auth"."user" ("id") on delete cascade);
create table "auth"."account" (...);
create table "auth"."verification" (...);
create index "session_userId_idx" on "auth"."session" ("userId");
create index "account_userId_idx" on "auth"."account" ("userId");
create index "verification_identifier_idx" on "auth"."verification" ("identifier");

[investigación] Ejecutando runMigrations() contra la base real...
[investigación] runMigrations() terminó sin lanzar excepción.
```

`\dt auth.*` después de esto muestra las 4 tablas creadas por la propia
librería. **El DDL manual del spike original (`create-auth-schema.sql`) no
es la respuesta correcta**: le faltaban los tres índices que sí genera la
migración oficial (`session.userId`, `account.userId`,
`verification.identifier`) y difería en el default de `createdAt`
(`CURRENT_TIMESTAMP` vía Kysely vs. `NOT NULL` sin default en mi DDL a
mano). Quedó marcado como superado en el propio archivo, conservado solo
como registro histórico del primer intento.

**Re-validación**: con el esquema creado por la vía oficial, volví a correr
el spike de identidad (T007) completo — mismo resultado, **GO**
(`auth."user".id = "145"`, `String(usuarios.id) = "145"`, coinciden;
limpieza verificada, `usuarios` de vuelta a 47 filas). El hallazgo de la
CLI no cambia el resultado de Principio V, solo corrige cuál es la
estrategia de migraciones correcta para T009 en adelante.

**Decisión de estrategia de migraciones (reemplaza las 3 opciones (a)/(b)/(c) planteadas antes de esta investigación)**: usar `getMigrations`/`runMigrations` de `better-auth/db/migration` de forma programática (p. ej. un script `backend/scripts/migrate-auth.ts` corrido en deploy), **no** `@better-auth/cli` ni DDL mantenido a mano. Sin dependencia nativa, sin paquete deprecado, y es literalmente el mismo motor que generaría el CLI si funcionara.

**Nota sobre columnas "requeridas" de Better Auth** (`name` en `user`,
`required: true`, sin default): el spike las satisfizo pasándolas
explícitamente en el `sign-up` (`name: 'Usuario de prueba...'`). Para
Google OAuth y magic link, Better Auth normalmente completa `name` desde el
perfil del proveedor o desde el email — no se probó en este spike (alcance
de T007 era específicamente el mecanismo de `id`, no los otros dos
proveedores, que se configuran en US1). Queda para las tareas de US1
confirmar que ninguno de los tres proveedores falla por un campo requerido
sin valor.

**Alternatives considered**:
- Dejar que Better Auth cree su propio `user.id` y mapear por email en cada
  request — descartado: reintroduce exactamente la comparación por email
  que el Principio V y el FR-011 prohíben como fuente de identidad de
  sesión (el email queda como dato de comparación de negocio —
  owner/editor—, no como identificador de sesión).
- Migrar `usuarios` para que sea literalmente la tabla `user` de Better
  Auth (agregarle las columnas que la librería requiere) — descartado:
  viola la instrucción explícita de no modificar la feature 001, y acopla
  el esquema de dominio ya migrado a los requisitos internos de una
  librería de terceros que puede cambiar de versión en versión.

Sources:
- [Better Auth — Database concepts](https://better-auth.com/docs/concepts/database)
- [Better Auth — PostgreSQL adapter, custom schema](https://better-auth.com/docs/adapters/postgresql)
- [feat(postgres): custom schema name (PR #11203)](https://github.com/better-auth/better-auth/pull/11203)
- [Better Auth — Users & Accounts](https://better-auth.com/docs/concepts/users-accounts)

---

## Decisión 4 — Dónde vive la sesión: tabla en Postgres (no JWT sin estado)

**Decisión**: sesión persistida en `auth.session` (tabla propia de Better
Auth en el esquema `auth`), identificada al cliente por una cookie
`httpOnly` con un id de sesión opaco — **no** un JWT sin estado.

**Rationale**:
- Es el default de Better Auth (sesiones en base, no JWT) — no hace falta
  desviarse del camino mejor soportado por la librería elegida.
- Revocación inmediata: SC-007 exige que remover a un editor pierda acceso
  "en su siguiente solicitud, sin requerir cierre e inicio de sesión". Con
  una sesión en base, cerrar sesión de un usuario (por ejemplo, tras
  cambiar su contraseña, o una acción de admin) es un `DELETE`/`UPDATE`
  inmediato; con JWT sin estado, revocar antes de la expiración exige de
  todos modos una lista de revocación con estado en algún lado — se pierde
  la ventaja de "sin estado" en cuanto se necesita revocación real, que acá
  se necesita.
- Consistencia con el resto del proyecto: todo el dato ya vive en la misma
  base Postgres (Principio I); no hay razón para introducir un segundo
  mecanismo de estado de sesión (Redis, KV) cuando la base ya está ahí y
  alcanza para el volumen de esta herramienta interna.
- FR-002 exige releer el estado actual de autorización en cada request de
  todos modos (rol, provincia, ownership) — eso ya implica una consulta a
  `public.*` por request; sumar una consulta/lookup de sesión contra
  `auth.session` no es un costo cualitativamente distinto.

**Alternatives considered**: JWT sin estado — descartado por lo de arriba
(revocación real exige estado igual, así que no hay ganancia neta; y el
propio pedido del usuario ya señalaba la tabla de sesiones como la opción
"consistente con que ya tenés todo en la misma base").

Sources:
- [Fastify session store discussion (@fastify/session vs secure-session)](https://github.com/fastify/fastify/discussions/4186)
- [@fastify/session — npm](https://www.npmjs.com/package/@fastify/session)

---

## Decisión 5 — Magic link: plugin oficial de Better Auth, expiración corta configurada explícitamente

**Decisión**: plugin `magic-link` de Better Auth, con `expiresIn`
configurado a un valor de minutos (a fijar en `tasks.md`/implementación,
Principio IV pide "orden de minutos") — **no** el default de la librería
sin revisar, porque el Principio IV es un MUST propio de este proyecto, no
una config que deba heredarse sin verificar del valor por default de un
tercero.

**Rationale**: el plugin ya implementa de fábrica "un solo uso" e
invalidación tras el primer uso o expiración (Principio IV) — la única
verificación pendiente de implementación es fijar explícitamente el TTL en
minutos en vez de aceptar el default sin revisarlo, y confirmarlo con un
test de integración (magic link usado dos veces → segundo uso rechazado;
magic link vencido → rechazado) antes de dar por cumplido SC-006.

**Alternatives considered**: implementar magic link a mano (generar token,
tabla propia, endpoint de verificación) — descartado por ser exactamente el
tipo de código de seguridad que Better Auth ya resuelve y mantiene; hacerlo
a mano solo tendría sentido si Better Auth no cubriera el caso, y sí lo
cubre.

### Actualización 2026-09-21 — implementado (T014-T018) y verificado contra el servidor real

`expiresIn` quedó fijado a `300` (5 minutos) en
`backend/src/auth/providers/magic-link.ts`. `sendMagicLink` es un
placeholder que loguea el link — no hay proveedor de email real decidido
todavía (fuera de alcance hasta ahora); a resolver antes de un ambiente que
no sea de pruebas.

**Hallazgo no anticipado, relevante para FR-010/Principio V**: al verificar
el Independent Test de US1 (alta por contraseña → magic link con el mismo
email), encontré que la cuenta de credencial (`auth.account`,
`providerId: 'credential'`) del usuario **desaparece** después de verificar
el magic link, si el email todavía no estaba verificado. No es un bug: es
`revokeUnprovenAccountAccess` (`node_modules/better-auth/dist/db/revoke-unproven-account-access.mjs`),
una función documentada en el propio código fuente que borra **todas** las
cuentas/vínculos y sesiones de un usuario con `emailVerified: false` en el
momento en que un método de prueba de email (magic link, email OTP)
confirma la propiedad real de ese email. El propósito documentado en el
código es exactamente el escenario de apropiación de cuenta que FR-010
busca prevenir: alguien se registra con el email de otra persona (sin
poder verificarlo) y le pone una contraseña; cuando el dueño real prueba su
email por magic link, el sistema revoca esa credencial ajena en vez de
dejarla coexistir. Esto es **más estricto** que lo mínimo que pedía FR-010
(que solo exigía no fusionar automáticamente sin verificar) — no hizo falta
código adicional de nuestra parte para esto, viene del comportamiento
default de la librería. Verificado empíricamente: `usuarios.id`/`auth."user".id`
se mantuvieron estables (mismo id en ambos métodos), y el login por
contraseña deja de funcionar después de la promoción — comportamiento
correcto, no una regresión.

**Bug real encontrado y corregido durante esta verificación** (no
relacionado con lo anterior): el hook de identidad
(`backend/src/auth/identity-hook.ts`) reusaba el mismo parámetro `$1` dos
veces en el `INSERT` (`VALUES ($1, $1)` para `email` y `firestore_id`) —
Postgres no puede inferir un tipo único para `$1` cuando una columna es
`citext` (`email`) y la otra es `text` (`firestore_id`), y falla con
`inconsistent types deduced for parameter $1`. Se corrigió pasando el mismo
valor dos veces como parámetros separados (`$1, $2`). El spike original
(T007) no lo detectó porque usaba un `firestore_id` distinto al email
(`FIRESTORE_ID_PRUEBA`, un valor constante), no la misma columna dos veces.

---

## Decisión 6 — Acceso a datos: `pg` directo, mismo patrón que `migration/`, sin ORM nuevo

**Decisión**: driver `pg` (node-postgres) con consultas parametrizadas,
igual que `migration/src/load/pg-client.js` — connection pool desde
`DATABASE_URL`, sin ORM ni query builder nuevo para el código de dominio
(`public.*`). Better Auth usa su propio adaptador Kysely internamente para
`auth.*`, pero eso es interno a la librería y no exige que el resto del
backend adopte Kysely también.

**Rationale**: es el patrón que pidió el usuario reusar; introducir un ORM
(Prisma) o un query builder (Kysely) para el código de dominio es una
decisión de arquitectura no pedida y no necesaria para el alcance de esta
spec — el volumen de entidades (organismos, UF, taxonomía, pools_jueces,
usuarios, localidades) es chico y ya hay un patrón probado en el repo.

**Alternatives considered**: Kysely para el código de dominio también (por
consistencia con lo que usa Better Auth internamente) — descartado por
ahora: agrega una dependencia y una curva de aprendizaje sin necesidad
demostrada; se puede reconsiderar en una fase posterior si el volumen de
queries a mano se vuelve difícil de mantener, pero eso es una decisión para
cuando ese problema exista, no antes.

---

## Decisión 7 — Testing: Vitest + `fastify.inject()`

**Decisión**: Vitest para tests unitarios y de contrato; `app.inject()` de
Fastify para probar rutas HTTP sin abrir un socket real (permite probar
cada regla de autorización de `spec.md` — FR-012 a FR-019 — como un test de
request/response contra la app real, con una base de test).

**Rationale**: no hay convención previa en el repo (ni `migration/` ni el
frontend tienen test runner) — Vitest es el default razonable para
TypeScript + ESM en 2026 sin configuración adicional; `fastify.inject()` es
el mecanismo oficial de Fastify para tests de integración sin overhead de
red, ideal para las ~19 combinaciones owner/editor/admin/ajeno y
provincia/admin/ajena que las Success Criteria piden verificar al 100%.

**Alternatives considered**: `node:test` (built-in, cero dependencias) —
válido, pero Vitest tiene mejor soporte de TS out-of-the-box y mocking, sin
costo relevante adicional para un backend de este tamaño.
