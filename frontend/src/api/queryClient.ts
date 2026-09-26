import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/http'
import { marcarSesionVencida } from '@/auth/sesionVencida'
import { CLAVE_SESION } from '@/auth/useSesion'

// Un 401 en cualquier llamada => la sesión ya no es válida. Si había una sesión activa, se avisa con el
// diálogo de re-ingreso SIN desmontar la pantalla (para no perder lo que se estaba escribiendo — Edge Case
// de la spec); si no la había, las guardas redirigen a /login?returnTo=... (FR-020).
//
// 008 (FR-021): un 403 de una MUTACIÓN significa "sin permiso": la identidad (rol/provincia) pudo haber cambiado por
// acción de un administrador, así que se relee la sesión en segundo plano (sin desmontar la pantalla).
export function crearQueryClient(): QueryClient {
  const alFallar = (error: unknown, esMutacion: boolean) => {
    if (!(error instanceof ApiError)) return
    if (error.status === 401) {
      if (client.getQueryData(CLAVE_SESION)) marcarSesionVencida()
      else client.setQueryData(CLAVE_SESION, null)
    } else if (error.status === 403 && esMutacion) {
      void client.invalidateQueries({ queryKey: CLAVE_SESION })
    }
  }
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (e) => alFallar(e, false) }),
    mutationCache: new MutationCache({ onError: (e) => alFallar(e, true) }),
  })
  return client
}
