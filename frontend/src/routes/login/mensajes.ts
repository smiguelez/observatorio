// Mensajes de login. Decisión 2 de la spec (FR-002, SC-008): TODO fallo de login
// por contraseña muestra este mismo texto, sin distinguir contraseña incorrecta,
// cuenta inexistente o credencial invalidada. No revelar el estado de una cuenta
// es una decisión de seguridad, no una limitación.
export const MENSAJE_LOGIN_FALLIDO = 'Email o contraseña incorrectos.'
export const AYUDA_OTROS_METODOS = 'También podés ingresar con Google o con un enlace por email.'

export const MENSAJE_ENLACE_INVALIDO = 'El enlace es inválido o venció. Pedí uno nuevo.'
export const MENSAJE_ENLACE_ENVIADO = 'Si el email puede ingresar, te enviamos un enlace. Revisá tu correo.'
export const MENSAJE_ENLACE_FALLIDO = 'No pudimos enviar el enlace. Probá de nuevo en unos minutos.'
// Preparado para el rechazo de altas no provisionadas (D14/007): no revela si el email existe.
export const MENSAJE_INGRESO_GENERICO =
  'No se pudo iniciar sesión con este email. Si creés que deberías tener acceso, contactá a un administrador.'

/** Mensaje para el parámetro `?error=` con que el backend devuelve al usuario a /login. */
export function mensajeDeErrorEnUrl(codigo: string | null): string | null {
  if (!codigo) return null
  if (codigo === 'INVALID_TOKEN') return MENSAJE_ENLACE_INVALIDO
  return MENSAJE_INGRESO_GENERICO
}
