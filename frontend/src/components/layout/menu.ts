import { Building2, ChartColumn, ClipboardCheck, Users, type LucideIcon } from 'lucide-react'
import type { Sesion } from '@/api/sesion'

export interface ItemMenu {
  etiqueta: string
  /** Ícono del ítem: es lo único visible con el menú contraído (modo de íconos). Solo los ítems de navegación lo llevan. */
  icono?: LucideIcon
  /** Ruta interna. Ausente si el ítem es un enlace externo. */
  a?: string
  /** URL externa (se abre en otra pestaña con rel="noopener noreferrer"). */
  externo?: string
}

export interface GrupoMenu {
  id: string
  titulo: string
  items: ItemMenu[]
}

/**
 * Jerarquía de navegación por criterio de uso (research.md, Dec. 7) — sin pools ni registro:
 *   Organismos → Mis organismos · Reportes → Tableros ↗ (si hay URL) · Administración (solo admin).
 * Perfil, Ajustes y Cerrar sesión viven en el menú de usuario, aparte de esta navegación (US5-2).
 * Es solo UX: el control real de las pantallas de admin es del backend (Principio II).
 */
export function construirMenu(sesion: Sesion | null, urlTableros: string | undefined): GrupoMenu[] {
  const grupos: GrupoMenu[] = [{ id: 'organismos', titulo: 'Organismos', items: [{ etiqueta: 'Mis organismos', icono: Building2, a: '/organismos' }] }]

  if (urlTableros) {
    grupos.push({ id: 'reportes', titulo: 'Reportes', items: [{ etiqueta: 'Tableros', icono: ChartColumn, externo: urlTableros }] })
  }
  if (sesion?.rol === 'admin') {
    grupos.push({
      id: 'admin',
      titulo: 'Administración',
      items: [
        { etiqueta: 'Gestión de organismos', icono: ClipboardCheck, a: '/admin/organismos' },
        { etiqueta: 'Usuarios', icono: Users, a: '/admin/usuarios' },
      ],
    })
  }
  return grupos
}

/** Ítems del menú de usuario. */
export const ITEMS_MENU_USUARIO: ItemMenu[] = [
  { etiqueta: 'Perfil', a: '/perfil' },
  { etiqueta: 'Ajustes', a: '/ajustes' },
]
