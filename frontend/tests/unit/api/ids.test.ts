import { describe, expect, it } from 'vitest'
import { ContratoInesperado } from '@/api/http'
import { idDesdeWire, idWire, usuarioIdDesdeWire } from '@/api/ids'

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

describe('idDesdeWire / idWire (bigint como string, smallint como number)', () => {
  it('normaliza ambos a number', () => {
    expect(idDesdeWire('742')).toBe(742)
    expect(idDesdeWire(1)).toBe(1)
    expect(idWire.parse('1186')).toBe(1186)
    expect(idWire.parse(7)).toBe(7)
  })
  it('idWire rechaza lo que no es id', () => {
    expect(idWire.safeParse('x1').success).toBe(false)
    expect(idWire.safeParse(null).success).toBe(false)
  })
  it('usuarioIdDesdeWire es el mismo mecanismo', () => {
    expect(usuarioIdDesdeWire('5')).toBe(5)
  })
})
