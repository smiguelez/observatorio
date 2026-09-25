import { z, type ZodType } from 'zod'
import type { PreguntaTaxonomia } from '@/api/taxonomia'

/** Valor de formulario por pregunta — uno por `tipoRespuesta` (data-model.md). */
export type ValorPregunta = string | null | string[] | number

export type ValoresTaxonomia = Record<string, ValorPregunta>

const CODIGO_SEGURO = /^[A-Za-z0-9_]+$/

/**
 * Construye en runtime el esquema del formulario a partir del catálogo aplicable al tipo del
 * organismo (FR-006): nunca hay un conjunto fijo de campos.
 *  - opción única   → una opción del catálogo, o `null` (sin responder)
 *  - opción múltiple → 0..n opciones del catálogo (0 = no responder, no es error)
 *  - numérica       → número finito, o `null`
 *  - texto libre    → string (vacío = no responder)
 */
export function construirEsquema(catalogo: PreguntaTaxonomia[]) {
  const forma: Record<string, ZodType> = {}
  for (const p of catalogo) {
    // Los códigos son nombres de campo de react-hook-form: un `.` o `[` los rompería.
    if (!CODIGO_SEGURO.test(p.codigo)) throw new Error(`Código de pregunta no admitido como campo: "${p.codigo}"`)
    const validas = new Set(p.opciones.map((o) => o.codigo))
    switch (p.tipoRespuesta) {
      case 'opcion_unica':
        forma[p.codigo] = z.string().nullable().refine((v) => v === null || validas.has(v), 'Elegí una de las opciones')
        break
      case 'opcion_multiple':
        forma[p.codigo] = z.array(z.string()).refine((vs) => vs.every((v) => validas.has(v)), 'Elegí solo opciones válidas')
        break
      case 'numerica':
        forma[p.codigo] = z.number({ error: 'Ingresá un número' }).finite('Ingresá un número').nullable()
        break
      case 'texto_libre':
        forma[p.codigo] = z.string()
        break
    }
  }
  return z.object(forma)
}
