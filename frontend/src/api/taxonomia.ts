import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { http, parsear } from './http'

export type TipoRespuesta = 'opcion_unica' | 'opcion_multiple' | 'numerica' | 'texto_libre'

export interface Opcion {
  codigo: string
  etiqueta: string
}

export interface PreguntaTaxonomia {
  codigo: string
  texto: string
  grupo: string
  tipoRespuesta: TipoRespuesta
  /** Todas las opciones posibles (catálogo). `[]` si la pregunta no es de opción. */
  opciones: Opcion[]
}

/** Una respuesta ya guardada de un organismo, normalizada. */
export interface RespuestaTaxonomia {
  preguntaCodigo: string
  /** SOLO las opciones seleccionadas (en el endpoint de respuestas `opciones` significa "elegidas"). */
  opcionesCodigos: string[]
  valorNumero: number | null
  valorTexto: string | null
}

/** Cuerpo del PUT: reemplaza el conjunto COMPLETO (omitir una respuesta la borra). */
export interface RespuestaPut {
  preguntaCodigo: string
  opcionesCodigos?: string[]
  valorNumero?: number
  valorTexto?: string
}

const TipoWire = z.enum(['opcion_unica', 'opcion_multiple', 'numerica', 'texto_libre'])
const OpcionWire = z.object({ codigo: z.string(), etiqueta: z.string() })

// Catálogo — GET /api/taxonomia/preguntas[?tipoOficinaId=]; camelCase; `opciones` solo en las de opción.
const PreguntaWire = z
  .object({ codigo: z.string(), texto: z.string(), grupo: z.string(), tipoRespuesta: TipoWire, opciones: z.array(OpcionWire).optional() })
  .superRefine((w, ctx) => {
    // El backend manda `opciones` siempre en las de opción y nunca en las demás (formatearPregunta).
    const deOpcion = w.tipoRespuesta === 'opcion_unica' || w.tipoRespuesta === 'opcion_multiple'
    if (deOpcion && w.opciones === undefined) ctx.addIssue({ code: 'custom', path: ['opciones'], message: 'Falta `opciones` en una pregunta de opción' })
  })
  .transform((w): PreguntaTaxonomia => ({ ...w, opciones: w.opciones ?? [] }))

// Respuestas — GET /api/organismos/:orgId/taxonomia; camelCase; solo preguntas ya respondidas.
const RespuestaWire = z
  .object({
    pregunta: z.object({ codigo: z.string(), texto: z.string(), grupo: z.string(), tipoRespuesta: TipoWire }),
    opciones: z.array(OpcionWire).optional(),
    valorNumero: z.number().optional(),
    valorTexto: z.string().nullable().optional(),
  })
  .superRefine((w, ctx) => {
    // Cada tipo trae SU valor: opción => `opciones` (las elegidas); numérica => valorNumero; texto libre => valorTexto.
    const t = w.pregunta.tipoRespuesta
    if ((t === 'opcion_unica' || t === 'opcion_multiple') && w.opciones === undefined) ctx.addIssue({ code: 'custom', path: ['opciones'], message: 'Falta `opciones` en una respuesta de opción' })
    if (t === 'numerica' && w.valorNumero === undefined) ctx.addIssue({ code: 'custom', path: ['valorNumero'], message: 'Falta valorNumero' })
    if (t === 'texto_libre' && w.valorTexto === undefined) ctx.addIssue({ code: 'custom', path: ['valorTexto'], message: 'Falta valorTexto' })
  })
  .transform(
    (w): RespuestaTaxonomia => ({
      preguntaCodigo: w.pregunta.codigo,
      opcionesCodigos: (w.opciones ?? []).map((o) => o.codigo),
      valorNumero: w.valorNumero ?? null,
      valorTexto: w.valorTexto ?? null,
    }),
  )

export async function obtenerCatalogoTaxonomia(tipoOficinaId: number): Promise<PreguntaTaxonomia[]> {
  return parsear(z.array(PreguntaWire), await http(`/api/taxonomia/preguntas?tipoOficinaId=${tipoOficinaId}`), 'taxonomia/preguntas')
}

export async function obtenerRespuestasTaxonomia(orgId: number): Promise<RespuestaTaxonomia[]> {
  return parsear(z.array(RespuestaWire), await http(`/api/organismos/${orgId}/taxonomia`), 'taxonomia/respuestas')
}

export async function reemplazarRespuestasTaxonomia(orgId: number, respuestas: RespuestaPut[]): Promise<RespuestaTaxonomia[]> {
  return parsear(
    z.array(RespuestaWire),
    await http(`/api/organismos/${orgId}/taxonomia`, { method: 'PUT', body: { respuestas } }),
    'taxonomia/respuestas',
  )
}

// El catálogo por tipo cambia raramente: se comparte entre pantallas y con la vista de completitud.
export const useCatalogoTaxonomia = (tipoOficinaId: number | undefined) =>
  useQuery({
    queryKey: ['taxonomia', 'catalogo', tipoOficinaId],
    queryFn: () => obtenerCatalogoTaxonomia(tipoOficinaId!),
    enabled: tipoOficinaId !== undefined,
    staleTime: Infinity,
  })

export const useRespuestasTaxonomia = (orgId: number, habilitado = true) =>
  useQuery({ queryKey: ['organismos', orgId, 'taxonomia'], queryFn: () => obtenerRespuestasTaxonomia(orgId), enabled: habilitado })

export function useGuardarTaxonomia(orgId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (respuestas: RespuestaPut[]) => reemplazarRespuestasTaxonomia(orgId, respuestas),
    onSuccess: (nuevas) => qc.setQueryData(['organismos', orgId, 'taxonomia'], nuevas),
  })
}
