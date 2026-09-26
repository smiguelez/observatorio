import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { CLAVE_SESION } from '@/auth/useSesion'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import AppSidebar from './AppSidebar'
import SesionVencidaDialog from './SesionVencidaDialog'
import Breadcrumbs from './Breadcrumbs'
import UserMenu from './UserMenu'

// Navegación agrupada por uso (FR-013). En pantallas chicas el sidebar pasa a un panel deslizable (sheet).
export default function AppLayout() {
  const qc = useQueryClient()
  const { pathname } = useLocation()
  const anterior = useRef(pathname)
  // 008 (FR-021): al cambiar de pantalla se relee la sesión, de modo que un cambio de rol o de provincia hecho por un
  // administrador rija en la siguiente pantalla sin re-login (antes podía quedar vieja hasta `staleTime`, 30 s). La
  // relectura es en segundo plano: `useSesion` devuelve el dato previo mientras tanto y no desmonta nada.
  useEffect(() => {
    if (anterior.current === pathname) return
    anterior.current = pathname
    void qc.invalidateQueries({ queryKey: CLAVE_SESION })
  }, [pathname, qc])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger aria-label="Abrir o cerrar el menú" />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex-1 overflow-hidden">
            <Breadcrumbs />
          </div>
          <UserMenu />
        </header>
        {/* SidebarInset ya renderiza el <main>: no se anida otro. */}
        <div className="p-4" data-testid="contenido">
          <Outlet />
        </div>
      </SidebarInset>
      <SesionVencidaDialog />
    </SidebarProvider>
  )
}
