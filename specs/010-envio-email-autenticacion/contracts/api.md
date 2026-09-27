# Contratos: envío de email para acceso (009)

Los dos endpoints ya existen (007/008); esta feature solo les agrega un
campo opcional al body y un campo a la respuesta. Nada de lo que ya
funciona hoy cambia de forma si el body nuevo no se manda.

## `POST /api/usuarios` — alta administrada (US2)

**Body** (agrega `enviarPorEmail`, opcional, default `false`):

```json
{
  "email": "persona@example.com",
  "rol": "usuario_normal",
  "provinciaId": 5,
  "nombreDisplay": "Nombre Apellido",
  "enviarPorEmail": true
}
```

**Respuesta 201** (agrega `emailEnviado` dentro de `accesoInicial`, solo
presente si se pidió `enviarPorEmail: true`):

```json
{
  "id": 42,
  "email": "persona@example.com",
  "...": "resto de campos ya existentes, sin cambios",
  "accesoInicial": {
    "token": "…",
    "vence": "2026-09-28T12:00:00.000Z",
    "emailEnviado": true
  }
}
```

- Si `enviarPorEmail` no viene o es `false`: `accesoInicial` queda exactamente
  igual que hoy, sin el campo `emailEnviado` — ningún consumidor existente
  del contrato se rompe.
- Si `enviarPorEmail: true` y el envío falla: `emailEnviado: false`. El
  `token`/`vence` **siempre** están presentes, se haya pedido el email o
  no, y haya fallado o no — el admin nunca pierde la posibilidad de copiar
  el enlace a mano (FR-005/FR-007).
- El fallo de envío **MUST NOT** convertirse en un error HTTP del alta: el
  usuario y su acceso inicial ya se crearon correctamente: la respuesta
  sigue siendo `201`, con `emailEnviado: false` como único indicio del
  fallo.

## `POST /api/usuarios/:id/acceso-inicial` — reemisión (US2)

Mismo criterio, mismo campo nuevo en el body y en la respuesta:

**Body**:

```json
{ "enviarPorEmail": true }
```

**Respuesta 201**:

```json
{
  "token": "…",
  "vence": "2026-09-28T12:00:00.000Z",
  "emailEnviado": true
}
```

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
