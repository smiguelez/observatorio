# Implementation Plan: Envío de email para acceso

**Branch**: `009-envio-email-autenticacion` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-envio-email-autenticacion/spec.md`

## Summary

Reemplazar el placeholder actual (`console.log`) del magic link por un envío
real vía Resend (US1, cierra G4), y agregar la opción de enviar por email el
enlace de acceso inicial al dar de alta o reemitir (US2), sin quitar la
opción manual de copiarlo que ya existe (007/008). Un módulo compartido
(`backend/src/email/`) concentra el único lugar que sabe llamar a la API de
Resend y la regla de no loguear tokens; los dos flujos (magic link, acceso
inicial) lo usan, cada uno con su propia plantilla. El fallo de envío del
magic link (US1, sin admin presente) se registra con un log estructurado
existente (no una tabla nueva); el fallo de envío del acceso inicial (US2,
con admin presente) se devuelve en la misma respuesta HTTP de la acción que
ya dispara el admin, sin necesitar nada asíncrono.

## Technical Context

**Language/Version**: TypeScript (Node.js), mismo backend ya existente (Fastify 5, `tsx`/`tsc` — sin cambios de versión)

**Primary Dependencies**: Resend, vía su API HTTP (`https://api.resend.com`) llamada con `fetch` nativo de Node — sin SDK nuevo (research.md, Decisión 3: "API HTTP simple" ya era la premisa del pedido). Better Auth (plugin `magic-link`, ya integrado) para US1.

**Storage**: PostgreSQL existente — sin tabla nueva (research.md, Decisión 2: se reutiliza el logging estructurado ya existente en vez de una tabla de auditoría).

**Testing**: `vitest` (backend, ya establecido) — se extiende el patrón ya usado en `tests/integration/acceso-inicial-logs.test.ts` (`logStream`/spy de `console`) para probar que el fallo de envío se registra sin exponer el token; y se agrega un doble (fake) del cliente de Resend para no pegarle a la red real en los tests (research.md, Decisión 3).

**Target Platform**: Linux server (mismo backend `:3000` ya desplegado en desarrollo)

**Project Type**: Web application (backend Fastify + frontend Vite/React, ya establecido)

**Performance Goals**: N/A — volumen esperado es de altas esporádicas (spec.md, Assumptions), no hay meta de throughput.

**Constraints**: la API key de Resend y el dominio remitente **MUST** cargarse desde variables de entorno (constitution, Principio XIII) — patrón ya establecido en `config/env.ts` (`required(...)`, `loadXConfig()`). Ningún camino de esta feature puede loguear el token del acceso inicial ni ninguna contraseña (spec.md FR-008, ya probado hoy en `acceso-inicial-logs.test.ts` para el flujo manual).

**Scale/Scope**: menos de 50 usuarios activos, altas esporádicas (spec.md, Assumptions) — confirma que el dominio de prueba de Resend NO alcanza igual, no por volumen sino porque solo puede entregar al email del dueño de la cuenta (research.md, Decisión 1); un dominio verificado es indispensable desde el primer envío a un tercero, cualquiera sea el volumen.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplica | Cómo se cumple |
|---|---|---|
| III. Autenticación plural | Sí | No se toca ningún método existente; el magic link sigue siendo uno más entre varios, no un prerequisito. |
| IV. Credenciales y tokens seguros por diseño | Sí | El token del magic link y el del acceso inicial siguen viajando solo dentro del enlace en sí (ya así hoy); ningún log nuevo de esta feature incluye token ni contraseña (FR-008, research.md Decisión 2). |
| XIII. Secretos fuera del árbol del proyecto | Sí | `RESEND_API_KEY` y el remitente se cargan por variable de entorno, mismo patrón que `BETTER_AUTH_SECRET`/`GOOGLE_CLIENT_SECRET` en `config/env.ts` — ninguna credencial se hardcodea. |
| XI. El código muerto no se migra | Sí | Se reemplaza el placeholder existente (`console.log` en `magic-link.ts`), no se agrega una capa nueva en paralelo. |
| XII. Trazabilidad de decisiones | Sí | research.md documenta cada decisión (proveedor de dominio, mecanismo de logging, forma del módulo) con su fuente. |

Sin violaciones. No hace falta Complexity Tracking.

**Re-chequeo post-diseño (tras research.md/data-model.md/contracts/):** sin
cambios — ninguna decisión de diseño introdujo una tabla nueva, una
credencial hardcodeada, ni un log con datos sensibles. Sigue sin violaciones.

## Project Structure

### Documentation (this feature)

```text
specs/009-envio-email-autenticacion/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── api.md            # Phase 1 output — forma de los dos endpoints que cambian
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 (/speckit-tasks — no generado acá)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── email/                    # NUEVO — único lugar que sabe hablar con Resend
│   │   ├── resend.ts             #   enviarEmail({ to, subject, html }) -> { ok, motivo? }; nunca loguea el html/token
│   │   └── plantillas.ts         #   texto de los dos emails (magic link, acceso inicial)
│   ├── auth/
│   │   └── providers/
│   │       └── magic-link.ts     # MODIFICADO — sendMagicLink llama a email/resend.ts en vez de console.log
│   ├── routes/
│   │   └── usuarios.ts           # MODIFICADO — alta y reemisión de acceso inicial aceptan enviarPorEmail
│   └── config/
│       └── env.ts                # MODIFICADO — loadEmailConfig() (RESEND_API_KEY, EMAIL_REMITENTE)
└── tests/
    ├── unit/
    │   └── email/                 # NUEVO — plantillas + wrapper de Resend con fetch fake
    ├── integration/
    │   └── envio-email-logs.test.ts  # NUEVO — mismo patrón que acceso-inicial-logs.test.ts, para el fallo de magic link
    └── contract/
        └── usuarios.test.ts       # MODIFICADO — cubre enviarPorEmail en alta/reemisión

frontend/
├── src/
│   ├── api/
│   │   └── usuarios.ts           # MODIFICADO — el tipo de respuesta de alta/reemisión gana el campo de resultado de envío
│   └── routes/admin/
│       └── AltaUsuarioDialog.tsx # MODIFICADO — botón "Enviar por email" junto a "Copiar enlace" (implementación real: tasks.md)
```

**Structure Decision**: se mantiene la estructura ya establecida (backend
Fastify + frontend Vite/React). Esta feature es mayormente backend (US1
completa, US2 en su mayor parte); el único cambio de frontend es sumar la
opción "enviar por email" al diálogo que ya existe — sin pantallas nuevas,
sin rutas nuevas.
