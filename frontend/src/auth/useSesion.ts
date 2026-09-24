import { useQuery } from '@tanstack/react-query'
import { obtenerSesion } from '@/api/sesion'

export const CLAVE_SESION = ['sesion'] as const

/** `cargando` es true hasta resolver la sesión: nada protegido se renderiza antes (FR-020). */
export function useSesion() {
  const q = useQuery({ queryKey: CLAVE_SESION, queryFn: obtenerSesion, retry: false, staleTime: 30_000 })
  return { sesion: q.data ?? null, cargando: q.isPending, error: q.error }
}
