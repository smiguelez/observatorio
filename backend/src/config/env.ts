// Carga de configuración desde variables de entorno (Principio XIII).
// Ninguna ruta ni credencial se hardcodea acá: todo viene de env/gestor de
// secretos. Mismo patrón que migration/config/env.js.

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} (ver quickstart.md, Prerrequisitos)`)
  }
  return value
}

export interface PgConfig {
  connectionString: string
}

export function loadPgConfig(): PgConfig {
  return { connectionString: required('DATABASE_URL') }
}

export interface AuthConfig {
  secret: string
  googleClientId: string
  googleClientSecret: string
}

export function loadAuthConfig(): AuthConfig {
  return {
    secret: required('BETTER_AUTH_SECRET'),
    googleClientId: required('GOOGLE_CLIENT_ID'),
    googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
  }
}

export function loadPort(): number {
  return Number(process.env.PORT ?? 3000)
}

// 007 (FR-016/FR-022): vigencia del acceso inicial que un admin entrega a mano
// (no hay envío de correo hasta la Fase C, por eso se mide en horas).
export function loadAccesoInicialTtlHoras(): number {
  const raw = process.env.ACCESO_INICIAL_TTL_HORAS
  if (raw === undefined || raw === '') return 24
  const horas = Number(raw)
  if (!Number.isInteger(horas) || horas <= 0) {
    throw new Error('ACCESO_INICIAL_TTL_HORAS debe ser un entero mayor que 0 (horas)')
  }
  return horas
}
