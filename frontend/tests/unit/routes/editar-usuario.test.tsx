import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EditarUsuarioDialog from '@/routes/admin/EditarUsuarioDialog'
import rolFixture from '../api/fixtures/real/rol.json'

afterEach(() => vi.unstubAllGlobals())

interface Estado { roles: string[]; provinciaId: number | null }
interface Opciones {
  usuario?: Estado
  sesionId?: number
  put?: { status: number; cuerpo: unknown }
  patch?: { status: number; cuerpo: unknown }
}

function stub(o: Opciones = {}) {
  const estado: Estado = { ...(o.usuario ?? { roles: ['usuario_normal'], provinciaId: 3 }) }
  const llamadas: { metodo: string; url: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET'
      llamadas.push({ metodo, url, body: init?.body ? JSON.parse(init.body as string) : undefined })
      if (url === '/api/provincias') return new Response(JSON.stringify([{ id: 3, nombre: 'Buenos Aires' }, { id: 6, nombre: 'Córdoba' }, { id: 9, nombre: 'Mendoza' }]), { status: 200 })
      if (url === '/api/auth/session') return new Response(JSON.stringify({ usuarioId: String(o.sesionId ?? 1), rol: 'admin', provinciaId: null }), { status: 200 })
      if (url === '/api/usuarios' && metodo === 'GET') return new Response(JSON.stringify([{ id: '5', email: 'persona@ejemplo.test', nombre_display: null, provincia_id: estado.provinciaId, roles: estado.roles }]), { status: 200 })
      if (url === '/api/usuarios/5/rol' && metodo === 'PUT') {
        const r = o.put ?? { status: 200, cuerpo: rolFixture }
        if (r.status === 200) estado.roles = (llamadas.at(-1)!.body as { rol: string }).rol === 'admin' ? ['usuario_normal', 'admin'] : ['usuario_normal']
        return new Response(JSON.stringify(r.status === 200 ? { id: '5', roles: estado.roles } : r.cuerpo), { status: r.status })
      }
      if (url === '/api/usuarios/5' && metodo === 'PATCH') {
        const r = o.patch ?? { status: 200, cuerpo: {} }
        if (r.status === 200) estado.provinciaId = (llamadas.at(-1)!.body as { provinciaId: number }).provinciaId
        return new Response(JSON.stringify(r.status === 200 ? { id: '5', email: 'persona@ejemplo.test', nombre_display: null, provincia_id: estado.provinciaId, foto_url: null } : r.cuerpo), { status: r.status })
      }
      return new Response('[]', { status: 200 })
    }),
  )
  return { llamadas, puts: () => llamadas.filter((l) => l.metodo === 'PUT'), patches: () => llamadas.filter((l) => l.metodo === 'PATCH') }
}

function montar(usuarioId = 5) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/', element: <EditarUsuarioDialog usuarioId={usuarioId} alCerrar={() => {}} /> },
      { path: '/organismos', element: <p data-testid="pantalla-organismos">organismos</p> },
    ],
    { initialEntries: ['/'] },
  )
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { router, u: userEvent.setup() }
}

describe('edición de rol y provincia (US3)', () => {
  it('otorgar el rol admin NO pide confirmación: una sola solicitud PUT y la fila muestra el rol nuevo', async () => {
    const red = stub()
    const { u } = montar()
    expect(await screen.findByTestId('rol-actual')).toHaveTextContent('Usuario normal')
    await u.click(screen.getByTestId('boton-cambiar-rol'))
    await waitFor(() => expect(screen.getByTestId('rol-actual')).toHaveTextContent('Administrador'))
    expect(red.puts()).toEqual([{ metodo: 'PUT', url: '/api/usuarios/5/rol', body: { rol: 'admin' } }])
    expect(screen.queryByTestId('confirmar-quitar-admin')).not.toBeInTheDocument()
    expect(red.patches()).toHaveLength(0) // cada sección envía UNA solicitud: rol no toca provincia
  })

  it('quitar el rol admin PIDE confirmación antes de enviar; cancelar no envía nada', async () => {
    const red = stub({ usuario: { roles: ['usuario_normal', 'admin'], provinciaId: 3 } })
    const { u } = montar()
    await screen.findByText('Administrador')
    await u.click(screen.getByTestId('boton-cambiar-rol'))
    const conf = await screen.findByTestId('confirmar-quitar-admin')
    expect(red.puts()).toHaveLength(0)
    await u.click(within(conf).getByRole('button', { name: 'Cancelar' }))
    expect(red.puts()).toHaveLength(0)
    await u.click(screen.getByTestId('boton-cambiar-rol'))
    await u.click(within(await screen.findByTestId('confirmar-quitar-admin')).getByTestId('confirmar-quitar'))
    await waitFor(() => expect(screen.getByTestId('rol-actual')).toHaveTextContent('Usuario normal'))
    expect(red.puts()).toEqual([{ metodo: 'PUT', url: '/api/usuarios/5/rol', body: { rol: 'usuario_normal' } }])
  })

  it('el último administrador: el 400 del servidor se muestra tal cual y el rol mostrado sigue siendo el REAL (sin estado optimista)', async () => {
    stub({ usuario: { roles: ['usuario_normal', 'admin'], provinciaId: 3 }, put: { status: 400, cuerpo: { error: 'El sistema no puede quedarse sin administradores.' } } })
    const { u } = montar()
    await screen.findByText('Administrador')
    await u.click(screen.getByTestId('boton-cambiar-rol'))
    await u.click(within(await screen.findByTestId('confirmar-quitar-admin')).getByTestId('confirmar-quitar'))
    expect(await screen.findByTestId('error-rol')).toHaveTextContent('El sistema no puede quedarse sin administradores.')
    expect(screen.getByTestId('rol-actual')).toHaveTextContent('Administrador')
  })

  it('un 403 y un 404 del servidor también se muestran con su mensaje', async () => {
    stub({ put: { status: 403, cuerpo: { error: 'Solo un administrador puede cambiar el rol de un usuario.' } } })
    const { u } = montar()
    await u.click(await screen.findByTestId('boton-cambiar-rol'))
    expect(await screen.findByTestId('error-rol')).toHaveTextContent('Solo un administrador puede cambiar el rol de un usuario.')
  })

  it('provincia: el selector NO ofrece "sin provincia"; guardar envía UNA solicitud PATCH { provinciaId } y no toca el rol', async () => {
    const red = stub()
    const { u } = montar()
    await screen.findByTestId('rol-actual')
    await u.click(screen.getByRole('combobox', { name: /Provincia del usuario/ }))
    const opciones = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(opciones).toEqual(['Buenos Aires', 'Córdoba', 'Mendoza']) // solo el catálogo, sin opción vacía
    await u.click(screen.getByRole('option', { name: 'Córdoba' }))
    await u.click(screen.getByTestId('provincia-guardar'))
    expect(await screen.findByTestId('provincia-ok')).toBeInTheDocument()
    expect(red.patches()).toEqual([{ metodo: 'PATCH', url: '/api/usuarios/5', body: { provinciaId: 6 } }])
    expect(red.puts()).toHaveLength(0)
  })

  it('"Guardar provincia" está deshabilitado mientras no cambie la provincia; un rechazo se muestra y no cambia nada', async () => {
    stub({ patch: { status: 400, cuerpo: { error: 'La provincia indicada no existe.' } } })
    const { u } = montar()
    await screen.findByTestId('rol-actual')
    expect(screen.getByTestId('provincia-guardar')).toBeDisabled()
    await u.click(screen.getByRole('combobox', { name: /Provincia del usuario/ }))
    await u.click(await screen.findByRole('option', { name: 'Mendoza' }))
    await u.click(screen.getByTestId('provincia-guardar'))
    expect(await screen.findByTestId('error-provincia')).toHaveTextContent('La provincia indicada no existe.')
  })

  it('tras un éxito se re-consultan la lista de usuarios y la sesión (FR-019, FR-021)', async () => {
    const red = stub()
    const { u } = montar()
    await u.click(await screen.findByTestId('boton-cambiar-rol'))
    await waitFor(() => expect(red.llamadas.filter((l) => l.url === '/api/usuarios' && l.metodo === 'GET').length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(red.llamadas.filter((l) => l.url === '/api/auth/session').length).toBeGreaterThanOrEqual(2))
  })

  it('un admin que SE quita el rol a sí mismo: tras el éxito va a /organismos (FR-020)', async () => {
    stub({ usuario: { roles: ['usuario_normal', 'admin'], provinciaId: 3 }, sesionId: 5 })
    const { router, u } = montar(5)
    await screen.findByText('Administrador')
    await u.click(screen.getByTestId('boton-cambiar-rol'))
    expect(await screen.findByTestId('confirmar-quitar-admin')).toHaveTextContent('Sos vos')
    await u.click(within(screen.getByTestId('confirmar-quitar-admin')).getByTestId('confirmar-quitar'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/organismos'))
  })
})
