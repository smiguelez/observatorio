# Contratos: envío de email para acceso (010)

`POST /api/usuarios` y `POST /api/usuarios/:id/acceso-inicial` (alta y
reemisión, 007/008) **no cambian de forma** — la opción de enviar por
email es un endpoint nuevo, que actúa sobre el acceso YA generado por
cualquiera de los dos anteriores (research.md, Decisión 4, corregida
durante la implementación).

## `POST /api/usuarios/:id/acceso-inicial/enviar-email` — NUEVO (US2)

Envía por email el acceso inicial **vigente** de ese usuario (el que
generó la alta o la última reemisión) — no genera uno nuevo, no invalida
el anterior. Solo admin.

**Body**: ninguno.

**Respuesta 200** (éxito de envío):

```json
{ "emailEnviado": true }
```

**Respuesta 200** (envío intentado, pero falló):

```json
{ "emailEnviado": false }
```

**Respuesta 404** (no hay ningún acceso inicial vigente para ese usuario —
nunca se emitió uno, o el que había ya venció o ya se canjeó):

```json
{ "error": "No hay un acceso inicial vigente para este usuario." }
```

- El fallo de **envío** (proveedor caído, etc.) **MUST NOT** ser un error
  HTTP: sigue siendo `200`, con `emailEnviado: false` — el enlace no se
  toca, "Copiar enlace" en la misma pantalla sigue funcionando exactamente
  igual (FR-007).
- El **404** es distinto: no es un fallo de envío, es que no hay nada que
  enviar (caso borde, no el camino esperado — el botón normalmente se
  ofrece justo después de generar el acceso).
- Nunca recibe el token en el body: lo resuelve del lado del servidor
  contra la fila vigente en `auth.verification` (mismo criterio que ya usa
  `emitirAccesoInicial` para invalidar la anterior).

## `POST /sign-in/magic-link` (Better Auth) — sin cambio de contrato (US1)

Este endpoint ya existe tal cual (montado por Better Auth) y su contrato de
cara al cliente **no cambia**: sigue respondiendo `{ status: true }` sin
distinguir éxito/fallo de envío ni existencia de cuenta (spec.md FR-003,
ya así hoy por FR-003 de 007). Lo único que cambia es qué hace
internamente `sendMagicLink` (dejar de loguear, empezar a enviar) — invisible
para quien lo consume.

## Nuevo, interno (no expuesto por HTTP): `enviarEmail()`

```ts
function enviarEmail(args: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: true } | { ok: false; motivo: string }>
```

No es un endpoint — es la función compartida (`backend/src/email/resend.ts`,
research.md Decisión 3) que ambos flujos llaman. Se documenta acá porque es
el único contrato interno nuevo que los dos flujos comparten.
