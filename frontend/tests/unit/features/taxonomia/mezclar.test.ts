import { describe, expect, it } from 'vitest'
import type { PreguntaTaxonomia, RespuestaTaxonomia } from '@/api/taxonomia'
import { armarPut, etiquetaPregunta, mezclar, preguntasDelError } from '@/features/taxonomia/mezclar'

const opc = (...cs: string[]) => cs.map((c) => ({ codigo: c, etiqueta: c }))
const catalogo: PreguntaTaxonomia[] = [
  { codigo: 'u', texto: 'U', grupo: 'g', tipoRespuesta: 'opcion_unica', opciones: opc('A', 'B') },
  { codigo: 'm', texto: 'M', grupo: 'g', tipoRespuesta: 'opcion_multiple', opciones: opc('A', 'B', 'C') },
  { codigo: 'n', texto: 'N', grupo: 'g', tipoRespuesta: 'numerica', opciones: [] },
  { codigo: 't', texto: 'T', grupo: 'g', tipoRespuesta: 'texto_libre', opciones: [] },
]
const resp = (r: Partial<RespuestaTaxonomia> & { preguntaCodigo: string }): RespuestaTaxonomia => ({
  opcionesCodigos: [], valorNumero: null, valorTexto: null, ...r,
})

describe('mezclar: catálogo ⊕ respuestas existentes', () => {
  it('precarga lo respondido y deja vacío lo que no', () => {
    const v = mezclar(catalogo, [resp({ preguntaCodigo: 'u', opcionesCodigos: ['B'] }), resp({ preguntaCodigo: 'n', valorNumero: 7 })])
    expect(v).toEqual({ u: 'B', m: [], n: 7, t: '' })
  })
  it('sin respuestas: todo vacío', () => expect(mezclar(catalogo, [])).toEqual({ u: null, m: [], n: null, t: '' }))
  it('ignora respuestas de preguntas que ya no están en el catálogo', () => {
    expect(Object.keys(mezclar(catalogo, [resp({ preguntaCodigo: 'zzz', opcionesCodigos: ['A'] })]))).toEqual(['u', 'm', 'n', 't'])
  })
})

describe('armarPut: el PUT reemplaza el conjunto COMPLETO', () => {
  it('incluye TODAS las respuestas no vacías (las precargadas y las nuevas)', () => {
    const inicial = mezclar(catalogo, [resp({ preguntaCodigo: 'u', opcionesCodigos: ['A'] })])
    const put = armarPut(catalogo, { ...inicial, m: ['B', 'C'], t: 'hola' })
    expect(put).toEqual([
      { preguntaCodigo: 'u', opcionesCodigos: ['A'] },
      { preguntaCodigo: 'm', opcionesCodigos: ['B', 'C'] },
      { preguntaCodigo: 't', valorTexto: 'hola' },
    ])
  })
  it('omite lo vacío: múltiple sin selección, texto en blanco, numérica sin valor, única sin responder', () => {
    expect(armarPut(catalogo, { u: null, m: [], n: null, t: '   ' })).toEqual([])
  })
  it('conserva el 0 numérico (es una respuesta)', () => {
    expect(armarPut(catalogo, { u: null, m: [], n: 0, t: '' })).toEqual([{ preguntaCodigo: 'n', valorNumero: 0 }])
  })
})

describe('etiquetaPregunta (FR-008): en la base real texto === codigo', () => {
  it('usa el texto si es un enunciado', () => expect(etiquetaPregunta({ codigo: 'x', texto: '¿Cómo depende?' })).toBe('¿Cómo depende?'))
  it('si el texto es el código, no muestra el identificador crudo', () => {
    expect(etiquetaPregunta({ codigo: 'insercion_institucional', texto: 'insercion_institucional' })).toBe('Insercion institucional')
  })
})

describe('preguntasDelError', () => {
  it('resalta las preguntas cuyo código aparece en "Pregunta(s) inexistente(s)"', () => {
    expect(preguntasDelError('Pregunta(s) inexistente(s): u, zzz', catalogo)).toEqual(['u'])
  })
  it('un mensaje de trigger (id interno numérico) no resalta ninguna', () => {
    expect(preguntasDelError('evaluaciones_taxonomicas: la pregunta 5 no aplica al tipo de organismo actual (Protección A)', catalogo)).toEqual([])
  })
  it('no confunde códigos que son prefijo de otros', () => {
    expect(preguntasDelError('falla en u_extra', catalogo)).toEqual([])
  })
})
