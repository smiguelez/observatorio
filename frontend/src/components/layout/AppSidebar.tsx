import { NavLink } from 'react-router'
import { useSesion } from '@/auth/useSesion'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from '@/components/ui/sidebar'
import { construirMenu } from './menu'
import TablerosLink from './TablerosLink'

// URL pública del tablero externo; sin ella el ítem no se muestra. No es un secreto.
const URL_TABLEROS = (import.meta.env.VITE_DATASTUDIO_URL as string | undefined) || undefined

export default function AppSidebar() {
  const { sesion } = useSesion()
  const grupos = construirMenu(sesion, URL_TABLEROS)
  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-4 text-sm font-semibold">Observatorio de Oficinas Judiciales</SidebarHeader>
      <SidebarContent>
        {grupos.map((g) => (
          <SidebarGroup key={g.id} data-testid={`grupo-menu-${g.id}`}>
            <SidebarGroupLabel>{g.titulo}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((i) =>
                  i.externo ? (
                    <TablerosLink key={i.etiqueta} etiqueta={i.etiqueta} url={i.externo} />
                  ) : (
                    <SidebarMenuItem key={i.etiqueta}>
                      <SidebarMenuButton asChild>
                        <NavLink to={i.a!} className={({ isActive }) => (isActive ? 'font-medium' : '')}>
                          {i.etiqueta}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
