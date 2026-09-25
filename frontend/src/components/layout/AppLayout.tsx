import { Outlet } from 'react-router'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import AppSidebar from './AppSidebar'
import SesionVencidaDialog from './SesionVencidaDialog'
import Breadcrumbs from './Breadcrumbs'
import UserMenu from './UserMenu'

// Navegación agrupada por uso (FR-013). En pantallas chicas el sidebar pasa a un panel deslizable (sheet).
export default function AppLayout() {
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
