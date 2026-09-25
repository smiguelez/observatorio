import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { ApiError, http, parsear } from './http'
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

/** Borrar un pool con asignaciones: el backend responde 500 (FK 23503 sin capturar — brecha G6, `007`). */
export class PoolEnUsoError extends Error {
  constructor() {
    super('No se pudo eliminar el pool: puede estar asignado a otras unidades funcionales.')
    this.name = 'PoolEnUsoError'
  }
}

export async function listarPools(): Promise<PoolJueces[]> {
  return parsear(z.array(PoolWire), await http('/api/pools-jueces'), 'pools-jueces')
}
export async function crearPool(datos: { provinciaId: number; descripcion?: string; totalJueces: number }): Promise<PoolJueces> {
  return parsear(PoolWire, await http('/api/pools-jueces', { method: 'POST', body: datos }), 'pool-jueces')
}
export async function actualizarPool(id: number, datos: { descripcion?: string; totalJueces?: number }): Promise<PoolJueces> {
  return parsear(PoolWire, await http(`/api/pools-jueces/${id}`, { method: 'PATCH', body: datos }), 'pool-jueces')
}
export async function eliminarPool(id: number): Promise<void> {
  try {
    await http(`/api/pools-jueces/${id}`, { method: 'DELETE' })
  } catch (e) {
    // Solo el 500 con SQLSTATE 23503 (violación de FK) significa "pool en uso"; cualquier otro error se propaga.
    if (e instanceof ApiError && e.status === 500 && (e.cuerpo as { code?: unknown } | undefined)?.code === '23503') {
      throw new PoolEnUsoError()
    }
    throw e
  }
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
