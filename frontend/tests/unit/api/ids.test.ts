import { describe, expect, it } from 'vitest'
import { ContratoInesperado } from '@/api/http'
import { usuarioIdDesdeWire } from '@/api/ids'

describe('usuarioIdDesdeWire (D13: string -> number)', () => {
  it('convierte el string del wire a number', () => {
    expect(usuarioIdDesdeWire('1172')).toBe(1172)
  })
  it('deja pasar un number', () => {
    expect(usuarioIdDesdeWire(12)).toBe(12)
  })
  it('rechaza un string no entero', () => {
    expect(() => usuarioIdDesdeWire('12abc')).toThrow(ContratoInesperado)
    expect(() => usuarioIdDesdeWire('')).toThrow(ContratoInesperado)
    expect(() => usuarioIdDesdeWire('1.5')).toThrow(ContratoInesperado)
  })
  it('rechaza un entero fuera del rango seguro de number', () => {
    expect(() => usuarioIdDesdeWire('9007199254740993')).toThrow(ContratoInesperado)
  })
})
