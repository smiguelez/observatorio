import { Fragment } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useOrganismo } from '@/api/organismos'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'

const SECCIONES: Record<string, string> = {
  'unidades-funcionales': 'Unidades funcionales',
  taxonomia: 'Taxonomía',
  editores: 'Editores',
  nueva: 'Nueva',
  nuevo: 'Nuevo',
  perfil: 'Perfil',
  ajustes: 'Ajustes',
  admin: 'Administración',
  organismos: 'Mis organismos',
  usuarios: 'Usuarios',
}

interface Miga { etiqueta: string; a?: string }

export default function Breadcrumbs() {
  const { pathname } = useLocation()
  const { id } = useParams()
  const { data: organismo } = useOrganismo(id === undefined ? undefined : Number(id))
  const partes = pathname.split('/').filter(Boolean)
  if (partes.length === 0) return null

  const migas: Miga[] = []
  let acumulado = ''
  partes.forEach((p, i) => {
    acumulado += `/${p}`
    const esIdOrganismo = partes[0] === 'organismos' && i === 1 && /^\d+$/.test(p)
    const enAdmin = partes[0] === 'admin' && p === 'organismos'
    const etiqueta = esIdOrganismo
      ? (organismo?.denominacion ?? `Organismo ${p}`)
      : enAdmin
        ? 'Gestión de organismos'
        : /^\d+$/.test(p) ? `#${p}` : (SECCIONES[p] ?? p)
    // "/admin" no es una pantalla: se muestra sin enlace.
    migas.push({ etiqueta, a: i < partes.length - 1 && p !== 'admin' ? acumulado : undefined })
  })

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {migas.map((m, i) => (
          <Fragment key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {m.a ? (
                <BreadcrumbLink asChild>
                  <Link to={m.a}>{m.etiqueta}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{m.etiqueta}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
