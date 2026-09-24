/** `returnTo` solo puede ser una ruta interna relativa (evita open redirect). */
export function esReturnToSeguro(valor: string | null | undefined): valor is string {
  if (!valor) return false
  if (!valor.startsWith('/')) return false
  if (valor.startsWith('//') || valor.startsWith('/\\')) return false
  return !/[\r\n]/.test(valor)
}

export function loginUrl(rutaActual: string): string {
  return `/login?returnTo=${encodeURIComponent(rutaActual)}`
}
