import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { ApiError, http, parsear } from './http'
import { idWire } from './ids'
import type { UsuarioId } from './sesion'

// ---- Dominio ----

export interface OrganismoResumen {
  id: number
  denominacion: string
  propietarioId: UsuarioId
}

export interface Organismo extends OrganismoResumen {
  denominacionSimplificadaId: number
  tipoOficinaId: number
  provinciaId: number
  estadoFueros: string
  actualizadoA: string | null
}

// ---- Esquemas wire (D13): validan, pasan a camelCase y normalizan ids ----

const ResumenWire = z
  .object({ id: idWire, denominacion: z.string(), propietario_id: idWire })
  .transform((w): OrganismoResumen => ({ id: w.id, denominacion: w.denominacion, propietarioId: w.propietario_id }))

// GET /api/organismos/:id devuelve `SELECT *` de la tabla.
const OrganismoWire = z
  .object({
    id: idWire,
    denominacion: z.string(),
    denominacion_simplificada_id: idWire,
    tipo_oficina_id: idWire,
    provincia_id: idWire,
    propietario_id: idWire,
    estado_fueros: z.string(),
    actualizado_a: z.string().nullable(),
  })
  .transform(
    (w): Organismo => ({
      id: w.id,
      denominacion: w.denominacion,
      propietarioId: w.propietario_id,
      denominacionSimplificadaId: w.denominacion_simplificada_id,
      tipoOficinaId: w.tipo_oficina_id,
      provinciaId: w.provincia_id,
      estadoFueros: w.estado_fueros,
      actualizadoA: w.actualizado_a,
    }),
  )

// ---- Llamadas ----

export async function listarOrganismos(): Promise<OrganismoResumen[]> {
  return parsear(z.array(ResumenWire), await http('/api/organismos'), 'organismos')
}

export async function obtenerOrganismo(id: number): Promise<Organismo> {
  return parsear(OrganismoWire, await http(`/api/organismos/${id}`), 'organismo')
}

export interface DatosOrganismo {
  denominacion: string
  denominacionSimplificadaId: number
  tipoOficinaId: number
  provinciaId: number
}

export async function crearOrganismo(datos: DatosOrganismo): Promise<OrganismoResumen> {
  // Nunca se envía propietario: el servidor lo fuerza a la sesión (FR-004).
  return parsear(ResumenWire, await http('/api/organismos', { method: 'POST', body: datos }), 'organismo')
}

export async function actualizarOrganismo(
  id: number,
  datos: Partial<DatosOrganismo> & { confirmarPerdidaTaxonomia?: boolean },
): Promise<OrganismoResumen> {
  return parsear(ResumenWire, await http(`/api/organismos/${id}`, { method: 'PATCH', body: datos }), 'organismo')
}

/** Protección B (004): un 400 con `preguntasQueSePerderian` pide confirmación antes de cambiar el tipo. */
export interface PreguntaPorPerder {
  codigo: string
  texto: string
}

export function preguntasPorPerder(e: unknown): PreguntaPorPerder[] | null {
  if (!(e instanceof ApiError) || e.status !== 400) return null
  const lista = (e.cuerpo as { preguntasQueSePerderian?: unknown } | undefined)?.preguntasQueSePerderian
  const r = z.array(z.object({ codigo: z.string(), texto: z.string() })).safeParse(lista)
  return r.success ? r.data : null
}

// ---- Hooks ----

export const CLAVE_ORGANISMOS = ['organismos'] as const

export const useOrganismos = () => useQuery({ queryKey: CLAVE_ORGANISMOS, queryFn: listarOrganismos })

/** `id` indefinido (o no entero) => no se pide nada (p. ej. el breadcrumb en pantallas que no son de un organismo). */
export const useOrganismo = (id: number | undefined) =>
  useQuery({
    queryKey: [...CLAVE_ORGANISMOS, id],
    queryFn: () => obtenerOrganismo(id!),
    enabled: id !== undefined && Number.isInteger(id),
    retry: (n, e) => !(e instanceof ApiError && [401, 403, 404].includes(e.status)) && n < 2,
  })

export function useCrearOrganismo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: crearOrganismo,
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE_ORGANISMOS }),
  })
}

export function useActualizarOrganismo(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (datos: Parameters<typeof actualizarOrganismo>[1]) => actualizarOrganismo(id, datos),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE_ORGANISMOS }),
  })
}
