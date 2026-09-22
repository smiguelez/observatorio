# Quickstart: levantar el backend y validar autorización end-to-end

**Feature**: 002-backend-api-carga-datos | **Fecha**: 2026-09-19

Guía de validación — no de implementación. Prueba que el backend levanta
contra la base ya migrada (`001-modelo-datos-relacional`), que los tres
métodos de autenticación funcionan, y que las reglas de autorización de
`contracts/api.md` se cumplen contra datos reales. No duplica el contrato
(ver [contracts/api.md](./contracts/api.md)) ni el modelo
([data-model.md](./data-model.md)).

## Prerrequisitos

- La base de `001-modelo-datos-relacional` ya aplicada y con datos
  migrados (o al menos las semillas de catálogos — ver
  `specs/001-modelo-datos-relacional/quickstart.md` Pasos 1-2).
- Node.js 20 LTS.
- Credenciales cargadas por variable de entorno (Principio XIII), sin rutas
  hardcodeadas:
  - `DATABASE_URL` (mismo rol `observatorio_app` que usa `migration/`).
  - Credenciales de OAuth de Google (client id/secret) para el método de
    Google Sign-In.
  - Un secreto de firma/cookie para Better Auth (`BETTER_AUTH_SECRET` o el
    nombre que fije la implementación).
  - Configuración de envío de email para el magic link (proveedor a
    definir en implementación — fuera del alcance de esta guía).

## Paso 1 — Levantar el esquema `auth`

```bash
cd backend
npm install
npm run migrate:auth   # getMigrations/runMigrations de better-auth/db/migration
                        # (research.md Decisión 3) — NO @better-auth/cli:
                        # está deprecado y depende de un build nativo
                        # (better-sqlite3) que puede no compilar según el
                        # entorno; el mecanismo oficial sin esa dependencia
                        # es el que expone el paquete principal.
```

**Esperado**: tablas `auth.user`, `auth.session`, `auth.account`,
`auth.verification` creadas en el esquema `auth` — **cero cambios** en
`public.*` (verificar con `\dt public.*` antes y después: mismo conteo de
tablas que documenta `specs/001-modelo-datos-relacional/quickstart.md`
Paso 1).

## Paso 2 — Levantar la API

```bash
DATABASE_URL="postgresql://..." \
BETTER_AUTH_SECRET="..." \
GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." \
  npm run dev
```

**Esperado**: la API escucha en el puerto configurado. Dos verificaciones
distintas de SC-005 (0 acceso sin autenticar), porque `/api/auth/*` tiene
sus propias convenciones de respuesta (las fija Better Auth, no nuestro
hook):

- `GET /api/auth/get-session` sin cookie → `200` con body `null` (así
  responde Better Auth a "no hay sesión" — no es un error).
- `GET /api/auth/session` (nuestra ruta, T018) sin cookie → `401` (esta sí
  pasa por el hook global de FR-004).
- Cualquier ruta de dominio (`/api/organismos`, `/api/pools-jueces`,
  `/api/usuarios`, `/api/localidades`) sin cookie → `401` siempre.

## Paso 3 — Identidad unificada entre métodos (User Story 1, SC-004)

1. Registrar un usuario nuevo: `POST /api/auth/sign-up/email` con un email
   de prueba. Guardar la cookie de sesión devuelta.
2. `GET /api/auth/get-session` con esa cookie → anotar el `usuarios.id`
   resuelto (research.md, "identidad resuelta").
3. Cerrar sesión (`POST /api/auth/sign-out`).
4. Iniciar el flujo de magic link (`POST /api/auth/sign-in/magic-link`) con
   el **mismo** email, y verificar el token recibido
   (`GET /api/auth/magic-link/verify`).
5. `GET /api/auth/get-session` con la cookie nueva → **debe** resolver al mismo
   `usuarios.id` del paso 2, no crear un usuario nuevo.

**Esperado**: mismo `usuarios.id` en los pasos 2 y 5. Si son distintos, el
hook de identidad (research.md Decisión 3) no está reconciliando
correctamente — bloqueante, no continuar con el resto de la validación
hasta corregirlo.

## Paso 4 — Un magic link no se reutiliza (SC-006)

1. Repetir el `GET /api/auth/magic-link/verify` del paso 3.5 con el **mismo**
   token ya consumido.

**Esperado**: `401`/`403` (rechazado) — no una sesión nueva.

## Paso 5 — Ownership de organismos (User Story 2, SC-002)

Con dos usuarios de prueba (A y B, ninguno admin) y sesión activa de cada
uno:

```bash
# Como A:
curl -X POST /api/organismos -d '{"denominacion": "Organismo de prueba A", ...}'
# anotar el :id devuelto -> ORG_A

# Como B, intentar leer/editar el organismo de A:
curl /api/organismos/$ORG_A          # esperado: 403
curl -X PATCH /api/organismos/$ORG_A # esperado: 403

# Como A, sobre su propio organismo:
curl /api/organismos/$ORG_A          # esperado: 200
```

**Esperado**: los tres resultados de arriba, exactos. Si `B` obtiene `200`
en cualquiera de los dos primeros, es una regresión de FR-012 — bloqueante.

## Paso 6 — Scoping por provincia en pools_jueces (User Story 3, SC-003)

Con un usuario de la provincia X (no admin) y un pool de la provincia Y ya
cargado (vía datos migrados de `001-modelo-datos-relacional` o un pool de
prueba):

```bash
curl /api/pools-jueces/$POOL_PROVINCIA_Y   # esperado: 403 (usuario es de X)
```

Repetir con un usuario de provincia Y sobre el mismo pool → esperado `200`.
Repetir con un usuario admin (cualquier provincia) → esperado `200`.

## Paso 7 — Visibilidad de perfiles y edición acotada (User Story 4)

```bash
# Como A, leer el perfil de B (visibilidad amplia confirmada, FR-017):
curl /api/usuarios/$ID_B    # esperado: 200, con email/rol/provincia de B

# Como A, intentar editar el perfil de B:
curl -X PATCH /api/usuarios/$ID_B  # esperado: 403 (FR-016)

# Como A, editar su propio perfil:
curl -X PATCH /api/usuarios/$ID_A  # esperado: 200
```

## Paso 8 — Localidades de solo lectura (User Story 5)

```bash
curl /api/localidades         # esperado: 200, lista no vacía
curl -X POST /api/localidades # esperado: no existe la ruta (404) — no un 403;
                               # confirma que no se implementó escritura, ni
                               # siquiera detrás de un chequeo de rol.
```

## Criterios de aceptación cubiertos

| Success Criteria | Validado en |
|---|---|
| SC-001 (100% de operaciones con verificación server-side) | Todos los pasos — cada request pasa por `authz/`, nunca por el cliente |
| SC-002 (acceso cruzado a organismo ajeno rechazado) | Paso 5 |
| SC-003 (scoping por provincia en pools) | Paso 6 |
| SC-004 (misma identidad entre métodos) | Paso 3 |
| SC-005 (0 acceso sin autenticar) | Paso 2 |
| SC-006 (magic link de un solo uso / expiración) | Paso 4 |
| SC-007 (revocación de editor en la siguiente solicitud) | *(no cubierto en este quickstart — requiere un editor ya cargado; ver test de integración dedicado en `backend/tests/integration/`)* |
| SC-008 (hashing de contraseñas) | *(no verificable por HTTP — se audita leyendo `auth.account` directamente: `SELECT` de la columna de password **MUST** verse como hash scrypt, nunca texto plano)* |
