import { describe, expect, it } from 'vitest'
import type { Sesion } from '@/api/sesion'
import { construirMenu, ITEMS_MENU_USUARIO } from '@/components/layout/menu'

const normal: Sesion = { usuarioId: 1, rol: 'usuario_normal', provinciaId: 1 }
const admin: Sesion = { usuarioId: 2, rol: 'admin', provinciaId: null }
const URL = 'https://datastudio.example.test/reporte'

const todosLosEnlaces = (g: ReturnType<typeof construirMenu>) => g.flatMap((x) => x.items).map((i) => `${i.etiqueta} ${i.a ?? ''}`.toLowerCase())

describe('jerarquía de menús (US5, FR-013)', () => {
  it('NINGÚN rol tiene ítem de pools ni de registro', () => {
    for (const s of [normal, admin, null]) {
      const t = todosLosEnlaces(construirMenu(s, URL)).join(' | ') + ' | ' + ITEMS_MENU_USUARIO.map((i) => i.etiqueta + (i.a ?? '')).join(' | ').toLowerCase()
      expect(t).not.toMatch(/pool/)
      expect(t).not.toMatch(/regist|signup|crear cuenta/)
    }
  })

  it('la sección Administración existe SOLO para admin', () => {
    expect(construirMenu(normal, URL).map((g) => g.id)).not.toContain('admin')
    expect(construirMenu(null, URL).map((g) => g.id)).not.toContain('admin')
    const g = construirMenu(admin, URL).find((x) => x.id === 'admin')!
    expect(g.items.map((i) => i.a)).toEqual(['/admin/organismos', '/admin/usuarios'])
  })

  it('"Tableros" es un enlace externo y no se muestra si falta la URL (FR-015)', () => {
    const con = construirMenu(normal, URL).find((g) => g.id === 'reportes')!
    expect(con.items[0]).toEqual({ etiqueta: 'Tableros', externo: URL })
    expect(construirMenu(normal, undefined).map((g) => g.id)).not.toContain('reportes')
    expect(construirMenu(normal, '').map((g) => g.id)).not.toContain('reportes')
  })

  it('perfil y ajustes están en el menú de usuario, separados de la navegación de organismos', () => {
    expect(ITEMS_MENU_USUARIO.map((i) => i.a)).toEqual(['/perfil', '/ajustes'])
    expect(todosLosEnlaces(construirMenu(admin, URL)).join(' ')).not.toMatch(/\/perfil|\/ajustes/)
  })

  it('agrupa por uso, no es una lista plana', () => {
    expect(construirMenu(admin, URL).map((g) => g.titulo)).toEqual(['Organismos', 'Reportes', 'Administración'])
  })
})
