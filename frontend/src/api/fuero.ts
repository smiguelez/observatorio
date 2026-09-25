import { useQuery } from '@tanstack/react-query'
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

export const useFuero = (orgId: number) =>
  useQuery({ queryKey: ['organismos', orgId, 'fuero'], queryFn: () => obtenerFuero(orgId) })
