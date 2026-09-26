import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { http, parsear } from './http'
import { idWire } from './ids'

export interface PoolJueces {
  id: number
  descripcion: string | null
  totalJueces: number
  provinciaId: number
}

// snake_case en el wire; `id` es bigint => string; `provincia_id` smallint => number.
const PoolWire = z
  .object({ id: idWire, descripcion: z.string().nullable(), total_jueces: z.number().int(), provincia_id: idWire })
  .transform((w): PoolJueces => ({ id: w.id, descripcion: w.descripcion, totalJueces: w.total_jueces, provinciaId: w.provincia_id }))

export async function listarPools(): Promise<PoolJueces[]> {
  return parsear(z.array(PoolWire), await http('/api/pools-jueces'), 'pools-jueces')
}
export async function crearPool(datos: { provinciaId: number; descripcion?: string; totalJueces: number }): Promise<PoolJueces> {
  return parsear(PoolWire, await http('/api/pools-jueces', { method: 'POST', body: datos }), 'pool-jueces')
}
export async function actualizarPool(id: number, datos: { descripcion?: string; totalJueces?: number }): Promise<PoolJueces> {
  return parsear(PoolWire, await http(`/api/pools-jueces/${id}`, { method: 'PATCH', body: datos }), 'pool-jueces')
}
/**
 * Borrar un pool. Con asignaciones a unidades funcionales el backend (007, D16) responde `400 { error }` con un mensaje claro
 * ("El pool está asignado a unidades funcionales; quitalo de esas asignaciones antes de eliminarlo."): `ApiError.message` YA es
 * ese texto y se muestra tal cual. El cliente no infiere causas a partir de códigos de error genéricos.
 */
export async function eliminarPool(id: number): Promise<void> {
  await http(`/api/pools-jueces/${id}`, { method: 'DELETE' })
}

export const CLAVE_POOLS = ['pools-jueces'] as const
export const usePools = () => useQuery({ queryKey: CLAVE_POOLS, queryFn: listarPools })

export function useCrearPool() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: crearPool, onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE_POOLS }) })
}
export function useActualizarPool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: number; descripcion?: string; totalJueces?: number }) => actualizarPool(id, datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE_POOLS }),
  })
}
export function useEliminarPool() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: eliminarPool, onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE_POOLS }) })
}
