import { z } from 'zod'
import { http, parsear } from './http'
import { usuarioIdDesdeWire } from './ids'
import type { UsuarioId } from './sesion'

// Canje del acceso inicial (007). Ruta PÚBLICA: todavía no hay sesión. Respuesta real: `{ "usuarioId": "2386" }` más
// `Set-Cookie` de sesión (httpOnly, la gestiona el navegador).
//
// Función DIRECTA a propósito, NO un `useMutation`: una mutación de TanStack Query retiene sus `variables` (aquí el
// acceso y la contraseña) en el caché durante `gcTime`, y ni el uno ni la otra deben persistir (FR-013, SC-004).
const CanjeWire = z.object({ usuarioId: z.string() }).transform((w) => ({ usuarioId: usuarioIdDesdeWire(w.usuarioId, 'canje.usuarioId') }))

export async function canjearAccesoInicial(datos: { token: string; password: string }): Promise<{ usuarioId: UsuarioId }> {
  return parsear(CanjeWire, await http('/api/acceso-inicial/canjear', { method: 'POST', body: datos }), 'canje')
}
