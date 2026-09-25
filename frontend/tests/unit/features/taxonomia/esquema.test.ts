import { describe, expect, it } from 'vitest'
import type { PreguntaTaxonomia } from '@/api/taxonomia'
import { construirEsquema } from '@/features/taxonomia/esquema'

const opc = (...cs: string[]) => cs.map((c) => ({ codigo: c, etiqueta: `Opción ${c}` }))
// Catálogo SINTÉTICO con los 4 tipos: la base real solo tiene 9 preguntas de opción única (SC-003).
const catalogo: PreguntaTaxonomia[] = [
  { codigo: 'u', texto: 'U', grupo: 'g', tipoRespuesta: 'opcion_unica', opciones: opc('A', 'B') },
  { codigo: 'm', texto: 'M', grupo: 'g', tipoRespuesta: 'opcion_multiple', opciones: opc('A', 'B', 'C') },
  { codigo: 'n', texto: 'N', grupo: 'g', tipoRespuesta: 'numerica', opciones: [] },
  { codigo: 't', texto: 'T', grupo: 'g', tipoRespuesta: 'texto_libre', opciones: [] },
]
const esquema = construirEsquema(catalogo)
const ok = { u: 'A', m: ['A'], n: 3, t: 'x' }

describe('construirEsquema (FR-006/FR-007)', () => {
  it('tiene un campo por pregunta del catálogo, ninguno más', () => {
    expect(Object.keys(esquema.shape)).toEqual(['u', 'm', 'n', 't'])
    expect(Object.keys(construirEsquema([]).shape)).toEqual([])
  })
  it('valores completos válidos', () => expect(esquema.safeParse(ok).success).toBe(true))

  describe('opción única', () => {
    it('acepta una opción del catálogo o null (sin responder)', () => {
      expect(esquema.safeParse({ ...ok, u: 'B' }).success).toBe(true)
      expect(esquema.safeParse({ ...ok, u: null }).success).toBe(true)
    })
    it('rechaza una opción que no es de la pregunta', () => expect(esquema.safeParse({ ...ok, u: 'Z' }).success).toBe(false))
  })
  describe('opción múltiple', () => {
    it('0..n opciones; cero NO es error', () => {
      expect(esquema.safeParse({ ...ok, m: [] }).success).toBe(true)
      expect(esquema.safeParse({ ...ok, m: ['A', 'C'] }).success).toBe(true)
    })
    it('rechaza opciones ajenas', () => expect(esquema.safeParse({ ...ok, m: ['A', 'Z'] }).success).toBe(false))
  })
  describe('numérica', () => {
    it('número finito o null', () => {
      expect(esquema.safeParse({ ...ok, n: 0 }).success).toBe(true)
      expect(esquema.safeParse({ ...ok, n: null }).success).toBe(true)
    })
    it('rechaza NaN, Infinity y strings', () => {
      expect(esquema.safeParse({ ...ok, n: Number.NaN }).success).toBe(false)
      expect(esquema.safeParse({ ...ok, n: Number.POSITIVE_INFINITY }).success).toBe(false)
      expect(esquema.safeParse({ ...ok, n: '3' }).success).toBe(false)
    })
  })
  describe('texto libre', () => {
    it('cualquier string, incluido vacío (= no responder)', () => {
      expect(esquema.safeParse({ ...ok, t: '' }).success).toBe(true)
    })
  })
  it('rechaza un código que no sirve como nombre de campo', () => {
    expect(() => construirEsquema([{ ...catalogo[0]!, codigo: 'a.b' }])).toThrow()
  })
})
