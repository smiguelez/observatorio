import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLAVE_SESION } from '@/auth/useSesion'
import type { Sesion } from '@/api/sesion'
import { rutas } from '@/routes'

afterEach(() => vi.unstubAllGlobals())

function montar(ruta: string, sesion: Sesion | null) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) =>
    url === '/api/auth/session' ? new Response('{}', { status: 401 }) : new Response('[]', { status: 200 })))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(CLAVE_SESION, sesion)
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}
const normal: Sesion = { usuarioId: 1, rol: 'usuario_normal', provinciaId: 3 }

describe('rutas públicas (008)', () => {
  it('/primer-acceso se abre SIN sesión, sin redirigir a /login y sin el layout de la app', async () => {
    const router = montar('/primer-acceso#token=abc', null)
    expect(await screen.findByTestId('primer-acceso-form')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/primer-acceso')
    expect(document.querySelector('[data-slot="sidebar-content"]')).toBeNull() // fuera de AppLayout
  })

  it.each(['/registro', '/signup', '/pools'])('%s sigue sin existir: con sesión "no encontrado"', async (ruta) => {
    montar(ruta, normal)
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })

  it.each(['/registro', '/signup', '/pools'])('%s sin sesión lleva al login (las pantallas de error NO son públicas)', async (ruta) => {
    const router = montar(ruta, null)
    await screen.findByRole('heading', { name: 'Observatorio de Oficinas Judiciales' })
    expect(router.state.location.pathname).toBe('/login')
  })

  it('el login NO enlaza a /primer-acceso (solo se llega por el enlace de un administrador; FR-015)', async () => {
    montar('/login', null)
    await screen.findByRole('heading', { name: 'Observatorio de Oficinas Judiciales' })
    const hrefs = screen.queryAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs.some((h) => h?.includes('primer-acceso'))).toBe(false)
  })
})
