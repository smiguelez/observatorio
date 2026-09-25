import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLocalidades, useTiposUf } from '@/api/catalogos.hooks'
import { useEliminarUnidad, useUnidades, type UnidadFuncional } from '@/api/unidades'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function UnidadesTab() {
  const orgId = Number(useParams().id)
  const { data, isPending, isError } = useUnidades(orgId)
  const localidades = useLocalidades()
  const tipos = useTiposUf()
  const eliminar = useEliminarUnidad(orgId)
  const [aBorrar, setABorrar] = useState<UnidadFuncional | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nombreLocalidad = (id: number) => localidades.data?.find((l) => l.id === id)?.nombre ?? `#${id}`
  const nombreTipo = (id: number) => tipos.data?.find((t) => t.id === id)?.nombre ?? `#${id}`

  async function confirmarBorrado() {
    if (!aBorrar) return
    setError(null)
    try {
      await eliminar.mutateAsync(aBorrar.id)
      setABorrar(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la unidad funcional')
      setABorrar(null)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Unidades funcionales</h2>
        <Button asChild>
          <Link to={`/organismos/${orgId}/unidades-funcionales/nueva`}>Nueva unidad funcional</Link>
        </Button>
      </div>
      {error && <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">{error}</div>}
      {isPending && <Skeleton className="h-24 w-full" />}
      {isError && <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">No pudimos cargar las unidades funcionales.</div>}
      {data && data.length === 0 && <p data-testid="uf-vacio" className="text-muted-foreground">Este organismo todavía no tiene unidades funcionales.</p>}
      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Denominación</TableHead>
              <TableHead>Localidad</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((u) => (
              <TableRow key={u.id} data-testid="fila-uf">
                <TableCell>
                  <Link className="underline" to={`/organismos/${orgId}/unidades-funcionales/${u.id}`}>
                    {u.denominacionUnidad}
                  </Link>
                </TableCell>
                <TableCell>{nombreLocalidad(u.localidadId)}</TableCell>
                <TableCell>{nombreTipo(u.tipoUfId)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setABorrar(u)} aria-label={`Eliminar ${u.denominacionUnidad}`}>
                    Eliminar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <AlertDialog open={aBorrar !== null} onOpenChange={(a) => !a && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la unidad funcional?</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina “{aBorrar?.denominacionUnidad}” junto con sus asignaciones de jueces. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarBorrado}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
