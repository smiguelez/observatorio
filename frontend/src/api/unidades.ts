import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { http, parsear } from './http'
import { idWire } from './ids'

export interface UnidadFuncional {
  id: number
  organismoId: number
  denominacionUnidad: string
  localidadId: number
  tipoUfId: number
  anioImplementacion: number | null
  domicilio: string | null
  telefono: string | null
  mail: string | null
  responsable: string | null
  codigoPostal: string | null
}

// snake_case en el wire (SELECT *); los ids bigint (id, organismo_id, localidad_id) llegan como string.
const UnidadWire = z
  .object({
    id: idWire,
    organismo_id: idWire,
    denominacion_unidad: z.string(),
    localidad_id: idWire,
    tipo_uf_id: idWire,
    anio_implementacion: z.number().int().nullable(),
    domicilio: z.string().nullable(),
    telefono: z.string().nullable(),
    mail: z.string().nullable(),
    responsable: z.string().nullable(),
    codigo_postal: z.string().nullable(),
  })
  .transform(
    (w): UnidadFuncional => ({
      id: w.id,
      organismoId: w.organismo_id,
      denominacionUnidad: w.denominacion_unidad,
      localidadId: w.localidad_id,
      tipoUfId: w.tipo_uf_id,
      anioImplementacion: w.anio_implementacion,
      domicilio: w.domicilio,
      telefono: w.telefono,
      mail: w.mail,
      responsable: w.responsable,
      codigoPostal: w.codigo_postal,
    }),
  )

export interface DatosUnidad {
  denominacionUnidad: string
  localidadId: number
  tipoUfId: number
  anioImplementacion?: number
  domicilio?: string
  telefono?: string
  mail?: string
  responsable?: string
  codigoPostal?: string
}

const base = (orgId: number) => `/api/organismos/${orgId}/unidades-funcionales`

export async function listarUnidades(orgId: number): Promise<UnidadFuncional[]> {
  return parsear(z.array(UnidadWire), await http(base(orgId)), 'unidades-funcionales')
}
export async function obtenerUnidad(orgId: number, ufId: number): Promise<UnidadFuncional> {
  return parsear(UnidadWire, await http(`${base(orgId)}/${ufId}`), 'unidad-funcional')
}
export async function crearUnidad(orgId: number, datos: DatosUnidad): Promise<UnidadFuncional> {
  return parsear(UnidadWire, await http(base(orgId), { method: 'POST', body: datos }), 'unidad-funcional')
}
/** PATCH con COALESCE en el backend: un campo omitido no cambia; no se puede "vaciar" enviando null. */
export async function actualizarUnidad(orgId: number, ufId: number, datos: Partial<DatosUnidad>): Promise<UnidadFuncional> {
  return parsear(UnidadWire, await http(`${base(orgId)}/${ufId}`, { method: 'PATCH', body: datos }), 'unidad-funcional')
}
export async function eliminarUnidad(orgId: number, ufId: number): Promise<void> {
  await http(`${base(orgId)}/${ufId}`, { method: 'DELETE' })
}

export const claveUnidades = (orgId: number) => ['organismos', orgId, 'unidades'] as const

export const useUnidades = (orgId: number) => useQuery({ queryKey: claveUnidades(orgId), queryFn: () => listarUnidades(orgId) })
export const useUnidad = (orgId: number, ufId: number | undefined) =>
  useQuery({ queryKey: [...claveUnidades(orgId), ufId], queryFn: () => obtenerUnidad(orgId, ufId!), enabled: ufId !== undefined })

export function useCrearUnidad(orgId: number) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (d: DatosUnidad) => crearUnidad(orgId, d), onSuccess: () => qc.invalidateQueries({ queryKey: claveUnidades(orgId) }) })
}
export function useActualizarUnidad(orgId: number, ufId: number) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (d: Partial<DatosUnidad>) => actualizarUnidad(orgId, ufId, d), onSuccess: () => qc.invalidateQueries({ queryKey: claveUnidades(orgId) }) })
}
export function useEliminarUnidad(orgId: number) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (ufId: number) => eliminarUnidad(orgId, ufId), onSuccess: () => qc.invalidateQueries({ queryKey: claveUnidades(orgId) }) })
}
