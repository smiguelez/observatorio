import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useCompletitud } from '@/api/completitud'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { descargarPdf } from '@/features/completitud/exportarPdf'

type Filtro = 'todos' | 'completos' | 'incompletos'

const Estado = ({ ok }: { ok: boolean }) => (
  <Badge variant={ok ? 'secondary' : 'outline'} data-estado={ok ? 'completo' : 'incompleto'}>{ok ? 'Completo' : 'Incompleto'}</Badge>
)

/**
 * Gestión de organismos (admin): completitud por organismo y exportación a PDF. Desde 009 la completitud llega calculada por el
 * backend en UNA sola solicitud (`GET /api/organismos/completitud`); antes el cliente hacía ~3 llamadas por organismo (~341 en total).
 * La regla de qué hace completo a un organismo no cambió: solo cambió dónde se calcula.
 */
export default function AdminOrganismosPage() {
  const completitud = useCompletitud()
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const filas = useMemo(() => completitud.data ?? [], [completitud.data])
  const visibles = useMemo(
    () => filas.filter((f) => (filtro === 'todos' ? true : filtro === 'completos' ? f.completo : !f.completo)),
    [filas, filtro],
  )
  const completos = filas.filter((f) => f.completo).length

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Gestión de organismos</h1>
        <Button type="button" disabled={!completitud.data || filas.length === 0} onClick={() => descargarPdf(filas)}>
          Exportar PDF
        </Button>
      </div>

      {completitud.isError && (
        <div role="alert" data-testid="completitud-error" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/50 p-3 text-sm">
          No pudimos cargar la completitud de los organismos.
          <Button type="button" size="sm" variant="outline" onClick={() => void completitud.refetch()}>Reintentar</Button>
        </div>
      )}

      {completitud.isPending && (
        <div data-testid="progreso" role="status" aria-label="Cargando la completitud de los organismos" className="flex flex-col gap-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {completitud.data && (
        <p data-testid="resumen-completitud" className="text-sm">
          {completos} de {filas.length} organismos completos.
        </p>
      )}

      <div className="flex gap-2" role="group" aria-label="Filtrar por estado">
        {(['todos', 'completos', 'incompletos'] as Filtro[]).map((f) => (
          <Button key={f} type="button" size="sm" variant={filtro === f ? 'default' : 'outline'} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
            {f[0]!.toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organismo</TableHead>
            <TableHead>Datos básicos</TableHead>
            <TableHead>Unidades funcionales</TableHead>
            <TableHead>Taxonomía</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibles.map((f) => (
            <TableRow key={f.organismoId} data-testid="fila-completitud" data-org-id={f.organismoId} data-estado={f.completo ? 'completo' : 'incompleto'}>
              <TableCell><Link className="underline" to={`/organismos/${f.organismoId}`}>{f.denominacion}</Link></TableCell>
              <TableCell data-col="datos"><Estado ok={f.datosBasicos} /></TableCell>
              <TableCell data-col="unidades"><Estado ok={f.unidades} /></TableCell>
              <TableCell data-col="taxonomia">
                <Estado ok={f.taxonomia} />
                {f.catalogoVacio && <span className="ml-2 text-xs text-muted-foreground">sin preguntas aplicables</span>}
              </TableCell>
              <TableCell data-col="estado"><Estado ok={f.completo} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
