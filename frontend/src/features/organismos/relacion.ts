import type { OrganismoResumen } from '@/api/organismos'
import type { Sesion } from '@/api/sesion'

export type RelacionOrganismo = 'propietario' | 'editor' | 'admin'

/**
 * Relación del usuario con un organismo — derivada en el cliente (el backend no la manda).
 * La lista solo trae propios y editados; un admin ve todos.
 */
export function relacionOrganismo(organismo: Pick<OrganismoResumen, 'propietarioId'>, sesion: Sesion): RelacionOrganismo {
  if (organismo.propietarioId === sesion.usuarioId) return 'propietario'
  if (sesion.rol === 'admin') return 'admin'
  return 'editor'
}

export const ETIQUETA_RELACION: Record<RelacionOrganismo, string> = {
  propietario: 'Propio',
  editor: 'Editor',
  admin: 'Admin',
}
