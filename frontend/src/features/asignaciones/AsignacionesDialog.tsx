import { useState } from 'react'
import { useAsignaciones, useCrearAsignacion, useActualizarAsignacion, useEliminarAsignacion } from '@/api/asignaciones'
import { crearPool, eliminarPool, usePools, CLAVE_POOLS, type PoolJueces } from '@/api/pools'
import type { UnidadFuncional } from '@/api/unidades'
import { useQueryClient } from '@tanstack/react-query'
import { useSesion } from '@/auth/useSesion'
import SelectCatalogo from '@/components/forms/SelectCatalogo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { advertenciaCantidad, cantidadCompleta, descripcionExclusivo, ETIQUETA_ATAJO, relacionConPool, type Atajo } from './atajos'
import PoolsPanel from './PoolsPanel'

interface Props {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  orgId: number
  unidad: UnidadFuncional
  /** Provincia del organismo: los pools disponibles son los de esa provincia. */
  provinciaId: number
}

const nombrePool = (p: PoolJueces) => `${p.descripcion?.trim() || `Pool #${p.id}`} (${p.totalJueces} jueces)`

/** Diálogo de asignación de jueces de una UF (D8) — y único lugar donde se gestionan los pools. */
export default function AsignacionesDialog({ open, onOpenChange, orgId, unidad, provinciaId }: Props) {
  const { sesion } = useSesion()
  const qc = useQueryClient()
  const pools = usePools()
  const asignaciones = useAsignaciones(orgId, unidad.id)
  const crear = useCrearAsignacion(orgId, unidad.id)
  const actualizar = useActualizarAsignacion(orgId, unidad.id)
  const quitar = useEliminarAsignacion(orgId, unidad.id)

  const [atajo, setAtajo] = useState<Atajo>('completo')
  const [poolId, setPoolId] = useState<number | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [editadas, setEditadas] = useState<Record<number, string>>({})
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const puedeGestionarPools = sesion?.rol === 'admin' || (sesion?.provinciaId != null && sesion.provinciaId === provinciaId)
  const provinciaParaCrear = sesion?.rol === 'admin' ? provinciaId : (sesion?.provinciaId ?? null)
  const todosLosPools = pools.data ?? []
  const delProvincia = todosLosPools.filter((p) => p.provinciaId === provinciaId)
  const yaAsignados = new Set((asignaciones.data ?? []).map((a) => a.grupoJuecesId))
  const disponibles = delProvincia.filter((p) => !yaAsignados.has(p.id))
  const poolElegido = delProvincia.find((p) => p.id === poolId)

  const etiquetaDePool = (id: number) => {
    const p = todosLosPools.find((x) => x.id === id)
    return p ? nombrePool(p) : `Pool #${id} (fuera de tu provincia)`
  }

  function cambiarAtajo(a: Atajo) {
    setAtajo(a)
    setPoolId(null)
    setCantidad('')
    setMensaje(null)
  }
  function elegirPool(id: number) {
    setPoolId(id)
    const p = delProvincia.find((x) => x.id === id)
    if (atajo === 'completo' && p) setCantidad(String(cantidadCompleta(p)))
  }

  const n = Number(cantidad)
  const cantidadValida = cantidad !== '' && Number.isInteger(n) && n > 0
  const aviso = poolElegido && cantidadValida ? advertenciaCantidad(n, poolElegido.totalJueces) : null

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    setMensaje(null)
    if (!cantidadValida) return setMensaje({ tipo: 'error', texto: 'La cantidad asignada debe ser un entero mayor a 0.' })
    try {
      if (atajo === 'exclusivo') {
        if (provinciaParaCrear === null) return setMensaje({ tipo: 'error', texto: 'Tu perfil no tiene provincia: no podés crear un grupo.' })
        // Un exclusivo es un pool de un solo uso: se crea el pool y se asigna todo (D8: no hay un "modo" propio).
        const nuevo = await crearPool({ provinciaId: provinciaParaCrear, descripcion: descripcionExclusivo(unidad.denominacionUnidad), totalJueces: n })
        try {
          await crear.mutateAsync({ grupoJuecesId: nuevo.id, cantidadAsignada: n })
        } catch (err) {
          await eliminarPool(nuevo.id).catch(() => {}) // no dejar un pool huérfano si la asignación falló
          throw err
        }
        await qc.invalidateQueries({ queryKey: CLAVE_POOLS })
      } else {
        if (poolId === null) return setMensaje({ tipo: 'error', texto: 'Elegí un pool.' })
        await crear.mutateAsync({ grupoJuecesId: poolId, cantidadAsignada: n })
      }
      setPoolId(null)
      setCantidad('')
      setMensaje({ tipo: 'ok', texto: 'Asignación guardada.' })
    } catch (err) {
      // Los 400 del backend traen su mensaje en español (pool ya asignado, cantidad inválida, pool inexistente).
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo guardar la asignación' })
    }
  }

  async function guardarCantidad(id: number) {
    setMensaje(null)
    const c = Number(editadas[id])
    if (!Number.isInteger(c) || c <= 0) return setMensaje({ tipo: 'error', texto: 'La cantidad asignada debe ser un entero mayor a 0.' })
    try {
      await actualizar.mutateAsync({ id, cantidad: c })
      setEditadas((s) => Object.fromEntries(Object.entries(s).filter(([k]) => Number(k) !== id)))
      setMensaje({ tipo: 'ok', texto: 'Cantidad actualizada.' })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo actualizar la cantidad' })
    }
  }

  async function quitarAsignacion(id: number) {
    setMensaje(null)
    try {
      await quitar.mutateAsync(id)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo quitar la asignación' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="dialogo-asignaciones">
        <DialogHeader>
          <DialogTitle>Asignación de jueces — {unidad.denominacionUnidad}</DialogTitle>
          <DialogDescription>
            Cantidad de jueces a la que asiste esta unidad, por pool. Una unidad puede asistir a más de un pool.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="asignar">
          <TabsList>
            <TabsTrigger value="asignar">Asignar jueces</TabsTrigger>
            <TabsTrigger value="pools">Pools de la provincia</TabsTrigger>
          </TabsList>

          <TabsContent value="asignar" className="flex flex-col gap-4 pt-4">
            {mensaje && (
              <div role={mensaje.tipo === 'error' ? 'alert' : 'status'} data-testid="mensaje-asignaciones" className="rounded-md border p-3 text-sm">
                {mensaje.texto}
              </div>
            )}

            {asignaciones.data && asignaciones.data.length === 0 && (
              <p data-testid="sin-asignaciones" className="text-sm text-muted-foreground">Esta unidad todavía no tiene jueces asignados.</p>
            )}
            <ul className="flex flex-col gap-2">
              {asignaciones.data?.map((a) => {
                const pool = todosLosPools.find((p) => p.id === a.grupoJuecesId)
                const valor = editadas[a.id] ?? String(a.cantidadAsignada)
                return (
                  <li key={a.id} data-testid="fila-asignacion" className="flex flex-wrap items-end gap-2 rounded-md border p-2">
                    <span className="min-w-48 flex-1 text-sm">
                      {etiquetaDePool(a.grupoJuecesId)}
                      {pool && <span className="ml-2 text-xs text-muted-foreground">({relacionConPool(a.cantidadAsignada, pool.totalJueces)})</span>}
                    </span>
                    <div className="flex w-24 flex-col gap-1">
                      <Label htmlFor={`cant-${a.id}`} className="text-xs">Cantidad</Label>
                      <Input id={`cant-${a.id}`} type="number" min={1} value={valor} onChange={(e) => setEditadas((s) => ({ ...s, [a.id]: e.target.value }))} />
                    </div>
                    <Button type="button" size="sm" variant="secondary" onClick={() => guardarCantidad(a.id)}>Guardar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => quitarAsignacion(a.id)} aria-label={`Quitar asignación de ${etiquetaDePool(a.grupoJuecesId)}`}>Quitar</Button>
                  </li>
                )
              })}
            </ul>

            <form onSubmit={agregar} className="flex flex-col gap-3 border-t pt-4" aria-label="Agregar asignación">
              <RadioGroup value={atajo} onValueChange={(v) => cambiarAtajo(v as Atajo)} className="flex flex-wrap gap-4" aria-label="Cómo cargar">
                {(Object.keys(ETIQUETA_ATAJO) as Atajo[]).map((a) => (
                  <div key={a} className="flex items-center gap-2">
                    <RadioGroupItem id={`atajo-${a}`} value={a} />
                    <Label htmlFor={`atajo-${a}`} className="font-normal">{ETIQUETA_ATAJO[a]}</Label>
                  </div>
                ))}
              </RadioGroup>

              {atajo !== 'exclusivo' && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="asig-pool">Pool</Label>
                  <SelectCatalogo id="asig-pool" valor={poolId} alCambiar={elegirPool} placeholder="Elegí un pool"
                    opciones={disponibles.map((p) => ({ id: p.id, nombre: nombrePool(p) }))} />
                  {disponibles.length === 0 && <p className="text-xs text-muted-foreground">No hay pools disponibles: creá uno en “Pools de la provincia”.</p>}
                </div>
              )}
              {atajo === 'exclusivo' && !puedeGestionarPools && (
                <p className="text-xs text-muted-foreground">Solo podés crear grupos en tu provincia.</p>
              )}
              <div className="flex w-40 flex-col gap-1">
                <Label htmlFor="asig-cantidad">{atajo === 'exclusivo' ? 'Jueces del grupo' : 'Cantidad de jueces'}</Label>
                <Input id="asig-cantidad" type="number" min={1} value={cantidad} readOnly={atajo === 'completo' && poolId !== null}
                  onChange={(e) => setCantidad(e.target.value)} />
              </div>
              {aviso && <p role="note" data-testid="aviso-cantidad" className="text-sm text-amber-700">{aviso}</p>}
              <Button type="submit" className="self-start" disabled={crear.isPending || (atajo === 'exclusivo' && !puedeGestionarPools)}>
                Agregar asignación
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="pools" className="pt-4">
            <PoolsPanel pools={todosLosPools} provinciaId={provinciaId} provinciaParaCrear={provinciaParaCrear} puedeGestionar={puedeGestionarPools} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
