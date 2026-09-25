import { describe, expect, it } from 'vitest'
import type { FilaCompletitud } from '@/features/completitud/evaluar'
import { CABECERA_PDF, filasParaPdf, generarPdf } from '@/features/completitud/exportarPdf'

const fila = (o: Partial<FilaCompletitud>): FilaCompletitud => ({
  organismoId: 1, denominacion: 'Oficina Alfa', tipoOficinaId: 1, provinciaId: 1, catalogoVacio: false,
  datosBasicos: true, unidades: true, taxonomia: true, completo: true, ...o,
})

describe('exportar a PDF (US7)', () => {
  it('las filas del PDF son las de la tabla: mismo contenido, mismo orden', () => {
    const filas = [fila({}), fila({ organismoId: 2, denominacion: 'Oficina Beta', unidades: false, completo: false }), fila({ organismoId: 3, denominacion: 'Coord', catalogoVacio: true, taxonomia: true })]
    expect(filasParaPdf(filas)).toEqual([
      ['Oficina Alfa', 'Completo', 'Completo', 'Completo', 'Completo'],
      ['Oficina Beta', 'Completo', 'Incompleto', 'Completo', 'Incompleto'],
      ['Coord', 'Completo', 'Completo', 'Completo (sin preguntas aplicables)', 'Completo'],
    ])
  })

  it('genera un PDF válido con la cabecera y los organismos', () => {
    const bytes = new Uint8Array(generarPdf([fila({}), fila({ organismoId: 2, denominacion: 'Oficina Beta', completo: false, unidades: false })]))
    const texto = new TextDecoder('latin1').decode(bytes)
    expect(texto.startsWith('%PDF-')).toBe(true)
    expect(texto).toContain('Oficina Alfa')
    expect(texto).toContain('Oficina Beta')
    expect(texto).toContain('1 de 2 organismos completos')
    for (const c of CABECERA_PDF.filter((c) => !/[áéíóú]/.test(c))) expect(texto).toContain(c)
  })
})
