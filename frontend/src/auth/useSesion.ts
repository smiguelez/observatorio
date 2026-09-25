import { useQuery, useQueryClient } from '@tanstack/react-query'
import { obtenerSesion, type Sesion } from '@/api/sesion'
import { marcarSesionVencida } from './sesionVencida'

export const CLAVE_SESION = ['sesion'] as const

/** `cargando` es true hasta resolver la sesión: nada protegido se renderiza antes (FR-020). */
export function useSesion() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: CLAVE_SESION,
    queryFn: async (): Promise<Sesion | null> => {
      const s = await obtenerSesion()
      if (s === null) {
        // Había una sesión y ahora el servidor dice 401: venció mientras se trabajaba. Se conserva la
        // anterior (para no desmontar la pantalla y perder lo escrito) y se avisa con el diálogo de re-ingreso.
        const previa = qc.getQueryData<Sesion | null>(CLAVE_SESION)
        if (previa) {
          marcarSesionVencida()
          return previa
        }
      }
      return s
    },
    retry: false,
    staleTime: 30_000,
  })
  return { sesion: q.data ?? null, cargando: q.isPending, error: q.error }
}
