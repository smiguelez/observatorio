// T014 (US1): credenciales locales (FR-005, FR-006). El hashing es scrypt
// por default de Better Auth (research.md Decisión 2) — no se pasa un
// `passwordHasher` custom; si se decide endurecer a argon2id más adelante,
// se reemplaza acá sin tocar el resto del sistema.
export const configPassword = {
  emailAndPassword: {
    enabled: true,
  },
} as const
