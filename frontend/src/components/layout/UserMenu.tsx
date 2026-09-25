import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { authClient } from '@/api/auth-client'
import { CLAVE_SESION } from '@/auth/useSesion'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ITEMS_MENU_USUARIO } from './menu'

/** Menú de usuario dedicado (US5-2): perfil, ajustes y cierre de sesión, aparte de la navegación de organismos. */
export default function UserMenu() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  async function cerrarSesion() {
    try {
      await authClient.signOut()
    } finally {
      // Aunque falle la red, el cliente descarta la sesión local y vuelve al login.
      qc.clear()
      qc.setQueryData(CLAVE_SESION, null)
      navigate('/login', { replace: true })
    }
  }

  // modal={false}: en modo modal Radix pone aria-hidden en toda la app con el botón disparador aún
  // enfocable (axe: aria-hidden-focus, impacto serious).
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2" aria-label="Menú de usuario">
          <Avatar className="size-7">
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline">Mi cuenta</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ITEMS_MENU_USUARIO.map((i) => (
          <DropdownMenuItem key={i.etiqueta} asChild>
            <Link to={i.a!}>{i.etiqueta}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={cerrarSesion}>Cerrar sesión</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
