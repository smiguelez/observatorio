# Implementation Plan: Backend de identidad y autorización — cierre de los hallazgos de seguridad de 002/005/006

**Branch**: `007-identidad-autorizacion` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-identidad-autorizacion/spec.md`

## Summary

Sin cambios de stack: el backend de `002` (Node.js/TypeScript, Fastify, `pg`
con Kysely solo para migraciones, Better Auth 1.7.5). El trabajo es de
**configuración de Better Auth, servicios de usuarios, un manejador central de
errores y una migración de mensajes**, no de tecnología nueva.

Las decisiones de diseño que el pedido dejó abiertas se resolvieron con un
**spike empírico contra la base real** (19 de 19 casos —
`docs/resultado-verificacion-spike-007-20260925.md`,
`backend/scripts/spike-007-identidad.ts`) y no leyendo documentación:

1. **Hook de provisión — se compone en la misma función** del
   `databaseHooks.user.create.before` de `002` (documentado y ya en uso): lanza
   `APIError('FORBIDDEN', {code:'ACCESO_NO_AUTORIZADO'})` si el email no está en
   `usuarios` y, si está, fija `auth.user.id = usuarios.id`. Rechaza los tres
   métodos dejando 0 filas (contraseña y Google → `403`, enlace → redirección con
   `?error=`). Se **quita** su `INSERT INTO usuarios` (puerta abierta de D14).
   Se evaluó `user.validateUserInfo` (API 1.7 sin documentación pública) y se
   descartó: el before-hook cubre todo.
2. **Acceso inicial: se reutiliza el mecanismo de tokens de Better Auth, no se
   construye uno.** El plugin de magic link **no** sirve (vencimiento fijo de
   300 s para todo el plugin, y concede sesión, no contraseña); sí sirve el
   token `reset-password:<token>` de la tabla `auth.verification`: de un solo uso
   atómico, con vencimiento propio (lo creamos nosotros con
   `internalAdapter.createVerificationValue`), con política mínima de
   contraseña, y su canje (`POST /reset-password`) **crea la credencial de un
   usuario que no la tenía**. Cero tablas nuevas.
3. **Migración: solo una (`0004`), y no por una columna.** Ni el rol ni el primer
   acceso necesitan columna nueva (el rol vive en `usuario_roles`; el primer acceso
   fija la contraseña directamente, no hay estado "cambio obligatorio"). La
   migración `0004_taxonomia_mensajes_legibles` reemplaza las funciones de los
   triggers de taxonomía para que nombren la pregunta por su código y texto.

Hallazgo adicional del spike, que condiciona el diseño (A2/E2): el hook
por sí solo **permite** el alta pública por contraseña de un email **ya
provisionado**; el cierre real de ese camino es `emailAndPassword.disableSignUp:
true` (cubre HTTP y la API de servidor). Es el FR-004 del spec.

**Coexistencia (evidencia: `spike-007-coexistencia.ts`, resultado en
`docs/resultado-verificacion-spike-007-20260925.md`).** Mismo ataque sobre un email
provisionado sin `auth.user`, solo cambia `disableSignUp`: con `false`, alta `200`,
`auth.user`+credencial creados y el atacante inicia sesión (`200`, cuenta tomada); con
`true`, `400 EMAIL_PASSWORD_SIGN_UP_DISABLED` por HTTP y API de servidor, 0 filas nuevas
y el ingreso del atacante da `401`. El before-hook sigue siendo la única barrera de D14
en enlace y Google (A3–A6); `disableSignUp` cierra la contraseña.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node.js 20 LTS (el de `backend/`).

**Primary Dependencies**: Fastify 5, `@fastify/cookie`, `@fastify/type-provider-typebox` +
`@sinclair/typebox`, `better-auth@1.7.5` (fijada; el spike se conserva como test de humo), `pg`, `kysely`
(solo migraciones). **Sin dependencias nuevas.**

**Storage**: PostgreSQL. Esquema `public` (dominio) y `auth` (Better Auth). **Sin
tablas ni columnas nuevas**; una migración de funciones (`0004`).

**Testing**: Vitest contra la base real (sin mocks), como en `002`–`006`
(`backend/tests/{contract,integration,unit}`); más el script de spike ya
escrito. Impacto grande y conocido: 51 usos del alta pública por contraseña en 19
archivos de test (ver research.md, Decisión 10).

**Target Platform**: servidor Linux (`foros-ubuntu`), proceso Node detrás de un
mismo origen con el frontend (D5 abierta; no cambia acá).

**Project Type**: web-service (backend existente). Sin frontend (Fase B).

**Performance Goals**: sin metas numéricas propias. Regla práctica: el hook
agrega **una** consulta indexada (`usuarios.email`, único) por creación de
identidad; el resto de las operaciones nuevas son de baja frecuencia (administración).

**Constraints**: autorización solo en el servidor (Principio II); el cliente
nunca fija identidad ni permisos (FR-028); el acceso inicial no puede quedar en
claro en logs (FR-022); mensajes de rechazo de ingreso uniformes (FR-003);
`401` sin excepción para rutas de dominio salvo el canje del acceso inicial, que
es público **por diseño** (Decisión 3).

**Scale/Scope**: 47 usuarios (3 admins), 24 jurisdicciones; ~6 endpoints nuevos o
modificados, 1 helper del hook, 1 manejador de errores central, 1 migración.

## Constitution Check

*GATE: pasa antes de Phase 0; re-evaluado después de Phase 1.*

| Principio | Estado | Cómo se cumple / nota |
|---|---|---|
| I. Soberanía de datos | ✅ | Sin dependencia de GCP; Google sigue siendo *un* método, no requisito (III). |
| II. Autorización en el servidor | ✅ **es el objetivo** | Cierra D20 y G1; el rol y la provincia los decide y escribe el servidor con `403` explícito; el cliente no fija identidad (FR-028). |
| III. Autenticación plural | ✅ | Siguen los tres métodos. Cambia **quién puede crear** una identidad, no cuántos métodos hay; la contraseña pasa a fijarse solo por primer acceso/perfil. El sistema opera con autenticación local únicamente. |
| IV. Credenciales y tokens seguros | ✅ con una nota | Contraseña con hash (scrypt, sin cambios); mensajes de ingreso que no revelan el estado de la cuenta. **Nota**: el acceso inicial es un token de un solo uso con vencimiento de **horas** (el Principio pide "minutos" para el *magic link*; esto es un token distinto, emitido por un admin y entregado a mano). Better Auth guarda el identificador del token **en claro** en `auth.verification` (el canje lo busca por ese valor); se acepta porque leer esa tabla ya implica compromiso total de la base, el token solo permite fijar una contraseña dentro de su vencimiento y **una** vez, y reemitir invalida el anterior. Rate limiting sigue siendo D10 (Fase E). |
| V. Identidad unificada | ✅ **la refuerza** | Cierra la toma de cuenta por alta pública sobre un email provisionado (verificada el 2026-09-25): una contraseña solo la fija quien recibió el acceso inicial o su dueño autenticado. Un email = un usuario (citext único). |
| VI. Autorización desde la fuente | ✅ | Se documenta la decisión de apartarse de la regla vieja de Firestore (`users/{id}: write si es el propio o admin`): la provincia pasa a admin (D20), el rol ya estaba cerrado. |
| VII. Esquema sobre datos verificados | ✅ | El diseño se verificó con un spike (19/19) y consultando `pg_constraint` para el mapa de errores; lo no verificable está marcado en research.md. |
| VIII. Integridad referencial | ✅ | Los rechazos de FK/UNIQUE/CHECK causados por el cliente dejan de ser `500` (mapa por constraint; 27 FK relevadas). No se agregan FK nuevas. |
| IX. Migración por partes | ✅ | Feature independiente; `0004` es reversible (`down` restaura los mensajes). |
| X. Cero pérdida de datos | ✅ | Ninguna migración de datos: `0004` solo reemplaza funciones. |
| XI. Código muerto no se migra | ✅ | Se elimina la rama "auto-provisionar" del hook de `002` (era la puerta abierta). |
| XII. Trazabilidad | ✅ | research.md cita fuente y evidencia de cada decisión; se registra qué se aparta del pedido literal (FR-004, FR-010). |
| XIII. Secretos fuera del árbol | ✅ | Ningún secreto nuevo. Solo una variable de entorno de configuración (`ACCESO_INICIAL_TTL_HORAS`). El token del acceso inicial no se registra en logs (se canjea por `POST`, con el token en el cuerpo). |

**Re-evaluación post-diseño (Phase 1)**: sin violaciones. Los dos puntos
sensibles quedan registrados como riesgos aceptados abajo (token en claro en
reposo; canje público del acceso inicial).

## Project Structure

### Documentation (this feature)

```text
specs/007-identidad-autorizacion/
├── plan.md              # este archivo
├── research.md          # Phase 0 — decisiones con evidencia del spike
├── data-model.md        # Phase 1 — sin tablas nuevas; usos de las existentes y estados
├── quickstart.md        # Phase 1 — escenarios de validación
├── contracts/
│   └── api.md           # endpoints nuevos/modificados, errores, superficie de auth
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — no lo crea este comando)
```

### Source Code (repository root)

```text
backend/
├── migrations/
│   └── 0004_taxonomia_mensajes_legibles.ts     # NUEVA: reemplaza funciones de trigger (mensajes con código/texto)
├── scripts/
│   └── spike-007-identidad.ts                  # YA ESCRITO (spike); queda como evidencia y como test de humo
├── src/
│   ├── config/env.ts                           # + ACCESO_INICIAL_TTL_HORAS (default 24)
│   ├── auth/
│   │   ├── index.ts                            # MODIFICA: databaseHooks.user.create.before (rechaza + fija id), disableSignUp, hooks.before, sendMagicLink que respeta la provisión
│   │   ├── identidad-hook.ts                   # NUEVO: función del before-hook (email provisionado, normalizado; fija id)
│   │   ├── identity-hook.ts                    # MODIFICA: solo resuelve id (se elimina el INSERT en usuarios)
│   │   ├── acceso-inicial.ts                   # NUEVO: emitir/reemitir/canjear (sobre auth.verification `reset-password:*`)
│   │   └── providers/magic-link.ts             # MODIFICA: no registra ni envía el enlace de un email no provisionado
│   ├── services/
│   │   └── usuarios.ts                         # NUEVO: provisionar, cambiarRol, asignarProvincia (transacciones)
│   ├── routes/
│   │   ├── usuarios.ts                         # MODIFICA: PATCH (403 en provincia), POST alta, PUT rol, POST acceso-inicial
│   │   ├── acceso-inicial.ts                   # NUEVO: POST /api/acceso-inicial/canjear (público)
│   │   ├── organismos.ts / pools-jueces.ts     # MODIFICA: quitan try/catch locales; validan y traducen taxonomía
│   │   └── taxonomia (en organismos.ts)        # MODIFICA: PUT devuelve preguntaCodigo/preguntaTexto; valida opciones
│   ├── http/
│   │   ├── errores-integridad.ts               # NUEVO (reemplaza y amplía trigger-error.ts): setErrorHandler + mapa por constraint
│   │   └── trigger-error.ts                    # DEPRECADO/absorbido
│   └── app.ts                                  # MODIFICA: registra el manejador de errores y la excepción de 401 para el canje
└── tests/
    ├── helpers/db.ts                           # MODIFICA: crearUsuarioDePrueba pasa por provisión + acceso inicial (no sign-up)
    ├── contract/  usuarios.test.ts (+), acceso-inicial.test.ts (nuevo), errores-integridad.test.ts (nuevo),
    │              taxonomia.test.ts (+ mensajes), auth.test.ts (reescrito: sin alta pública)
    └── integration/ identity.test.ts, magic-link.test.ts (reescritos), provision.test.ts (nuevo),
                     rol-y-provincia-authz.test.ts (nuevo), password.test.ts (nuevo)
```

**Structure Decision**: backend existente, capas ya establecidas
(`auth/`, `authz/`, `routes/`, `http/`); se agrega `services/` **solo** para las
operaciones con transacción y reglas propias (provisión, rol, provincia) para que
las rutas y los helpers de prueba compartan la misma función y no dupliquen SQL.

## Riesgos y dependencias

| Riesgo / dependencia | Efecto | Mitigación |
|---|---|---|
| `createUser` de Better Auth dispara los hooks y no participa de nuestra transacción | No se puede provisionar atómicamente llamando a `createUser` | Se provisiona por SQL en **una** transacción (usuarios + roles + `auth.user`), sin pasar por `createUser` (Decisión 4) |
| Acoplamiento con la forma de `auth."user"` al insertar por SQL | Un cambio de esquema de Better Auth rompería el alta administrada | Test de contrato que compara las columnas con `getMigrations()`; el spike ya inserta esa fila |
| Token de acceso inicial en claro en `auth.verification` | Un lector de la base podría canjearlo | Riesgo aceptado (Principio IV, nota); vencimiento + un solo uso + reemisión invalida el anterior; nunca en logs |
| Canje del acceso inicial es **público** (no hay sesión todavía) | Superficie sin `401` | Solo canjea un token de 24 h, un solo uso, imposible de adivinar; sujeto al rate limiting de D10 cuando exista (Fase E); respuestas uniformes |
| 51 usos del alta pública en 19 archivos de test | Gran retrabajo de pruebas | Un solo punto de cambio (`crearUsuarioDePrueba`) + reescritura de `auth.test`/`identity.test`/`magic-link.test`, que prueban el flujo mismo |
| El perfil de `005` enviaba `provinciaId` siempre | Rompería con `403` si no se tolerara | FR-010: reenviar la provincia **actual** no es un cambio; el cliente actual sigue funcionando hasta la Fase B |
| Rotación de la cookie de sesión al cambiar la contraseña | El cliente debe aceptar el nuevo `Set-Cookie` | Es comportamiento estándar del navegador; se documenta en el contrato |
| Fase B (frontend) y E2E de `005` dependen de esto | E2E que crean usuarios por alta pública dejarán de funcionar | Fuera de alcance; se documenta en contracts/api.md ("Impacto en clientes") |

## Complexity Tracking

Sin violaciones de la constitución que justificar. Un apartamiento consciente
respecto del pedido literal, ya en el spec: FR-004 (cierra también el alta por
contraseña sobre emails provisionados) y FR-010 (reenviar la provincia actual no
es un intento de cambio).
