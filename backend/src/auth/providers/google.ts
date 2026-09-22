import { loadAuthConfig } from '../../config/env.js'

// T015 (US1): Google Sign-In (FR-005). Credenciales por variable de entorno
// (Principio XIII) — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, ya cargadas
// por config/env.ts.
export function configGoogle() {
  const { googleClientId, googleClientSecret } = loadAuthConfig()
  return {
    socialProviders: {
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      },
    },
  } as const
}
