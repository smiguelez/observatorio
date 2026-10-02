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

// 010 (US1/US2): proveedor de envío real de email (Resend, research.md Decisión 3). Sin API
// key real ni dominio verificado, cualquier llamada real falla — pero eso es un prerequisito de
// ESE envío puntual (tasks.md T010), no de poder arrancar el servidor ni correr los tests
// (que mockean `enviarEmail`, nunca llaman a esto en el camino de test).
export interface EmailConfig {
  resendApiKey: string
  remitente: string
}

export function loadEmailConfig(): EmailConfig {
  return {
    resendApiKey: required('RESEND_API_KEY'),
    remitente: required('EMAIL_REMITENTE'),
  }
}

// Origen público del frontend, para construir del lado del servidor un enlace absoluto (el email
// de acceso inicial, US2) — reutiliza `BETTER_AUTH_URL`, que ya existe y ya lee Better Auth por su
// cuenta (ver `auth/index.ts`); no se crea una variable de entorno nueva para lo mismo.
export function loadOrigenFrontend(): string {
  return required('BETTER_AUTH_URL')
}

// Fase D (reporting): sincronización Postgres -> Google Sheets (scripts/reportes-sheets/). La
// credencial de la cuenta de servicio de Google vive FUERA del repo (Principio XIII) — acá solo se
// carga la RUTA al archivo (no es secreta en sí misma) desde una variable de entorno, nunca
// hardcodeada. `metabaseRoUrl` es la misma conexión de solo lectura que ya usa Metabase.
export interface ReportingSheetsConfig {
  metabaseRoUrl: string
  keyFile: string
  spreadsheetId: string
}

export function loadReportingSheetsConfig(): ReportingSheetsConfig {
  return {
    metabaseRoUrl: required('METABASE_RO_DATABASE_URL'),
    keyFile: required('GOOGLE_SHEETS_KEY_FILE'),
    spreadsheetId: required('GOOGLE_SHEETS_REPORTING_ID'),
  }
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
