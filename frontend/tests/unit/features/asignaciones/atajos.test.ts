import { describe, expect, it } from 'vitest'
import { advertenciaCantidad, cantidadCompleta, descripcionExclusivo, relacionConPool } from '@/features/asignaciones/atajos'

describe('atajos de asignación de jueces (D8)', () => {
  it('pool completo: la cantidad propuesta es el total del pool', () => expect(cantidadCompleta({ totalJueces: 10 })).toBe(10))

  it('completo = total; subconjunto = menor; excede = mayor', () => {
    expect(relacionConPool(10, 10)).toBe('completo')
    expect(relacionConPool(3, 10)).toBe('subconjunto')
    expect(relacionConPool(11, 10)).toBe('excede')
  })

  it('cantidad > total ADVIERTE pero no bloquea (devuelve texto, no error)', () => {
    expect(advertenciaCantidad(11, 10)).toMatch(/supera el total/)
    expect(advertenciaCantidad(10, 10)).toBeNull()
    expect(advertenciaCantidad(3, 10)).toBeNull()
  })

  it('no se persiste ningún "modo": el tipo del atajo no forma parte de lo que se envía', () => {
    // El cuerpo del POST es solo {grupoJuecesId, cantidadAsignada} (api/asignaciones.ts): sin campo de modo.
    const cuerpo = { grupoJuecesId: 1, cantidadAsignada: cantidadCompleta({ totalJueces: 5 }) }
    expect(Object.keys(cuerpo).sort()).toEqual(['cantidadAsignada', 'grupoJuecesId'])
  })

  it('el grupo exclusivo lleva el nombre de la UF', () => expect(descripcionExclusivo('Mesa 1')).toBe('Grupo exclusivo de Mesa 1'))
})
