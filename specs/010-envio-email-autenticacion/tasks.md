---

description: "Task list for 010-envio-email-autenticacion"
---

# Tasks: Envío de email para acceso

**Input**: Design documents from `/specs/010-envio-email-autenticacion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: incluidos — mismo criterio que `007`/`008` (tests unitarios,
contrato e integración antes de dar una historia por cerrada).

**Sin API key real de Resend ni dominio verificado hasta T010** (research.md,
Decisión 1 y 3): todas las tareas anteriores se implementan y prueban con
`fetch` mockeado. Ver nota en el checkpoint de Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias)
- **[Story]**: a qué historia de usuario pertenece (US1, US2)

---

## Phase 1: Setup

- [x] T001 Confirmar línea base: `cd backend && npm test` (220/220 hoy) y `npx tsc -b` limpios, antes de tocar código de esta feature.
- [x] T002 [P] Crear el directorio `backend/src/email/` (vacío, listo para T004/T005).

**Checkpoint**: línea base confirmada, nada roto todavía por esta feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: el módulo de envío compartido y su configuración — ninguna
historia puede implementarse sin esto (research.md, Decisiones 3 y 4).

**⚠️ CRITICAL**: no empezar US1 ni US2 sin esto terminado.

- [x] T003 [P] `backend/src/config/env.ts`: agregar `loadEmailConfig()` (`RESEND_API_KEY`, `EMAIL_REMITENTE`, vía `required(...)`, mismo patrón que `loadAuthConfig()`) y una función que exponga el origen público del frontend para construir enlaces desde el servidor (reusa `BETTER_AUTH_URL`, ya existente — no crea una variable nueva).
- [x] T004 [P] `backend/src/email/plantillas.ts`: `plantillaMagicLink({ url })` y `plantillaAccesoInicial({ url })`, cada una devuelve `{ subject, html }`. Contenido mínimo pero real (nombre de la app, el enlace, una línea de vigencia) — sin lógica de negocio acá.
- [x] T005 `backend/src/email/resend.ts`: `enviarEmail({ to, subject, html }): Promise<{ ok: true } | { ok: false; motivo: string }>` — `POST` con `fetch` nativo a `https://api.resend.com/emails`, header `Authorization: Bearer ${RESEND_API_KEY}`, `from: EMAIL_REMITENTE` (`loadEmailConfig()` de T003). `fetch` inyectable (parámetro opcional, default `globalThis.fetch`) para poder mockearlo en tests. **No loguea nada acá** — devuelve el resultado, decide el llamador (research.md, Decisión 2).
- [x] T006 [P] `backend/tests/unit/email/resend.test.ts`: casos con `fetch` fake — éxito (`ok: true`), fallo HTTP (4xx/5xx de Resend, `ok: false` con el motivo del cuerpo de la respuesta), fallo de red (`fetch` rechaza, `ok: false`). Confirmar que el `body` enviado a `fetch` nunca se transforma ni se loguea.
- [x] T007 [P] `backend/tests/unit/email/plantillas.test.ts`: cada plantilla incluye el `url` recibido en el `html`, tiene `subject` no vacío, y no incluye ningún campo que no sea el pasado por parámetro (para no arrastrar un token crudo por error si algún día se le pasa de más).

**Checkpoint**: `email/resend.ts` y `email/plantillas.ts` completos y
100% probados sin ninguna credencial real de Resend. A partir de acá, US1 y
US2 pueden avanzar en paralelo si hay capacidad.

---

## Phase 3: User Story 1 - Ingresar por enlace recibido en la casilla real (Priority: P1) 🎯 MVP

**Goal**: el magic link llega de verdad por email (cierra G4), preservando
la seguridad ya construida (un solo uso, vencimiento corto, mensaje
uniforme sin importar éxito/fallo de envío).

**Independent Test**: pedir "ingresar por enlace" con un email de prueba
real (sin `RESEND_API_KEY` real: verificar en el test que `enviarEmail` fue
llamado con la plantilla correcta) y, por separado, con el envío
forzado a fallar, confirmar que la persona ve el mismo mensaje en los dos
casos y que solo en el segundo aparece la línea de log.

### Tests for User Story 1 ⚠️

- [x] T008 [P] [US1] `backend/tests/integration/envio-email-logs.test.ts`: mismo patrón que `acceso-inicial-logs.test.ts` (`logStream` + `vi.spyOn(console, 'log'/'error')`). Casos: (a) envío exitoso de magic link → `POST /sign-in/magic-link` sigue respondiendo `{ status: true }`, sin ninguna línea de log nueva; (b) envío fallido → misma respuesta `{ status: true }`, pero aparece una línea de `console.error` con `evento`/`proposito: 'magic_link'`/el email/el motivo, y **nunca** el token ni la URL completa del enlace.

### Implementation for User Story 1

- [x] T009 [US1] `backend/src/auth/providers/magic-link.ts`: `sendMagicLink` deja de hacer `console.log('TODO...')` y en su lugar arma la plantilla (`plantillaMagicLink({ url })`, T004) y llama a `enviarEmail(...)` (T005). Si el resultado es `ok: false`, loguea con `console.error` la línea estructurada que T008 verifica (nunca el `token` ni el `url`). Si es `ok: true`, no loguea nada.
- [ ] T010 [US1] **Prerequisito puntual, no bloquea nada anterior**: conseguir `RESEND_API_KEY` real y un dominio verificado en Resend (research.md, Decisión 1 — subdominio de `jufejus.org.ar`, requiere acceso a esa cuenta de Cloudflare, ver `docs/plan-camino-a-produccion.md` Fase C) antes de probar el escenario 5 de `quickstart.md` (envío real de punta a punta). Sin esto, US1 queda completa e implementada, solo falta la validación contra la API real.

**Checkpoint**: US1 completa y probada con Resend mockeado — funcional de
punta a punta salvo la validación final contra la API real (T010).

---

## Phase 4: User Story 2 - Entregar el acceso inicial por email, sin perder la opción manual (Priority: P2)

**Goal**: el admin puede pedir que el acceso inicial (alta o reemisión) se
envíe por email, sin perder nunca la opción de copiarlo a mano, y con aviso
explícito de éxito/fallo en la misma pantalla.

**Independent Test**: dar de alta un usuario con `enviarPorEmail: true`
(Resend mockeado en éxito y, en otro test, en fallo) y confirmar la forma
exacta de la respuesta en cada caso (`contracts/api.md`); en el frontend,
confirmar que el botón "Copiar enlace" sigue ahí y funciona igual,
haya fallado el email o no.

### Tests for User Story 2 ⚠️

> **Diseño corregido durante la implementación** (research.md, Decisión 4):
> no es un campo en el body de alta/reemisión — es un endpoint nuevo que
> actúa sobre el acceso YA generado, sin token en el body (contracts/api.md).

- [x] T011 [P] [US2] `backend/tests/contract/usuarios.test.ts` (o un archivo nuevo `acceso-inicial-email.test.ts` si queda más claro separado): `POST /api/usuarios/:id/acceso-inicial/enviar-email` tras un alta real — envío exitoso → `200 { emailEnviado: true }`; envío fallido (mock) → `200 { emailEnviado: false }` (nunca un error HTTP); no-admin → `403`.
- [x] T012 [P] [US2] Mismo archivo: sin ningún acceso inicial vigente (usuario recién creado sin `emitirAccesoInicial`, o un acceso ya canjeado) → `404`. Y: tras reemitir, el endpoint envía el token NUEVO (el anterior ya no es el vigente).

### Implementation for User Story 2

- [x] T013 [US2] `backend/src/auth/acceso-inicial.ts`: agregar `obtenerAccesoInicialVigente(pool, usuarioId): Promise<AccesoInicial | null>` — busca la fila `reset-password:%` vigente (`value = usuarioId`, `expiresAt > now()`), devuelve `{ token, vence }` extraído del `identifier`, o `null` si no hay ninguna.
- [x] T014 [US2] `backend/src/routes/usuarios.ts`: nueva ruta `POST /api/usuarios/:id/acceso-inicial/enviar-email` (solo admin) — usa T013; si no hay acceso vigente, `404 { error: '...' }`; si lo hay, arma el enlace (origen de T003 + token) y llama a `enviarEmail(plantillaAccesoInicial(...))` (T004/T005); responde `200 { emailEnviado: boolean }` en los dos casos de resultado del envío. **No loguear nada acá** (research.md, Decisión 2 — el admin ya lo ve en la respuesta).
- [x] T015 [P] [US2] `frontend/src/api/usuarios.ts`: `AccesoParaMostrar`/`UsuarioAlta` ganan `usuarioId` (ya disponible en `alta.id` / `u.id`, falta pasarlo); nueva función `enviarAccesoInicialPorEmail(id): Promise<{ emailEnviado: boolean }>` + su `useMutation`.
- [x] T016 [US2] `frontend/src/routes/admin/AltaUsuarioDialog.tsx`: `AccesoInicialDialog` gana `usuarioId` en `AccesoParaMostrar` y un botón "Enviar por email" junto a "Copiar enlace" que llama a T015 — al éxito, mensaje de confirmación distinto del de "enlace generado"; al fallo, aviso explícito sin ocultar el enlace ni el botón de copiar.
- [x] T017 [US2] `frontend/src/routes/admin/AdminUsuariosPage.tsx`: `reemitir()` pasa también `usuarioId` a `AccesoParaMostrar` (mismo componente de T016 — no requiere nada nuevo del lado de la reemisión, el botón ya queda disponible ahí).
- [x] T018 [P] [US2] `frontend/tests/unit/...` (mismo directorio que ya prueba `AltaUsuarioDialog`/`AdminUsuariosPage`): cubrir el botón nuevo, éxito y fallo de envío, y que "Copiar enlace" sigue funcionando en ambos casos.

**Checkpoint**: US1 y US2 completas, cada una independientemente
funcional y probada.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T019 Correr toda la suite backend (`npm test`) y frontend (`npx vitest run`, `npx tsc -b`) — confirmar 0 regresiones sobre la línea base de T001.
- [x] T020 Correr la suite E2E de Playwright relevante (alta de usuario, reemisión) — confirmar que el flujo manual ("Copiar enlace") sigue funcionando exactamente igual que antes de esta feature.
- [x] T021 Recorrer `quickstart.md` completo (escenarios 1-4, 6-8; el 5 depende de T010).
- [x] T022 Actualizar `docs/plan-camino-a-produccion.md`, Fase C: marcar G4 resuelto y anotar el estado real de T010 (dominio verificado o pendiente) — mismo formato ya usado para cerrar ítems de otras fases.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → sin dependencias.
- **Foundational (Phase 2)** → depende de Setup. Bloquea US1 y US2 por igual (ambas llaman a `email/resend.ts` y `email/plantillas.ts`).
- **US1 (Phase 3)** y **US2 (Phase 4)** → ambas dependen solo de Foundational, **no una de la otra** — pueden avanzar en paralelo. Dentro de cada una, tests antes que implementación.
- **T010** (API key/dominio real) es un prerequisito puntual de un solo escenario de validación (quickstart #5), no de ninguna tarea de código — no bloquea T011-T018 ni Polish.
- **Polish (Phase 5)** → depende de que ambas historias estén implementadas (T019/T020/T021); T022 depende además de saber el estado real de T010.

## Parallel Example: Foundational

```bash
# En paralelo, una vez creado backend/src/email/ (T002):
Task: "T003 — config/env.ts: loadEmailConfig()"
Task: "T004 — email/plantillas.ts"
# T005 (resend.ts) depende de T003 (config) — no es paralelo con ella.
```

## Implementation Strategy

**MVP = US1 sola** (cierra G4, el gap de producción ya señalado). US2 es
una mejora de conveniencia sobre un flujo manual que ya funciona de punta a
punta — puede quedar para después sin bloquear nada.

1. Setup + Foundational (T001-T007).
2. US1 (T008-T009) → **MVP funcional** (falta solo T010, prerequisito externo puntual).
3. US2 (T011-T018), en paralelo con US1 si hay capacidad, o después.
4. Polish (T019-T022).
