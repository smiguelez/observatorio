import { obtenerOrganismo, type OrganismoResumen } from '@/api/organismos'
import { obtenerCatalogoTaxonomia, obtenerRespuestasTaxonomia } from '@/api/taxonomia'
import { listarUnidades } from '@/api/unidades'
import { calcularCompletitud, type Completitud } from './calcular'

export interface FilaCompletitud extends Completitud {
  organismoId: number
  denominacion: string
  tipoOficinaId: number
  provinciaId: number
  catalogoVacio: boolean
}

/** Catálogo de taxonomía por `tipoOficinaId`: se pide UNA vez por tipo aunque haya cientos de organismos. */
export function crearCacheCatalogo() {
  const promesas = new Map<number, Promise<{ vacio: boolean }>>()
  return (tipoOficinaId: number) => {
    let p = promesas.get(tipoOficinaId)
    if (!p) {
      p = obtenerCatalogoTaxonomia(tipoOficinaId).then((c) => ({ vacio: c.length === 0 }))
      promesas.set(tipoOficinaId, p)
    }
    return p
  }
}

/**
 * Lee lo necesario de un organismo (detalle, UF y —solo si su tipo tiene preguntas— respuestas de
 * taxonomía) y calcula su completitud. Son solo lecturas.
 */
export async function evaluarOrganismo(resumen: OrganismoResumen, catalogoDe: ReturnType<typeof crearCacheCatalogo>): Promise<FilaCompletitud> {
  const organismo = await obtenerOrganismo(resumen.id)
  const unidades = await listarUnidades(resumen.id)
  const { vacio } = await catalogoDe(organismo.tipoOficinaId)
  const respuestas = vacio ? 0 : (await obtenerRespuestasTaxonomia(resumen.id)).length
  const c = calcularCompletitud({ organismo, cantidadUnidades: unidades.length, catalogoVacio: vacio, cantidadRespuestas: respuestas })
  return { ...c, organismoId: organismo.id, denominacion: organismo.denominacion, tipoOficinaId: organismo.tipoOficinaId, provinciaId: organismo.provinciaId, catalogoVacio: vacio }
}
