# Implementation Plan: Backend/API — autorización y carga de datos

**Branch**: `002-backend-api-carga-datos` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-backend-api-carga-datos/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Backend HTTP propio (Node.js 20 + TypeScript + Fastify) que reemplaza el
acceso directo del navegador a PostgreSQL (Principio II) y reconstruye,
server-side, el modelo de autorización de `docs/firestore-rules-actuales.rules`
(Principio VI) sobre el modelo relacional ya migrado en
`001-modelo-datos-relacional` — sin modificarlo. Autenticación multi-método
(local, Google, magic link — Principio III) vía **Better Auth**, con sesiones
persistidas en Postgres en un esquema propio (`auth`), separado del esquema
de dominio (`public`), y reconciliadas 1:1 contra `usuarios.id` mediante un
hook de creación de identidad — nunca una segunda tabla de identidad
paralela (Principio V). Toda autorización (ownership de organismos,
provincia de pools_jueces, rol admin) se evalúa en cada request contra el
estado actual de `public.*`, resuelto siempre a partir del `usuarios.id` de
la sesión, no del email (FR-011).

## Technical Context

**Language/Version**: Node.js 20 LTS + TypeScript (decisión del usuario;
mismo runtime que `migration/`, sin research adicional).

**Primary Dependencies**: Fastify (HTTP; decisión del usuario) +
`@fastify/type-provider-typebox` (validación de esquema nativa de Fastify,
con inferencia de tipos TS) + `pg` (mismo driver/patrón de conexión que
`migration/`) + **Better Auth** (autenticación multi-método — ver
research.md) + `arctic` no se usa directamente (Better Auth ya integra
OAuth de Google internamente).

**Storage**: PostgreSQL 17, mismo servidor y misma base que
`001-modelo-datos-relacional` (`foros-ubuntu`, rol `observatorio_app`,
`DATABASE_URL` por variable de entorno — Principio XIII). Dos esquemas:
`public` (dominio, ya migrado, sin cambios) y `auth` (tablas propias de
Better Auth — nuevo, aditivo).

**Testing**: Vitest + `fastify.inject()` para tests de contrato/integración
sobre las rutas HTTP sin levantar un socket real; no hay convención previa
en el repo que reutilizar (el frontend actual no tiene test runner).

**Target Platform**: Linux server (mismo host que ya corre PostgreSQL,
`foros-ubuntu`) — sin contenedor ni servidor nuevo.

**Project Type**: web-service (backend/API). El frontend que la consume está
fuera de alcance de esta spec y de este plan.

**Performance Goals**: sin objetivo de escala especificado — el dominio son
~24 jurisdicciones y un puñado de referentes por organismo (spec.md no fija
un SC de throughput); se diseña para correctitud de autorización primero,
sin optimización prematura.

**Constraints**: toda decisión de autorización evaluada server-side en cada
request contra el estado actual de la base (FR-002) — sin caché de rol/
provincia/ownership en el token de sesión.

**Scale/Scope**: 19 tablas de dominio ya migradas (`001-modelo-datos-relacional`),
~47 usuarios, ~117 organismos hoy; 5 historias de usuario (spec.md), ~19
requisitos funcionales.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplica | Evaluación (pre-research) |
|---|---|---|
| I. Soberanía de datos sobre GCP | Sí | Postgres self-hosted ya elegido en 001; Google Sign-In se mantiene como método de auth (explícitamente excluido de esta restricción por el propio Principio I) — no reintroduce dependencia de GCP en la ruta crítica de datos/autorización. **PASS**. |
| II. La autorización vive en el servidor | Sí | Es el objetivo central de la feature (FR-001 a FR-004). **PASS** en diseño; se re-verifica en Fase 1 que ningún contrato exponga un atajo cliente-DB. |
| III. Autenticación plural | Sí | Better Auth cubre los 3 métodos desde el lanzamiento (FR-005) — a confirmar en research.md que ninguno es prerequisito de los otros. **PENDIENTE de research**. |
| IV. Credenciales/tokens seguros | Sí | Requiere decidir algoritmo de hashing y expiración de magic link en research.md (FR-006/007). **PENDIENTE de research**. |
| V. Identidad unificada | Sí | Riesgo concreto: la librería de auth elegida no debe crear una segunda tabla de identidad paralela a `usuarios`. **GATE CRÍTICO** — se resuelve explícitamente en research.md (Decisión 3) antes de continuar a Fase 1. |
| VI. Autorización reconstruida desde la fuente | Sí | `spec.md` ya se construyó leyendo `docs/firestore-rules-actuales.rules` completo, no `SPEC.md`. **PASS** (heredado de la spec, no de este plan). |
| VII-X (modelo de datos / migración) | No | Esta feature consume `001-modelo-datos-relacional` tal como está; no migra datos ni toca el esquema de dominio. **N/A**, con la restricción explícita del usuario de no modificar esa feature — verificado en Fase 1 (data-model.md debe ser 100% aditivo). |
| XI. Código muerto no se migra | Sí | No hay código de la app actual (React/Firestore) que portar a este backend — se construye desde la spec, no desde `src/`. **PASS**. |
| XII. Trazabilidad de decisiones | Sí | research.md documenta cada decisión con alternativas consideradas y motivo, incluido el hallazgo de que Lucia (sugerida como opción) está deprecada. **PASS** (aplicado en este plan). |
| XIII. Secretos fuera del árbol | Sí | Mismo patrón que `migration/config/env.js`: `DATABASE_URL`, credenciales OAuth de Google, secreto de firma de sesión — todo por variable de entorno. **PASS** en diseño; se verifica en Fase 1 que ningún contrato ni ejemplo hardcodee un secreto. |

**Resultado**: sin violaciones bloqueantes; dos gates quedan explícitamente
pendientes de resolver en Fase 0 (Principios III/IV — elección de librería y
parámetros de seguridad) y uno es crítico (Principio V — evitar identidad
paralela). No se completa Fase 1 sin cerrarlos.

### Re-chequeo post Fase 0 (research.md) — habilita empezar Fase 1

| Principio | Estado tras research.md |
|---|---|
| III. Autenticación plural | **PASS** — Better Auth (Decisión 2) cubre los 3 métodos, ninguno prerequisito de otro (local, `socialProviders.google`, plugin `magic-link` son independientes entre sí). |
| IV. Credenciales/tokens seguros | **PASS** — scrypt por default de Better Auth satisface el MUST (Decisión 2); magic link de un solo uso con TTL corto vía su plugin oficial, TTL a fijar explícitamente en implementación (Decisión 5), no heredado sin revisar. Rate limiting (SHOULD) queda como tarea de implementación, no bloquea el plan. |
| V. Identidad unificada | **PASS condicional (diseño, no validado)** — resuelto en diseño (Decisión 3: esquema `auth` separado, `auth.user.id` fijado a `usuarios.id`, cero cambios a `usuarios`), pero con un **spike técnico marcado como primera tarea de implementación** antes de construir el resto sobre este supuesto — ver Decisión 3, riesgo residual. No es un NEEDS CLARIFICATION de producto (no es una decisión de negocio pendiente), es una verificación técnica de una librería no instalada aún. |

**Resultado**: los 3 gates pendientes del chequeo inicial quedan resueltos
*en diseño* (no en código — nada de esto se implementó todavía). Suficiente
para proceder a Fase 1; el gate real de Principio V se re-evalúa abajo,
después de Fase 1, y sigue sin poder cerrarse en "validado" hasta que exista
código.

### Re-chequeo post Fase 1 (data-model.md, contracts/api.md, quickstart.md)

*Este es el re-chequeo que promete el encabezado del gate ("Re-check after
Phase 1 design"). Verifica que los artefactos de diseño de Fase 1 —no solo
las decisiones de research.md— sostienen cada principio.*

| Principio | Estado tras Fase 1 | Evidencia puntual en los artefactos |
|---|---|---|
| I. Soberanía de datos sobre GCP | **PASS**, sin cambios respecto al pre-chequeo | `data-model.md` no agrega ninguna dependencia de GCP; Google Sign-In sigue siendo un método de auth, no una dependencia de almacenamiento/autorización. |
| II. La autorización vive en el servidor | **PASS** — confirmado con un caso concreto, no solo declarado | `contracts/api.md`, tabla "Organismos": `POST /api/organismos` — "el body **MUST NOT** poder fijar `propietario_id` a otro usuario — el servidor lo fuerza... ignorando cualquier valor que venga en el body". Es el caso exacto que un enforcement solo-cliente no podría garantizar. |
| III. Autenticación plural | **PASS** (research.md, Decisión 2) — confirmado en el contrato | `contracts/api.md`, tabla "Autenticación": 3 métodos como rutas independientes (`/sign-up/email`, `/sign-in/google`, `/sign-in/magic-link`), ninguna depende de otra. |
| IV. Credenciales/tokens seguros | **PASS** (research.md, Decisión 2 y 5) — confirmado en el modelo y el contrato | `data-model.md` §`auth.account`: "credencial local (contraseña con hash scrypt)"; `data-model.md` §`auth.verification`: "expiración corta (a fijar explícitamente en implementación)"; `contracts/api.md`, matriz de pruebas: caso "Magic link reutilizado o vencido → `401`/`403`" (SC-006). |
| V. Identidad unificada | **PASS — validado empíricamente (T007, 2026-09-19)** | `data-model.md` §`auth.user`: "su `id` se fija, en creación, al valor de `usuarios.id`..." — confirmado con datos reales, no solo diseño: `research.md` Decisión 3 registra la corrida de `backend/scripts/spike-identity.ts` contra la base real, con `auth."user".id = "144"` y `String(public.usuarios.id) = "144"` coincidiendo, vía `auth.api.signUpEmail` (flujo real, no una llamada sintética). |
| VI. Autorización reconstruida desde la fuente | **PASS**, heredado de `spec.md` | Sin cambios; `contracts/api.md` traduce FR-012 a FR-019 (que ya vienen de las reglas reales) sin agregar ni quitar ninguna. |
| VII-X (modelo de datos) | **N/A, verificado explícitamente aditivo** | `data-model.md`, encabezado: "100% aditivo: ninguna entidad de `001-modelo-datos-relacional` se modifica (sin `ALTER TABLE`, sin columnas nuevas...)"; `quickstart.md` Paso 1 incluye el chequeo explícito: "cero cambios en `public.*` (verificar con `\dt public.*` antes y después)". |
| XI. Código muerto no se migra | **PASS**, sin cambios | Sin código de `src/` referenciado en ningún artefacto de Fase 1. |
| XII. Trazabilidad de decisiones | **PASS** | Las tres tablas de este Constitution Check, más las 7 decisiones de `research.md`, quedan escritas con motivo y alternativas — no solo el resultado. |
| XIII. Secretos fuera del árbol | **PASS** | `quickstart.md` Pasos 1-2: `DATABASE_URL`, `BETTER_AUTH_SECRET`, credenciales de Google, todo declarado como variable de entorno en los comandos de ejemplo — ninguna aparece con un valor literal hardcodeado en los artefactos. |

**Sobre el gate crítico (Principio V) — actualización post-implementación
(T007, 2026-09-19)**: el spike se ejecutó y dio **GO**. `research.md`
Decisión 3 tiene la evidencia completa (log del hook, filas reales de
`auth."user"` y `public.usuarios` con el mismo id "144", limpieza
verificada, 0 cambios en `public.*`). La tabla puente `identidad_externa`
(T008) **no fue necesaria** — queda documentada como plan B descartado, no
implementada. Este gate pasa de "condicional" a **validado con código real**,
no solo diseño. Un hallazgo nuevo, no relacionado con Principio V, quedó
registrado en la misma Decisión 3: `@better-auth/cli` está deprecado y no
corrió — hay que resolver la estrategia de migraciones de `auth.*` antes de
T009.

## Project Structure

### Documentation (this feature)

```text
specs/002-backend-api-carga-datos/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

Proyecto único de backend (no hay frontend en esta feature — está fuera de
alcance por spec.md). Vive en `backend/`, hermano de `db/` y `migration/`
(las otras dos carpetas de código de la reformulación), sin tocar `src/`
(la SPA actual, que sigue operando contra Firestore mientras este backend
se construye — Principio IX).

```text
backend/
├── src/
│   ├── auth/              # Configuración de Better Auth: plugins (password,
│   │                       # google, magic-link), databaseHooks (Decisión 3
│   │                       # de research.md — resolución contra usuarios.id),
│   │                       # esquema `auth` propio.
│   ├── db/
│   │   └── pool.ts         # Pool `pg` desde DATABASE_URL, mismo patrón que
│   │                       # migration/src/load/pg-client.js.
│   ├── authz/              # Reglas de autorización server-side (FR-012 a
│   │   │                   # FR-019), una función pura por regla, testeada
│   │   │                   # sin HTTP: esOwnerOEditor(), mismaProvincia(),
│   │   │                   # esAdmin() — traducción 1:1 de
│   │   │                   # docs/firestore-rules-actuales.rules.
│   ├── routes/
│   │   ├── auth.ts          # Rutas que expone Better Auth (login, logout,
│   │   │                   # callback de Google, solicitud/verificación de
│   │   │                   # magic link).
│   │   ├── organismos.ts   # FR-012, FR-013 (+ subrutas UF/taxonomía, FR-014)
│   │   ├── pools-jueces.ts # FR-015
│   │   ├── usuarios.ts     # FR-016, FR-017
│   │   └── localidades.ts  # FR-018, FR-019 (solo GET)
│   ├── config/
│   │   └── env.ts           # Carga de env vars (DATABASE_URL, credenciales
│   │                       # OAuth de Google, secreto de sesión) — Principio
│   │                       # XIII, mismo patrón que migration/config/env.js.
│   └── app.ts               # Fastify app: registra plugins, rutas, hook de
│                           # autenticación global.
├── tests/
│   ├── contract/            # Un archivo por recurso, contra contracts/*.md:
│   │                       # status codes y forma de request/response.
│   ├── integration/         # Los escenarios Given/When/Then de spec.md,
│   │                       # con `fastify.inject()` contra una base de test.
│   └── unit/                # Reglas de authz/ en aislamiento (sin HTTP ni DB).
├── package.json
└── README.md                # Runbook de esta API (variables de entorno,
                            # cómo correr, cómo correr los tests) — análogo a
                            # migration/README.md.
```

**Structure Decision**: Opción "single project" (backend-only), no la
plantilla de "web application" con `frontend/` — el frontend está fuera de
alcance explícito de `spec.md`. Todo el código nuevo vive en `backend/`,
paralelo a `db/` y `migration/`, sin tocar `src/` (SPA actual) ni los
archivos de `001-modelo-datos-relacional`.

## Complexity Tracking

*Sin violaciones del Constitution Check que requieran justificación — la
tabla queda vacía a propósito.*
