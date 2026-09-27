import type { LucideIcon } from 'lucide-react'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

/** Enlace externo a los tableros de DataStudio (FR-015): esta app no reconstruye ningún reporte. */
export default function TablerosLink({ etiqueta, url, icono: Icono }: { etiqueta: string; url: string; icono?: LucideIcon }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={etiqueta}>
        <a href={url} target="_blank" rel="noopener noreferrer">
          {Icono && <Icono aria-hidden="true" />}
          <span>
            {etiqueta} <span aria-hidden="true">↗</span>
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
