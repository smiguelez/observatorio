import type { Organismo } from '@/api/organismos'

/** Datos ya leídos de un organismo para evaluar su completitud. */
export interface EntradaCompletitud {
  organismo: Organismo
  cantidadUnidades: number
  /** El catálogo de preguntas aplicable a su tipo está vacío (coordinación, unidad operativa). */
  catalogoVacio: boolean
  /** Respuestas de taxonomía cargadas; `0` si no hace falta pedirlas (catálogo vacío). */
  cantidadRespuestas: number
}

export interface Completitud {
  datosBasicos: boolean
  unidades: boolean
  taxonomia: boolean
  completo: boolean
}

/**
 * Criterios (data-model.md, US7/FR-017), sin ningún criterio de negocio adicional:
 *  - datos básicos: denominación, denominación simplificada, tipo y provincia presentes;
 *  - unidades: al menos una UF;
 *  - taxonomía: al menos una respuesta, **o** el tipo no tiene preguntas aplicables (decisión 7:
 *    "completa, nada pendiente").
 */
export function calcularCompletitud(e: EntradaCompletitud): Completitud {
  const o = e.organismo
  const datosBasicos =
    o.denominacion.trim() !== '' && o.denominacionSimplificadaId > 0 && o.tipoOficinaId > 0 && o.provinciaId > 0
  const unidades = e.cantidadUnidades >= 1
  const taxonomia = e.catalogoVacio || e.cantidadRespuestas >= 1
  return { datosBasicos, unidades, taxonomia, completo: datosBasicos && unidades && taxonomia }
}
