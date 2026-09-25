import type { PoolJueces } from '@/api/pools'

// D8: en la base NO existe un "modo" de asignación; todo es (UF, pool, cantidad). Estos tres atajos son
// ayuda de carga y NO se persisten: solo determinan qué cantidad se propone.
export type Atajo = 'exclusivo' | 'completo' | 'subconjunto'

export const ETIQUETA_ATAJO: Record<Atajo, string> = {
  exclusivo: 'Grupo exclusivo de esta unidad',
  completo: 'Pool completo',
  subconjunto: 'Subconjunto de un pool',
}

/** Cantidad propuesta al elegir un pool con el atajo "pool completo" (todo el pool). */
export function cantidadCompleta(pool: Pick<PoolJueces, 'totalJueces'>): number {
  return pool.totalJueces
}

export type RelacionConPool = 'completo' | 'subconjunto' | 'excede'

/** Cómo se lee una cantidad respecto del total del pool (solo informativo; no se guarda). */
export function relacionConPool(cantidad: number, totalJueces: number): RelacionConPool {
  if (cantidad === totalJueces) return 'completo'
  return cantidad < totalJueces ? 'subconjunto' : 'excede'
}

/** Advertencia (NO bloqueo, D8: el modelo no impone tope): la cantidad supera el total del pool. */
export function advertenciaCantidad(cantidad: number, totalJueces: number): string | null {
  return cantidad > totalJueces
    ? `La cantidad (${cantidad}) supera el total del pool (${totalJueces}). Podés guardarla igual.`
    : null
}

export function descripcionExclusivo(denominacionUnidad: string): string {
  return `Grupo exclusivo de ${denominacionUnidad}`
}
