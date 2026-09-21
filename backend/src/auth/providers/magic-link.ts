import { magicLink } from 'better-auth/plugins'

// T016 (US1): magic link (FR-005, FR-007, Principio IV). `expiresIn` fijado
// EXPLÍCITAMENTE (research.md Decisión 5: "no heredado sin revisar del
// default de un tercero") a 300s / 5 minutos — dentro del "orden de
// minutos" que exige el Principio IV. Un solo uso e invalidación al primer
// uso o expiración ya vienen del propio plugin
// (`internalAdapter.consumeVerificationValue`, atómico) — no se reimplementa
// acá.
//
// `sendMagicLink` es un placeholder EXPLÍCITO, no silencioso: todavía no hay
// un proveedor de email real decidido (fuera del alcance definido hasta
// ahora en plan.md/research.md). Loguea el link en vez de enviarlo — hay que
// resolver esto antes del corte real, no antes de esta demo/tests.
export function configMagicLink() {
  return magicLink({
    expiresIn: 300,
    sendMagicLink: async ({ email, url, token }) => {
      console.log(`[magic-link] TODO: enviar email real a ${email}. Link: ${url} (token=${token})`)
    },
  })
}
