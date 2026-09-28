import { magicLink } from 'better-auth/plugins'
import { enviarEmail } from '../../email/resend.js'
import { plantillaMagicLink } from '../../email/plantillas.js'

// T016 (US1): magic link (FR-005, FR-007, Principio IV). `expiresIn` fijado
// EXPLÍCITAMENTE (research.md Decisión 5: "no heredado sin revisar del
// default de un tercero") a 300s / 5 minutos — dentro del "orden de
// minutos" que exige el Principio IV. Un solo uso e invalidación al primer
// uso o expiración ya vienen del propio plugin
// (`internalAdapter.consumeVerificationValue`, atómico) — no se reimplementa
// acá.
//
// 010 (US1, FR-001/002/003): `sendMagicLink` ya no loguea el link (placeholder
// de 007) — lo envía de verdad vía Resend. Si el envío falla, la persona que
// lo pidió NO se entera acá (ve la misma respuesta uniforme de siempre, FR-003
// de 007, que este cambio no toca): el fallo se deja registrado con un
// `console.error` ESTRUCTURADO para que un administrador lo note aparte
// (research.md, Decisión 2 — no hay tabla de auditoría, es el mismo mecanismo
// que ya intercepta `acceso-inicial-logs.test.ts`). Nunca se loguea el
// `token` ni el `url` completo, ni en éxito ni en fallo (FR-008).
export function configMagicLink() {
  return magicLink({
    expiresIn: 300,
    sendMagicLink: async ({ email, url }) => {
      const { subject, html } = plantillaMagicLink({ url })
      const resultado = await enviarEmail({ to: email, subject, html })
      if (!resultado.ok) {
        console.error(JSON.stringify({ evento: 'envio_email_fallido', proposito: 'magic_link', email, motivo: resultado.motivo }))
      }
    },
  })
}
