import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { obtenerSesion } from '@/api/sesion'
import { limpiarSesionVencida, useSesionVencida } from '@/auth/sesionVencida'
import { CLAVE_SESION, useSesion } from '@/auth/useSesion'
import { loginUrl } from '@/auth/returnTo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import PasswordForm from '@/routes/login/PasswordForm'

/**
 * Aviso de sesión vencida con re-ingreso por contraseña SOBRE la misma pantalla: lo que el usuario venía
 * escribiendo sigue en el formulario (no se recarga ni se navega). Si ingresa con OTRA cuenta se recarga
 * la app para no mezclar datos de dos usuarios. Quien entra por Google/enlace no puede hacerlo acá: se lo
 * lleva al login y se le avisa que lo no guardado se pierde.
 */
export default function SesionVencidaDialog() {
  const vencida = useSesionVencida()
  const { sesion } = useSesion()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const ubicacion = useLocation()

  async function alReingresar() {
    const nueva = await obtenerSesion()
    if (nueva && sesion && nueva.usuarioId !== sesion.usuarioId) {
      window.location.assign('/organismos') // otra cuenta: estado limpio
      return
    }
    qc.setQueryData(CLAVE_SESION, nueva)
    limpiarSesionVencida()
    await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'sesion' && q.state.status === 'error' })
  }

  function irAlLogin() {
    limpiarSesionVencida()
    qc.setQueryData(CLAVE_SESION, null)
    navigate(loginUrl(ubicacion.pathname + ubicacion.search), { replace: true })
  }

  return (
    <Dialog open={vencida} onOpenChange={() => { /* no se cierra sin re-ingresar: cualquier guardado fallaría */ }}>
      <DialogContent showCloseButton={false} data-testid="sesion-vencida" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Tu sesión venció</DialogTitle>
          <DialogDescription>
            Volvé a ingresar para poder guardar. Lo que escribiste sigue en la pantalla y no se pierde.
          </DialogDescription>
        </DialogHeader>
        <PasswordForm alExito={alReingresar} alElegirOtroMetodo={irAlLogin} />
        <Button type="button" variant="link" className="self-start px-0" onClick={irAlLogin}>
          Ingresar con Google o con un enlace (se pierde lo que no guardaste)
        </Button>
      </DialogContent>
    </Dialog>
  )
}
