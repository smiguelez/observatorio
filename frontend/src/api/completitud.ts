import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { http, parsear } from './http'
import { idWire } from './ids'

// GET /api/organismos/completitud (009): la completitud de TODOS los organismos visibles en UNA sola solicitud. El backend la calcula
// con una consulta SQL agregada; la regla es la misma que antes calculaba el cliente (datos básicos + al menos una unidad funcional +
// taxonomía cargada, o tipo sin preguntas aplicables). Forma real (camelCase, `organismoId` bigint => string):
//   [{ organismoId: "742", denominacion, tipoOficinaId, provinciaId, datosBasicos, unidades, catalogoVacio, taxonomia, completo }]
export interface FilaCompletitud {
  organismoId: number
  denominacion: string
  tipoOficinaId: number
  provinciaId: number
  datosBasicos: boolean
  unidades: boolean
  /** El catálogo de preguntas aplicable a su tipo está vacío (coordinación, unidad operativa): la taxonomía cuenta como completa. */
  catalogoVacio: boolean
  taxonomia: boolean
  completo: boolean
}

const FilaWire = z
  .object({
    organismoId: idWire,
    denominacion: z.string(),
    tipoOficinaId: z.number().int(),
    provinciaId: z.number().int(),
    datosBasicos: z.boolean(),
    unidades: z.boolean(),
    catalogoVacio: z.boolean(),
    taxonomia: z.boolean(),
    completo: z.boolean(),
  })
  .transform((w): FilaCompletitud => w)

export async function obtenerCompletitud(): Promise<FilaCompletitud[]> {
  return parsear(z.array(FilaWire), await http('/api/organismos/completitud'), 'completitud')
}

export const CLAVE_COMPLETITUD = ['completitud'] as const
export const useCompletitud = () => useQuery({ queryKey: CLAVE_COMPLETITUD, queryFn: obtenerCompletitud })
