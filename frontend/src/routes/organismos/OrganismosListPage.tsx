import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useOrganismos } from '@/api/organismos'
import { useSesion } from '@/auth/useSesion'
import { ETIQUETA_RELACION, relacionOrganismo } from '@/features/organismos/relacion'

export default function OrganismosListPage() {
  const { sesion } = useSesion()
  const { data, isPending, isError, refetch } = useOrganismos()

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mis organismos</h1>
        <Button asChild>
          <Link to="/organismos/nuevo">Nuevo organismo</Link>
        </Button>
      </div>

      {isPending && <Skeleton className="h-24 w-full" />}
      {isError && (
        <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">
          No pudimos cargar los organismos.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {data && data.length === 0 && (
        <p data-testid="organismos-vacio" className="text-muted-foreground">
          Todavía no tenés organismos. Creá el primero con “Nuevo organismo”.
        </p>
      )}
      {data && data.length > 0 && sesion && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Denominación</TableHead>
              <TableHead className="w-32">Relación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((o) => (
              <TableRow key={o.id} data-testid="fila-organismo">
                <TableCell>
                  <Link className="underline" to={`/organismos/${o.id}`}>
                    {o.denominacion}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{ETIQUETA_RELACION[relacionOrganismo(o, sesion)]}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
