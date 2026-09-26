import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLAVE_SESION } from '@/auth/useSesion'
import type { Sesion } from '@/api/sesion'
import { rutas } from '@/routes'

vi.mock('@/api/auth-client', () => ({
  authClient: { changePassword: vi.fn(), listAccounts: vi.fn().mockResolvedValue({ data: [{ providerId: 'credential' }] }) },
}))
afterEach(() => vi.unstubAllGlobals())

function stub(provinciaId: number | null, patch?: { status: number; cuerpo: unknown }) {
  const llamadas: { metodo: string; url: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET'
      llamadas.push({ metodo, url, body: init?.body ? JSON.parse(init.body as string) : undefined })
      if (url === '/api/provincias') return new Response(JSON.stringify([{ id: 3, nombre: 'Buenos Aires' }, { id: 6, nombre: 'Córdoba' }]), { status: 200 })
      if (url === '/api/usuarios/7' && metodo === 'GET') {
        return new Response(JSON.stringify({ id: '7', email: 'yo@ejemplo.test', nombre_display: 'Yo', email_verificado: true, foto_url: null, provincia_id: provinciaId, roles: ['usuario_normal'] }), { status: 200 })
      }
      if (url === '/api/usuarios/7' && metodo === 'PATCH') {
        const r = patch ?? { status: 200, cuerpo: { id: '7', email: 'yo@ejemplo.test', nombre_display: 'Nuevo', provincia_id: provinciaId, foto_url: null } }
        return new Response(JSON.stringify(r.cuerpo), { status: r.status })
      }
      return new Response('[]', { status: 200 })
    }),
  )
  return { patches: () => llamadas.filter((l) => l.metodo === 'PATCH') }
}

function montar(ruta: string, sesion: Sesion) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(CLAVE_SESION, sesion)
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return userEvent.setup()
}
const normal = (provinciaId: number | null): Sesion => ({ usuarioId: 7, rol: 'usuario_normal', provinciaId })
const admin: Sesion = { usuarioId: 7, rol: 'admin', provinciaId: 3 }

describe('perfil: la provincia la asigna un administrador (US4)', () => {
  it('usuario normal: la provincia es TEXTO (sin selector), con la nota "La asigna un administrador"', async () => {
    stub(3)
    montar('/perfil', normal(3))
    expect(await screen.findByTestId('provincia-valor')).toHaveTextContent('Buenos Aires')
    expect(screen.getByTestId('provincia-solo-lectura')).toHaveTextContent('La asigna un administrador.')
    expect(screen.queryByRole('combobox', { name: 'Provincia' })).not.toBeInTheDocument()
  })

  it('usuario normal: guardar el nombre envía un PATCH SIN provinciaId (ni siquiera la actual)', async () => {
    const red = stub(3)
    const u = montar('/perfil', normal(3))
    const nombre = await screen.findByLabelText('Nombre')
    await u.clear(nombre)
    await u.type(nombre, 'Nuevo')
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(red.patches()).toHaveLength(1))
    expect(red.patches()[0]!.body).toEqual({ nombreDisplay: 'Nuevo', fotoUrl: '' })
    expect(await screen.findByTestId('mensaje-perfil')).toHaveTextContent('Cambios guardados.')
  })

  it('administrador: el selector de provincia sigue editable y se envía', async () => {
    const red = stub(3)
    const u = montar('/perfil', admin)
    await u.click(await screen.findByRole('combobox', { name: 'Provincia' }))
    await u.click(await screen.findByRole('option', { name: 'Córdoba' }))
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(red.patches()).toHaveLength(1))
    expect(red.patches()[0]!.body).toMatchObject({ provinciaId: 6 })
    expect(screen.queryByTestId('provincia-solo-lectura')).not.toBeInTheDocument()
  })

  it('un 403 por provincia (defensa) muestra el mensaje del servidor', async () => {
    stub(3, { status: 403, cuerpo: { error: 'La provincia de un usuario solo la puede asignar un administrador.' } })
    const u = montar('/perfil', normal(3))
    await u.click(await screen.findByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByTestId('mensaje-perfil')).toHaveTextContent('La provincia de un usuario solo la puede asignar un administrador.')
  })

  it('usuario normal sin provincia: el perfil dice "Sin provincia asignada"', async () => {
    stub(null)
    montar('/perfil', normal(null))
    expect(await screen.findByTestId('provincia-valor')).toHaveTextContent('Sin provincia asignada')
  })
})

describe('alta de organismo sin provincia (US4)', () => {
  it('usuario normal sin provincia: "Pedile a un administrador…", SIN enlace al perfil y sin formulario', async () => {
    stub(null)
    montar('/organismos/nuevo', normal(null))
    const aviso = await screen.findByTestId('alta-sin-provincia')
    expect(aviso).toHaveTextContent('Pedile a un administrador que te asigne una provincia.')
    expect(aviso).not.toHaveTextContent('completar tu provincia')
    expect(aviso.querySelector('a')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Crear organismo' })).not.toBeInTheDocument()
  })

  it('con provincia asignada el formulario aparece (y la provincia viene de la sesión)', async () => {
    stub(3)
    montar('/organismos/nuevo', normal(3))
    expect(await screen.findByRole('button', { name: 'Crear organismo' })).toBeInTheDocument()
    expect(screen.queryByTestId('alta-sin-provincia')).not.toBeInTheDocument()
  })
})
