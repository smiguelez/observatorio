import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { http, parsear } from './http'
import { idWire } from './ids'

export interface AsignacionJueces {
  id: number
  grupoJuecesId: number
  cantidadAsignada: number
}

// camelCase en el wire, pero `id` y `grupoJuecesId` son bigint => string.
const AsignacionWire = z
  .object({ id: idWire, grupoJuecesId: idWire, cantidadAsignada: z.number().int() })
  .transform((w): AsignacionJueces => w)

const ruta = (orgId: number, ufId: number) => `/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`

export async function listarAsignaciones(orgId: number, ufId: number): Promise<AsignacionJueces[]> {
  return parsear(z.array(AsignacionWire), await http(ruta(orgId, ufId)), 'asignaciones-jueces')
}
/** 400 documentados: pool ya asignado, cantidad <= 0, pool inexistente — el mensaje viene en `ApiError.message`. */
export async function crearAsignacion(orgId: number, ufId: number, d: { grupoJuecesId: number; cantidadAsignada: number }): Promise<AsignacionJueces> {
  return parsear(AsignacionWire, await http(ruta(orgId, ufId), { method: 'POST', body: d }), 'asignacion-jueces')
}
export async function actualizarAsignacion(orgId: number, ufId: number, id: number, cantidadAsignada: number): Promise<AsignacionJueces> {
  return parsear(AsignacionWire, await http(`${ruta(orgId, ufId)}/${id}`, { method: 'PATCH', body: { cantidadAsignada } }), 'asignacion-jueces')
}
export async function eliminarAsignacion(orgId: number, ufId: number, id: number): Promise<void> {
  await http(`${ruta(orgId, ufId)}/${id}`, { method: 'DELETE' })
}

export const claveAsignaciones = (orgId: number, ufId: number) => ['organismos', orgId, 'unidades', ufId, 'asignaciones'] as const

export const useAsignaciones = (orgId: number, ufId: number) =>
  useQuery({ queryKey: claveAsignaciones(orgId, ufId), queryFn: () => listarAsignaciones(orgId, ufId) })

export function useCrearAsignacion(orgId: number, ufId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { grupoJuecesId: number; cantidadAsignada: number }) => crearAsignacion(orgId, ufId, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveAsignaciones(orgId, ufId) }),
  })
}
export function useActualizarAsignacion(orgId: number, ufId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, cantidad }: { id: number; cantidad: number }) => actualizarAsignacion(orgId, ufId, id, cantidad),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveAsignaciones(orgId, ufId) }),
  })
}
export function useEliminarAsignacion(orgId: number, ufId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => eliminarAsignacion(orgId, ufId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: claveAsignaciones(orgId, ufId) }),
  })
}
