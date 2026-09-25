import { describe, expect, it } from 'vitest'
import { relacionOrganismo } from '@/features/organismos/relacion'
import type { Sesion } from '@/api/sesion'

const org = { propietarioId: 10 }
const sesion = (usuarioId: number, rol: Sesion['rol']): Sesion => ({ usuarioId, rol, provinciaId: null })

describe('relacionOrganismo', () => {
  it('propietario', () => expect(relacionOrganismo(org, sesion(10, 'usuario_normal'))).toBe('propietario'))
  it('editor: no es propietario ni admin', () => expect(relacionOrganismo(org, sesion(11, 'usuario_normal'))).toBe('editor'))
  it('admin sobre un organismo ajeno', () => expect(relacionOrganismo(org, sesion(1, 'admin'))).toBe('admin'))
  it('un admin propietario figura como propietario', () => expect(relacionOrganismo(org, sesion(10, 'admin'))).toBe('propietario'))
})
