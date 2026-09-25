import { useState } from 'react'
import { useActualizarPool, useCrearPool, useEliminarPool, type PoolJueces } from '@/api/pools'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  pools: PoolJueces[]
  /** Provincia a la que pertenecen los pools de este organismo. */
  provinciaId: number
  /** Provincia con la que se crean pools nuevos: la del organismo si es admin, la propia si no. */
  provinciaParaCrear: number | null
  puedeGestionar: boolean
}

/**
 * Único lugar de la app donde se crean, editan y eliminan pools (decisión 4, FR-024): no hay
 * pantalla ni ítem de menú aparte. Los endpoints son los de `002` (alcance por provincia).
 */
export default function PoolsPanel({ pools, provinciaId, provinciaParaCrear, puedeGestionar }: Props) {
  const crear = useCrearPool()
  const actualizar = useActualizarPool()
  const eliminar = useEliminarPool()
  const [descripcion, setDescripcion] = useState('')
  const [total, setTotal] = useState('')
  const [editados, setEditados] = useState<Record<number, { descripcion: string; total: string }>>({})
  const [aBorrar, setABorrar] = useState<PoolJueces | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const delProvincia = pools.filter((p) => p.provinciaId === provinciaId)
  const valorDe = (p: PoolJueces) => editados[p.id] ?? { descripcion: p.descripcion ?? '', total: String(p.totalJueces) }

  async function crearPool(e: React.FormEvent) {
    e.preventDefault()
    setMensaje(null)
    const n = Number(total)
    if (provinciaParaCrear === null || total === '' || !Number.isInteger(n) || n < 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresá un total de jueces entero (0 o más).' })
      return
    }
    try {
      const p = await crear.mutateAsync({ provinciaId: provinciaParaCrear, descripcion: descripcion.trim() || undefined, totalJueces: n })
      setDescripcion('')
      setTotal('')
      setMensaje({ tipo: 'ok', texto: `Pool creado: ${p.descripcion ?? `#${p.id}`}.` })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo crear el pool' })
    }
  }

  async function guardarPool(p: PoolJueces) {
    setMensaje(null)
    const v = valorDe(p)
    const n = Number(v.total)
    if (v.total === '' || !Number.isInteger(n) || n < 0) {
      setMensaje({ tipo: 'error', texto: 'El total de jueces debe ser un entero (0 o más).' })
      return
    }
    try {
      await actualizar.mutateAsync({ id: p.id, descripcion: v.descripcion, totalJueces: n })
      setEditados((s) => Object.fromEntries(Object.entries(s).filter(([k]) => Number(k) !== p.id)))
      setMensaje({ tipo: 'ok', texto: 'Pool actualizado.' })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo actualizar el pool' })
    }
  }

  async function borrar() {
    if (!aBorrar) return
    const p = aBorrar
    setABorrar(null)
    setMensaje(null)
    try {
      await eliminar.mutateAsync(p.id)
      setMensaje({ tipo: 'ok', texto: 'Pool eliminado.' })
    } catch (err) {
      // PoolEnUsoError: el backend responde 500 si el pool tiene asignaciones (brecha G6).
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo eliminar el pool' })
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="panel-pools">
      {!puedeGestionar && (
        <p role="note" data-testid="pools-sin-permiso" className="rounded-md border p-3 text-sm">
          Solo podés gestionar pools de tu provincia. Este organismo es de otra provincia, así que acá solo podés ver los pools.
        </p>
      )}
      {mensaje && (
        <div role={mensaje.tipo === 'error' ? 'alert' : 'status'} data-testid="mensaje-pools" className="rounded-md border p-3 text-sm">
          {mensaje.texto}
        </div>
      )}

      {delProvincia.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pools cargados en esta provincia.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {delProvincia.map((p) => {
            const v = valorDe(p)
            return (
              <li key={p.id} data-testid="fila-pool" className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                <div className="flex min-w-48 flex-1 flex-col gap-1">
                  <Label htmlFor={`pool-desc-${p.id}`} className="text-xs">Descripción</Label>
                  <Input id={`pool-desc-${p.id}`} value={v.descripcion} disabled={!puedeGestionar}
                    onChange={(e) => setEditados((s) => ({ ...s, [p.id]: { ...v, descripcion: e.target.value } }))} />
                </div>
                <div className="flex w-28 flex-col gap-1">
                  <Label htmlFor={`pool-total-${p.id}`} className="text-xs">Total de jueces</Label>
                  <Input id={`pool-total-${p.id}`} type="number" min={0} value={v.total} disabled={!puedeGestionar}
                    onChange={(e) => setEditados((s) => ({ ...s, [p.id]: { ...v, total: e.target.value } }))} />
                </div>
                {puedeGestionar && (
                  <>
                    <Button type="button" size="sm" variant="secondary" onClick={() => guardarPool(p)}>Guardar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setABorrar(p)}
                      aria-label={`Eliminar pool ${p.descripcion ?? p.id}`}>Eliminar</Button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {puedeGestionar && (
        <form onSubmit={crearPool} className="flex flex-wrap items-end gap-2 border-t pt-4" aria-label="Crear pool">
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <Label htmlFor="pool-nuevo-desc" className="text-xs">Descripción del pool nuevo</Label>
            <Input id="pool-nuevo-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div className="flex w-28 flex-col gap-1">
            <Label htmlFor="pool-nuevo-total" className="text-xs">Total de jueces</Label>
            <Input id="pool-nuevo-total" type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <Button type="submit" disabled={crear.isPending}>Crear pool</Button>
        </form>
      )}

      <AlertDialog open={aBorrar !== null} onOpenChange={(a) => !a && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el pool?</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina “{aBorrar?.descripcion ?? `#${aBorrar?.id}`}”. Si está asignado a alguna unidad funcional no se va a poder eliminar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={borrar}>Eliminar pool</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
