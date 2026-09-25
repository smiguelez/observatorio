import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as sesionApi from '@/api/sesion'
import { CLAVE_SESION } from '@/auth/useSesion'
import { esReturnToSeguro } from '@/auth/returnTo'
import { rutas } from '@/routes'
import type { Sesion } from '@/api/sesion'

afterEach(() => vi.restoreAllMocks())

function montar(ruta: string, sesion: Sesion | null | 'pendiente') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (sesion === 'pendiente') {
    vi.spyOn(sesionApi, 'obtenerSesion').mockReturnValue(new Promise(() => {})) // nunca resuelve
  } else {
    client.setQueryData(CLAVE_SESION, sesion)
  }
  // Ruta /login mínima para observar la redirección (el test de la pantalla real es de US1).
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const normal: Sesion = { usuarioId: 1, rol: 'usuario_normal', provinciaId: 3 }
const admin: Sesion = { usuarioId: 2, rol: 'admin', provinciaId: null }

describe('guardas de ruta', () => {
  it('sin sesión: redirige a /login?returnTo=<ruta> sin renderizar contenido protegido', () => {
    const router = montar('/organismos/5?x=1', null)
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.search).toBe('?returnTo=%2Forganismos%2F5%3Fx%3D1')
    expect(screen.queryByText('Organismo')).not.toBeInTheDocument()
  })

  it('sesión aún sin resolver: no muestra contenido protegido ni redirige', () => {
    const router = montar('/organismos', 'pendiente')
    expect(screen.getByRole('status', { name: 'Cargando sesión' })).toBeInTheDocument()
    expect(screen.queryByText('Mis organismos')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/organismos')
  })

  it('usuario normal en /admin/usuarios: el CONTENIDO es el MISMO que ante una ruta inexistente', () => {
    montar('/admin/usuarios', normal)
    const contenidoAdmin = screen.getByTestId('contenido').textContent
    expect(screen.getByText('Página no encontrada')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Usuarios' })).not.toBeInTheDocument()
    document.body.innerHTML = ''
    montar('/ruta-que-no-existe', normal)
    expect(screen.getByTestId('contenido').textContent).toBe(contenidoAdmin)
  })

  it('admin accede a /admin/usuarios', () => {
    montar('/admin/usuarios', admin)
    expect(screen.getByRole('heading', { name: 'Usuarios' })).toBeInTheDocument()
  })

  it.each(['/pools', '/registro', '/signup'])('%s no existe (404), ni con sesión', (ruta) => {
    montar(ruta, admin)
    expect(screen.getByText('Página no encontrada')).toBeInTheDocument()
  })
})

describe('returnTo', () => {
  it.each([
    ['/organismos', true],
    ['/organismos/3?x=1', true],
    ['https://evil.com', false],
    ['//evil.com', false],
    ['/\\evil.com', false],
    ['organismos', false],
    ['', false],
    [null, false],
  ])('%s -> %s', (valor, esperado) => {
    expect(esReturnToSeguro(valor)).toBe(esperado)
  })
})
