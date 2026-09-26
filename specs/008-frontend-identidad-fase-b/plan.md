# Implementation Plan: Frontend — Fase B: consumir la identidad y autorización de 007

**Branch**: `008-frontend-identidad-fase-b` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-frontend-identidad-fase-b/spec.md`

## Summary

Sin cambios de stack: el cliente de `005` (Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui, React Router, TanStack Query, react-hook-form + zod,
`better-auth` cliente), hablando con el backend de `007` por el **proxy `/api` de Vite ya configurado** (same-origin, sin `changeOrigin`; `005/research.md`
Decisión 3). **Cero cambios de backend.** El trabajo es adaptar pantallas existentes, agregar **una pantalla pública** y **dos diálogos**, y recuperar la suite E2E.

Las decisiones que el pedido dejó a investigación se resolvieron **contra el código y un servidor real**, no de memoria (detalle y evidencia en
[research.md](./research.md)):

1. **Formas de los endpoints de `007` verificadas en vivo** (Decisiones 1–2): los endpoints **nuevos** son camelCase con ids `string`; los **modificados**
   (`PATCH`, `GET /usuarios/:id`) siguen en snake_case ⇒ **D13 vigente** y la capa de mapeo existente los absorbe (solo convierte `id → number` y `vence → Date`).
   Hallazgo: un `400` de validación de esquema (`FST_ERR_VALIDATION`) se mostraría como **"Bad Request"**; se corrige en `extraerMensaje`.
2. **Ruta pública sin mecanismo nuevo** (Decisión 3): `/login` es la única ruta pública y es *hermana* del árbol protegido, no una excepción; las pantallas de error
   **no** son públicas. `/primer-acceso` se agrega igual, junto a `/login`, fuera de `RequireAuth`.
3. **El acceso inicial vive solo en memoria** (Decisión 4): se lee del fragmento vía el router, se quita con `replace`, el alta usa `gcTime: 0` + `reset()` y el canje se
   hace **sin `useMutation`** (una mutación retiene sus variables y su resultado en el caché).
4. **Sesión fresca** (Decisión 7): hallazgo — `staleTime: 30 s` dejaría un rol/provincia viejos hasta 30 s. Se invalida la sesión al cambiar de pantalla y ante un `403`.
5. **Alcance de FR-031 confirmado antes de planificar** (Decisión 11): la ruptura es total (**15 archivos / 60 tests** llaman al alta pública eliminada). Un helper con un único arranque
   por SQL (admin de fixtures) + **alta administrada + canje** por la API real reemplaza `crearUsuarioConClave`; **8** archivos solo cambian el helper, **7** cambian de comportamiento
   (con causa verificada, p. ej. la credencial "revocada" de `login.spec` **ya no se revoca** porque el alta administrada deja `emailVerified = true`) y se agregan tests nuevos.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 19; Node 20+ para tooling (sin cambios).

**Primary Dependencies**: las de `005`, **sin dependencias nuevas**: `react-router`, `@tanstack/react-query`, `react-hook-form` + `zod` + `@hookform/resolvers`, `better-auth` (cliente 1.7.5),
componentes shadcn ya instalados (`dialog`, `alert-dialog`, `select`, `checkbox`, `field`, `input`, `sonner`). Si algún componente faltara, `shadcn add` (falla explícito ante un nombre inexistente).

**Storage**: N/A. El cliente **no persiste** nada de esta feature: ni el acceso inicial ni la contraseña (ni en `localStorage`/`sessionStorage`/cookies propias ni en el caché de TanStack Query).

**Testing**: Vitest + Testing Library (unitarios sobre **fixtures reales grabados**, D13) y Playwright E2E contra **backend real** (serial, prefijo `test-frontend-`). `page.route` solo para lo no
reproducible sin tocar datos reales (rechazo "último administrador").

**Target Platform**: navegadores evergreen, escritorio primero (sin cambios).

**Project Type**: web application — cambios sobre `frontend/` existente; `backend/` **sin cambios**; `src/` (SPA vieja) intacto.

**Performance Goals**: sin metas numéricas. Regla práctica: la invalidación de sesión por navegación agrega **una** consulta liviana (`GET /api/auth/session`) por cambio de pantalla (47 usuarios).

**Constraints**: autorización solo en el servidor (Principio II; guardas = UX); el cliente nunca decide identidad ni permisos; pantalla pública tratada como endpoint público (validación, mensaje único, sin
filtrar validez del acceso, sin persistir secretos); rutas relativas `/api`; `BETTER_AUTH_URL=http://localhost:5173` requisito del backend en dev.

**Scale/Scope**: 1 pantalla nueva (`/primer-acceso`), 2 diálogos nuevos (alta/enlace, edición), 5 pantallas modificadas (perfil, alta de organismo, usuarios, panel de pools, formulario de taxonomía),
3 módulos de API tocados, 15 archivos E2E (7 con cambio de comportamiento) + nuevos, 1 script de fixtures.

## Constitution Check

*GATE: pasa antes de Phase 0; re-evaluado después de Phase 1.*

| Principio | Estado | Cómo se cumple / nota |
|---|---|---|
| I. Soberanía de datos | ✅ | Sin dependencia de GCP; el enlace se comparte a mano (Fase C traerá el correo). |
| II. Autorización en el servidor | ✅ | Nada de lo nuevo es control de acceso en el cliente: rol/provincia/alta las decide el backend; la UI solo oculta o confirma. La sesión se relee al navegar y ante `403` para no operar con un permiso viejo. |
| III. Autenticación plural | ✅ | Los tres métodos siguen; el canje agrega una **vía de primer acceso**, no reemplaza ninguna; ningún método depende de otro. |
| IV. Credenciales y tokens seguros | ✅ con notas | Cookie `httpOnly` (el cliente no la lee); el acceso inicial viaja en el **fragmento** (no llega a servidores ni a `Referer`), se quita del historial, no se persiste; contraseña con `autocomplete="new-password"` y nunca en el caché. El administrador **conoce** el enlace durante la entrega (riesgo aceptado en `007`); sin rate limiting del canje (D10, Fase E). |
| V. Identidad unificada | ✅ | El cliente no crea identidades: sin registro (FR-022 de `005`); el canje solo fija la contraseña de una persona **ya dada de alta**. |
| VI. Autorización desde la fuente | N/A | No se redefinen reglas; el cliente refleja las de `007`. |
| VII. Esquema sobre datos verificados | ✅ | Toda forma de respuesta se capturó de un servidor real (2026-09-25); lo **no** verificado está marcado: rechazo "último administrador" en el servidor real, portapapeles y sesión posterior al canje **en navegador** (se cubren en E2E). |
| VIII. Integridad referencial | N/A | Sin esquema propio. |
| IX. Migración por partes | ✅ | Cambios acotados a `frontend/`; `src/` y `backend/` intactos. |
| X. Cero pérdida de datos | ✅ | Sin migración. Las operaciones de rol y provincia son de una sola solicitud cada una (sin guardado parcial); ningún flujo borra datos. |
| XI. Código muerto no se migra | ✅ | Se **elimina** `PoolEnUsoError` y `preguntasDelError` (detección obsoleta) en vez de dejarlos "por las dudas". |
| XII. Trazabilidad | ✅ | `research.md` cita fuente y evidencia por decisión y registra los desvíos (reemisión incluida; sin `opcionCodigo`; provincia `NULL` por SQL en los fixtures E2E). |
| XIII. Secretos fuera del árbol | ✅ | Ningún secreto nuevo. Los fixtures graban tokens **redactados** y datos de personas **anonimizados**. |

**Re-evaluación post-diseño (Phase 1)**: sin violaciones. Los dos puntos sensibles quedan como riesgos aceptados abajo (el admin ve el enlace; canje público sin rate limiting).

## Project Structure

### Documentation (this feature)

```text
specs/008-frontend-identidad-fase-b/
├── plan.md                 # este archivo
├── research.md             # Phase 0 — 14 decisiones con evidencia (formas reales, ruta pública, alcance E2E)
├── data-model.md           # Phase 1 — tipos, mapeo, validaciones, máquina de estados del canje
├── quickstart.md           # Phase 1 — 18 escenarios de validación
├── contracts/
│   ├── consumed-api.md     # delta: formas reales de los endpoints de 007 + tratamiento de errores
│   └── routes.md           # delta: /primer-acceso pública, /admin/usuarios, invariantes de seguridad
├── checklists/requirements.md
└── tasks.md                # Phase 2 (/speckit-tasks — no lo crea este comando)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── main.tsx                          # MODIFICA: MutationCache.onError invalida la sesión ante 403
│   ├── routes.tsx                        # MODIFICA: + { path: '/primer-acceso' } junto a /login, fuera de RequireAuth
│   ├── api/
│   │   ├── http.ts                       # MODIFICA: extraerMensaje reconoce FST_ERR_VALIDATION
│   │   ├── usuarios.ts                   # MODIFICA: + crearUsuario, emitirAccesoInicial, cambiarRol (+ esquemas y hooks)
│   │   ├── acceso-inicial.ts             # NUEVO: canjearAccesoInicial (llamada directa, sin useMutation)
│   │   └── pools.ts                      # MODIFICA: eliminarPool sin try/catch; se borra PoolEnUsoError
│   ├── lib/contrasena.ts                 # NUEVO: CONTRASENA_MIN = 8, CONTRASENA_MAX = 128
│   ├── components/layout/AppLayout.tsx   # MODIFICA: invalida CLAVE_SESION al cambiar de pantalla
│   ├── routes/
│   │   ├── primer-acceso/PrimerAccesoPage.tsx   # NUEVO: pantalla pública de canje (máquina de estados)
│   │   ├── admin/AdminUsuariosPage.tsx          # MODIFICA: deja de ser solo lectura
│   │   ├── admin/AltaUsuarioDialog.tsx          # NUEVO: formulario → enlace/vencimiento/aviso; gcTime 0 + reset
│   │   ├── admin/EditarUsuarioDialog.tsx        # NUEVO: rol (confirmación al quitar admin) y provincia, independientes
│   │   ├── perfil/PerfilPage.tsx                # MODIFICA: provincia de solo lectura (usuario normal); sin provinciaId en el PATCH
│   │   └── organismos/OrganismoNuevoPage.tsx    # MODIFICA: mensaje "pedile a un administrador…", sin enlace al perfil
│   └── features/
│       ├── taxonomia/TaxonomiaForm.tsx          # MODIFICA: resalta por preguntaCodigo del cuerpo
│       ├── taxonomia/mezclar.ts                 # MODIFICA: se elimina preguntasDelError
│       └── asignaciones/PoolsPanel.tsx          # MODIFICA: comentario obsoleto (ya muestra err.message)
├── scripts/grabar-fixtures.mjs           # MODIFICA: arranque SQL + alta + canje; graba fixtures nuevos (anonimizados, tokens redactados)
└── tests/
    ├── unit/                             # + esquemas nuevos, http, pools, TaxonomiaForm, ruta pública, canje, alta, edición
    │   └── api/fixtures/real/            # + usuario-alta, acceso-reemitido, canje, rol, error-* (reales)
    └── e2e/
        ├── helpers/backend.ts            # MODIFICA: asegurarAdminDeFixtures, crearUsuarioConClave (alta+canje), crearUsuarioSinClave, limpieza de reset-password:*
        ├── (8 archivos: solo helper) · (7 archivos: login, perfil, admin-usuarios, organismos, unidades-asignaciones, taxonomia, recorrido-sc002)
        └── NUEVOS: alta-canje.spec.ts, rol-provincia.spec.ts, seguridad-acceso.spec.ts (+ accesibilidad suma /primer-acceso)

backend/     # sin cambios
src/         # SPA vieja, sin cambios
```

**Structure Decision**: cambios dentro de `frontend/` siguiendo la organización de `005` (una carpeta por pantalla, un módulo por recurso en `api/`). La pantalla pública va en
`routes/primer-acceso/`; los diálogos del admin, junto a `AdminUsuariosPage` porque no tienen ruta propia.

## Riesgos y dependencias fuera de esta feature

| Riesgo / dependencia | Efecto | Mitigación |
|---|---|---|
| **`007` mergeado y corriendo** en el backend de `:3000` | Sin él no existen los endpoints | Verificado: el `:3000` actual ya responde el canje de `007` (`400 "El acceso inicial no es válido o venció."`). El E2E exige `BETTER_AUTH_URL=http://localhost:5173` (**no verificado en ese servidor**). |
| Arranque por SQL de los fixtures E2E (admin de fixtures) | Toca `usuarios`/`auth.*` por SQL en la base real de desarrollo | Prefijo `test-frontend-`, limpieza por prefijo + `reset-password:*`, comprobación final (47 usuarios / 3 admins / 0 residuos); el resto del flujo usa la API de `007` |
| Estado de partida de fixtures (provincia `NULL`) no es un estado que el alta permita | Algunos tests parten de "sin provincia" | El helper deja `NULL` **por SQL** tras el alta por defecto; los tests nuevos usan `opts.provinciaId` real. Documentado en `research.md` D11 |
| Rechazo "último administrador" sin captura real | No se puede provocar sin tocar admins reales | Forma cubierta por `007` (esquema aislado) y por el mapeo genérico `{error}`; E2E con `page.route` con el cuerpo literal |
| Portapapeles en Playwright | `navigator.clipboard` requiere permiso | `grantPermissions(['clipboard-read','clipboard-write'])` en el test; con respaldo de campo seleccionable |
| Sesión tras el canje vía proxy de Vite | Cookie `HttpOnly; SameSite=Lax` debe guardarse en `localhost:5173` | Misma mecánica que el login de `005` (validada en navegador real); se cubre en E2E |
| Invalidar sesión en cada navegación | Una consulta extra por pantalla | Aceptado (escala 47 usuarios); alternativa descartada: `staleTime: 0` global |
| Fixtures con datos de personas | D15: emails/nombres reales en documentos comiteados | Anonimización obligatoria en `grabar-fixtures.mjs`; tokens redactados; revisión previa al commit |
| El administrador conoce el enlace durante la entrega; canje público sin rate limiting | Superficie ya aceptada en `007` | Un solo uso + vencimiento + reemisión invalida el anterior; rate limiting es D10 (Fase E) |
| T030 (Google de punta a punta) y correo real | Fuera de alcance | Fase E y Fase C |

## Preguntas abiertas

Ninguna que bloquee `/speckit-tasks`. Puntos a **validar durante la implementación** (no son decisiones): portapapeles y sesión posterior al canje en navegador real; que el backend de
`:3000` esté levantado con `BETTER_AUTH_URL=http://localhost:5173` para los E2E; nombre exacto de los `data-testid` nuevos.

## Complexity Tracking

Sin violaciones de la constitución que justificar. Dos apartamientos conscientes ya registrados en `research.md`/spec: incluir la **reemisión** del acceso (FR-004, no pedida literalmente) y
dejar la provincia de los fixtures E2E en `NULL` por SQL para no reescribir los tests existentes que parten sin provincia.
