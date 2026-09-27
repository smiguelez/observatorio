import { Scale } from 'lucide-react'
import { NavLink } from 'react-router'
import { useSesion } from '@/auth/useSesion'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'
import { construirMenu } from './menu'
import TablerosLink from './TablerosLink'

// URL pública del tablero externo; sin ella el ítem no se muestra. No es un secreto.
const URL_TABLEROS = (import.meta.env.VITE_DATASTUDIO_URL as string | undefined) || undefined

export default function AppSidebar() {
  const { sesion } = useSesion()
  const { state, toggleSidebar } = useSidebar()
  const grupos = construirMenu(sesion, URL_TABLEROS)
  return (
    <Sidebar collapsible="icon">
      {/* La cabecera es también un control de contraer/expandir (además del SidebarTrigger de la barra superior y de Ctrl/Cmd+B).
          Contraído: solo el ícono de la app (sin texto, no cabe en la franja de 3 rem); el título completo queda como sr-only. */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="[&>span:last-child]:whitespace-normal! [&>span:last-child]:text-clip!"
              onClick={toggleSidebar}
              aria-label={state === 'expanded' ? 'Contraer el menú lateral' : 'Expandir el menú lateral'}
              aria-expanded={state === 'expanded'}
              tooltip={state === 'expanded' ? 'Contraer el menú' : 'Expandir el menú'}
              data-testid="cabecera-menu"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <Scale className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm leading-tight font-semibold">Observatorio de Oficinas Judiciales</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {grupos.map((g) => (
          <SidebarGroup key={g.id} data-testid={`grupo-menu-${g.id}`}>
            <SidebarGroupLabel>{g.titulo}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((i) =>
                  i.externo ? (
                    <TablerosLink key={i.etiqueta} etiqueta={i.etiqueta} url={i.externo} icono={i.icono} />
                  ) : (
                    <SidebarMenuItem key={i.etiqueta}>
                      <SidebarMenuButton asChild tooltip={i.etiqueta}>
                        <NavLink to={i.a!} className={({ isActive }) => (isActive ? 'font-medium' : '')}>
                          {i.icono && <i.icono aria-hidden="true" />}
                          <span>{i.etiqueta}</span>
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
