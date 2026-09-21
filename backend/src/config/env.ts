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
