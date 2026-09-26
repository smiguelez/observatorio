import { MutationObserver, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import { crearQueryClient } from '@/api/queryClient'
import AppLayout from '@/components/layout/AppLayout'
import { CLAVE_SESION } from '@/auth/useSesion'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(sesion: object) {
  const llamadas: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      llamadas.push(url)
      const cuerpo = url === '/api/auth/session' ? sesion : []
      return new Response(JSON.stringify(cuerpo), { status: 200 })
    }),
  )
  return llamadas
}

describe('sesión fresca (FR-021, SC-007)', () => {
  it('al cambiar de pantalla se vuelve a pedir la sesión, sin desmontar la pantalla', async () => {
    const llamadas = stubFetch({ usuarioId: '1', rol: 'usuario_normal', provinciaId: 3 })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter(
      [
        {
          element: <AppLayout />,
          children: [
            { path: '/a', element: <Link to="/b">ir a b</Link> },
            { path: '/b', element: <p data-testid="pantalla-b">pantalla b</p> },
          ],
        },
      ],
      { initialEntries: ['/a'] },
    )
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    await screen.findByText('ir a b')
    await waitFor(() => expect(llamadas.filter((u) => u === '/api/auth/session').length).toBeGreaterThanOrEqual(1))
    const antes = llamadas.filter((u) => u === '/api/auth/session').length

    // El admin cambia el rol del usuario; en la siguiente pantalla debe regir sin re-login.
    stubFetch({ usuarioId: '1', rol: 'admin', provinciaId: 3 })
    await userEvent.setup().click(screen.getByText('ir a b'))
    await screen.findByTestId('pantalla-b')
    await waitFor(() => expect(client.getQueryData(CLAVE_SESION)).toMatchObject({ rol: 'admin' }))
    expect(antes).toBeGreaterThanOrEqual(1)
  })

  it('un 403 de una MUTACIÓN invalida la sesión; un 403 de una consulta o un 400 no', async () => {
    const client = crearQueryClient()
    const invalidar = vi.spyOn(client, 'invalidateQueries')
    const mutar = (status: number) =>
      new MutationObserver(client, {
        mutationFn: async () => {
          throw new ApiError(status, 'x')
        },
      })
        .mutate()
        .catch(() => undefined)

    await mutar(400)
    expect(invalidar).not.toHaveBeenCalled()
    await mutar(403)
    expect(invalidar).toHaveBeenCalledWith({ queryKey: CLAVE_SESION })
  })
})
