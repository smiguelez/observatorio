import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { http, parsear } from './http'
import type { Catalogo } from './catalogos'

export interface FueroOrganismo {
  fueros: Catalogo[]
  fueroSimplificado: string | null
}

// Camel en el wire; un organismo sin fueros devuelve `{fueros: [], fueroSimplificado: null}` (no es error).
const FueroWire = z.object({
  fueros: z.array(z.object({ id: z.number().int(), nombre: z.string() })),
  fueroSimplificado: z.string().nullable(),
})

export async function obtenerFuero(orgId: number): Promise<FueroOrganismo> {
  return parsear(FueroWire, await http(`/api/organismos/${orgId}/fuero`), 'fuero')
}

const CLAVE_FUERO = (orgId: number) => ['organismos', orgId, 'fuero'] as const
export const useFuero = (orgId: number) => useQuery({ queryKey: CLAVE_FUERO(orgId), queryFn: () => obtenerFuero(orgId) })

// 011 (US1): reemplaza el listado COMPLETO (nunca altas/bajas individuales, contracts/api.md).
export async function actualizarFuero(orgId: number, fueroIds: number[]): Promise<FueroOrganismo> {
  return parsear(FueroWire, await http(`/api/organismos/${orgId}/fuero`, { method: 'PUT', body: { fueroIds } }), 'fuero')
}
export function useActualizarFuero(orgId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fueroIds: number[]) => actualizarFuero(orgId, fueroIds),
    onSuccess: (data) => qc.setQueryData(CLAVE_FUERO(orgId), data),
  })
}
