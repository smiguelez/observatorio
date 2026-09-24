import { Navigate, Outlet, useLocation } from 'react-router'
import { Spinner } from '@/components/ui/spinner'
import NoEncontrado from '@/routes/errores/NoEncontrado'
import { loginUrl } from './returnTo'
import { useSesion } from './useSesion'

// Las guardas son UX (Principio II): el control real es el 401/403 del backend.

export function RequireAuth() {
  const { sesion, cargando } = useSesion()
  const ubicacion = useLocation()
  if (cargando) {
    return (
      <div role="status" aria-label="Cargando sesión" className="flex min-h-svh items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (!sesion) return <Navigate to={loginUrl(ubicacion.pathname + ubicacion.search)} replace />
  return <Outlet />
}

/** Un no-admin ve exactamente lo mismo que ante una ruta inexistente (FR-016). */
export function RequireAdmin() {
  const { sesion } = useSesion()
  if (sesion?.rol !== 'admin') return <NoEncontrado />
  return <Outlet />
}
