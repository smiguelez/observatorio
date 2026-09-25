import { NavLink, Outlet, useParams } from 'react-router'
import { ApiError } from '@/api/http'
import { useOrganismo } from '@/api/organismos'
import { Skeleton } from '@/components/ui/skeleton'
import NoAutorizado from '@/routes/errores/NoAutorizado'
import NoEncontrado from '@/routes/errores/NoEncontrado'
import { cn } from '@/lib/utils'

const PESTANAS = [
  { a: '', etiqueta: 'Datos', fin: true },
  { a: 'unidades-funcionales', etiqueta: 'Unidades funcionales', fin: false },
  { a: 'taxonomia', etiqueta: 'Taxonomía', fin: false },
  { a: 'editores', etiqueta: 'Editores', fin: false },
]

/** Layout de un organismo: carga el detalle y muestra las pestañas. 403 => No autorizado; 404 => No encontrado. */
export default function OrganismoDetallePage() {
  const { id } = useParams()
  const orgId = Number(id)
  const { data, isPending, error } = useOrganismo(orgId)

  if (!Number.isInteger(orgId)) return <NoEncontrado />
  if (error instanceof ApiError && error.status === 403) return <NoAutorizado />
  if (error instanceof ApiError && error.status === 404) return <NoEncontrado />
  if (isPending) return <Skeleton className="h-32 w-full" />
  if (error || !data) {
    return (
      <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">
        No pudimos cargar el organismo.
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold" data-testid="titulo-organismo">
        {data.denominacion}
      </h1>
      <nav aria-label="Secciones del organismo" className="flex gap-1 border-b">
        {PESTANAS.map((p) => (
          <NavLink
            key={p.a}
            to={p.a ? `/organismos/${orgId}/${p.a}` : `/organismos/${orgId}`}
            end={p.fin}
            className={({ isActive }) =>
              cn('border-b-2 px-3 py-2 text-sm', isActive ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground')
            }
          >
            {p.etiqueta}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </section>
  )
}
