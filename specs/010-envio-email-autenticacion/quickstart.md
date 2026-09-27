# Quickstart: validar el envío de email de punta a punta

Guía de validación, no de implementación. Contrato: `contracts/api.md`;
decisiones y evidencia: `research.md`.

## Prerrequisitos

- Backend de `009` corriendo en `:3000` (mismo prerrequisito de siempre:
  `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:5173`,
  `GOOGLE_CLIENT_ID/SECRET`).
- Para los escenarios 1-4 (diseño, sin envío real): **no** hace falta
  `RESEND_API_KEY` real — el wrapper de Resend se prueba con `fetch`
  mockeado (research.md, Decisión 3).
- Para el escenario 5 (envío real de punta a punta): **sí** hace falta
  `RESEND_API_KEY` real **y** un dominio verificado (research.md, Decisión
  1) — es un prerequisito de ESE escenario puntual, no de los anteriores.

## Escenarios

| # | Escenario | Cómo | Resultado esperado | Historia / criterio |
|---|---|---|---|---|
| 1 | Magic link exitoso (con Resend mockeado) | pedir "ingresar por enlace" con un email de prueba; el fake de `enviarEmail` devuelve `{ ok: true }` | `sendMagicLink` llama a `enviarEmail` con el `html` correcto (enlace, no el token crudo); la ruta HTTP sigue respondiendo `{ status: true }` igual que hoy | US1, FR-001/002 |
| 2 | Magic link fallido | mismo pedido, el fake de `enviarEmail` devuelve `{ ok: false, motivo: '...' }` | la persona ve el mismo mensaje que en el escenario 1 (sin revelar el fallo); aparece una línea de log estructurada (`console.error`) con `proposito: 'magic_link'`, el email, el motivo — **nunca** el token | US1, FR-003, SC-001 |
| 3 | Alta con envío exitoso | `POST /api/usuarios` con `enviarPorEmail: true`, Resend mockeado en éxito | `201` con `accesoInicial.emailEnviado: true`; el token sigue presente | US2, FR-004/005/006 |
| 4 | Alta con envío fallido | mismo `POST`, Resend mockeado en fallo | `201` (el alta NO falla), `accesoInicial.emailEnviado: false`, token y vencimiento presentes igual — el admin puede copiar el enlace sin reemitir nada | US2, FR-006/007, SC-002 |
| 5 | Envío real de punta a punta (requiere dominio verificado + API key real) | mismo `POST` contra la API real de Resend, a una casilla de prueba propia | el correo llega de verdad, con el enlace correcto | US1/US2, validación final antes del corte |
| 6 | Reemisión, mismo criterio que alta | `POST /api/usuarios/:id/acceso-inicial` con `enviarPorEmail: true`, éxito y fallo mockeados | mismo comportamiento que 3/4 | US2 (Acceptance Scenario 4) |
| 7 | Sin `enviarPorEmail` (comportamiento de hoy, sin tocar) | alta o reemisión sin el campo nuevo | respuesta idéntica a la de antes de esta feature (sin `emailEnviado`) | Regresión — no romper 007/008 |
| 8 | Nunca se loguea el token | correr la suite completa con el spy de `console` ya existente (`acceso-inicial-logs.test.ts`, extendido) | ningún log (éxito o fallo, magic link o acceso inicial) contiene el token ni la contraseña | FR-008 |

## Comandos

```bash
cd backend
npm test   # unit + integration (con Resend mockeado)
```

No hay comando de "envío real" en `package.json` todavía — se agrega en
`tasks.md` si el escenario 5 termina necesitando uno reutilizable (p. ej.
un script de smoke test manual), y solo una vez que el dominio esté
verificado (research.md, Decisión 1).
