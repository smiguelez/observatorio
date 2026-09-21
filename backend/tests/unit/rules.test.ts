// T012: tests unitarios de backend/src/authz/rules.ts. Sin HTTP, sin DB —
// solo las funciones puras contra IdentidadResuelta + datos de recurso.

import { describe, expect, it } from 'vitest'
import { esAdmin, esOwnerOEditor, mismaProvincia } from '../../src/authz/rules.js'
import type { IdentidadResuelta } from '../../src/auth/resolve-identity.js'

function identidad(overrides: Partial<IdentidadResuelta> = {}): IdentidadResuelta {
  return {
    usuarioId: 1n,
    rol: 'usuario_normal',
    provinciaId: 5,
    ...overrides,
  }
}

describe('esAdmin', () => {
  it('es true cuando el rol es admin', () => {
    expect(esAdmin(identidad({ rol: 'admin' }))).toBe(true)
  })

  it('es false cuando el rol es usuario_normal', () => {
    expect(esAdmin(identidad({ rol: 'usuario_normal' }))).toBe(false)
  })
})

describe('esOwnerOEditor', () => {
  it('es true cuando el usuario es el propietario', () => {
    const yo = identidad({ usuarioId: 42n })
    expect(esOwnerOEditor(yo, { propietarioId: 42n, editorIds: [] })).toBe(true)
  })

  it('es true cuando el usuario está en la lista de editores', () => {
    const yo = identidad({ usuarioId: 7n })
    expect(esOwnerOEditor(yo, { propietarioId: 1n, editorIds: [3n, 7n, 9n] })).toBe(true)
  })

  it('es false cuando el usuario no es propietario ni editor', () => {
    const yo = identidad({ usuarioId: 99n })
    expect(esOwnerOEditor(yo, { propietarioId: 1n, editorIds: [3n, 7n] })).toBe(false)
  })

  it('NO trata al admin como owner/editor automáticamente (se combina con OR en el llamador, como en la regla real)', () => {
    const admin = identidad({ usuarioId: 99n, rol: 'admin' })
    expect(esOwnerOEditor(admin, { propietarioId: 1n, editorIds: [] })).toBe(false)
  })
})

describe('mismaProvincia', () => {
  it('es true cuando la provincia del usuario coincide con la del recurso', () => {
    const yo = identidad({ provinciaId: 12 })
    expect(mismaProvincia(yo, { provinciaId: 12 })).toBe(true)
  })

  it('es false cuando la provincia difiere', () => {
    const yo = identidad({ provinciaId: 12 })
    expect(mismaProvincia(yo, { provinciaId: 13 })).toBe(false)
  })

  it('es false cuando el usuario no tiene provincia asignada (NULL)', () => {
    const yo = identidad({ provinciaId: null })
    expect(mismaProvincia(yo, { provinciaId: 12 })).toBe(false)
  })
})
