import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

/** Enlace externo a los tableros de DataStudio (FR-015): esta app no reconstruye ningún reporte. */
export default function TablerosLink({ etiqueta, url }: { etiqueta: string; url: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <a href={url} target="_blank" rel="noopener noreferrer">
          {etiqueta} <span aria-hidden="true">↗</span>
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
