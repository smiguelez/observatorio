// T014 (US1): credenciales locales (FR-005, FR-006). El hashing es scrypt
// por default de Better Auth (research.md Decisión 2) — no se pasa un
// `passwordHasher` custom; si se decide endurecer a argon2id más adelante,
// se reemplaza acá sin tocar el resto del sistema.
export const configPassword = {
  emailAndPassword: {
    enabled: true,
    // 007 (FR-004): no hay alta pública por contraseña, ni siquiera para un email ya dado de alta cuyo
    // dueño nunca ingresó (verificado 2026-09-25: con el hook solo, ese camino tomaba la cuenta).
    // La contraseña se fija por el acceso inicial o por su dueño autenticado.
    disableSignUp: true,
  },
} as const
