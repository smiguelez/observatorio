import { describe, expect, it } from 'vitest'
import type { Organismo } from '@/api/organismos'
import { calcularCompletitud } from '@/features/completitud/calcular'

const org = (o: Partial<Organismo> = {}): Organismo => ({
  id: 1, denominacion: 'Oficina X', propietarioId: 1, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1,
  estadoFueros: 'sin_fueros_asignados', actualizadoA: null, ...o,
})

describe('calcularCompletitud (US7, decisión 7)', () => {
  it('todo cargado => completo', () => {
    expect(calcularCompletitud({ organismo: org(), cantidadUnidades: 2, catalogoVacio: false, cantidadRespuestas: 3 })).toEqual({
      datosBasicos: true, unidades: true, taxonomia: true, completo: true,
    })
  })
  it('sin unidades funcionales => incompleto', () => {
    const c = calcularCompletitud({ organismo: org(), cantidadUnidades: 0, catalogoVacio: false, cantidadRespuestas: 3 })
    expect(c).toMatchObject({ unidades: false, completo: false })
  })
  it('con preguntas aplicables y sin respuestas => taxonomía incompleta', () => {
    const c = calcularCompletitud({ organismo: org(), cantidadUnidades: 1, catalogoVacio: false, cantidadRespuestas: 0 })
    expect(c).toMatchObject({ taxonomia: false, completo: false })
  })
  it('tipo SIN preguntas aplicables => la taxonomía cuenta como completa aunque haya 0 respuestas', () => {
    const c = calcularCompletitud({ organismo: org({ tipoOficinaId: 3 }), cantidadUnidades: 1, catalogoVacio: true, cantidadRespuestas: 0 })
    expect(c).toMatchObject({ taxonomia: true, completo: true })
  })
  it('datos básicos: denominación en blanco => incompleto', () => {
    expect(calcularCompletitud({ organismo: org({ denominacion: '   ' }), cantidadUnidades: 1, catalogoVacio: false, cantidadRespuestas: 1 }).datosBasicos).toBe(false)
  })
})
