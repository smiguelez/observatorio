// T003 (011, US1): DatosTab — el control de fueros nuevo (casillas + guardado), sin tocar el
// resto de la pestaña. Monta a través del router real (mismo patrón que perfil-provincia.test.tsx).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sesion } from '@/api/sesion'
import { CLAVE_SESION } from '@/auth/useSesion'
import { rutas } from '@/routes'
import organismo from '../api/fixtures/real/organismo-detalle.json'

afterEach(() => vi.unstubAllGlobals())

const FUEROS = [
  { id: 1, nombre: 'penal' },
  { id: 2, nombre: 'civil' },
]
const SESION: Sesion = { usuarioId: 1274, rol: 'usuario_normal', provinciaId: 1 }

interface Llamada { metodo: string; url: string; body?: unknown }

function stub(fueroInicial: { fueros: { id: number; nombre: string }[]; fueroSimplificado: string | null }, respuestaPut?: { status: number; cuerpo: unknown }) {
  const llamadas: Llamada[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET'
      llamadas.push({ metodo, url, body: init?.body ? JSON.parse(init.body as string) : undefined })
      if (url === `/api/organismos/${organismo.id}` && (metodo === 'GET' || metodo === 'PATCH')) return new Response(JSON.stringify(organismo), { status: 200 })
      if (url === '/api/fueros') return new Response(JSON.stringify(FUEROS), { status: 200 })
      if (url === `/api/organismos/${organismo.id}/fuero` && metodo === 'GET') return new Response(JSON.stringify(fueroInicial), { status: 200 })
      if (url === `/api/organismos/${organismo.id}/fuero` && metodo === 'PUT') {
        const r = respuestaPut ?? { status: 200, cuerpo: { fueros: FUEROS.filter((f) => (init?.body ? JSON.parse(init.body as string).fueroIds.includes(f.id) : false)), fueroSimplificado: null } }
        return new Response(JSON.stringify(r.cuerpo), { status: r.status })
      }
      return new Response('[]', { status: 200 }) // provincias/denominaciones-simplificadas/tipos-oficina/menú
    }),
  )
  return { puts: () => llamadas.filter((l) => l.url === `/api/organismos/${organismo.id}/fuero` && l.metodo === 'PUT') }
}

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  client.setQueryData(CLAVE_SESION, SESION)
  const router = createMemoryRouter(rutas, { initialEntries: [`/organismos/${organismo.id}`] })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return userEvent.setup()
}

describe('DatosTab — fueros (011, US1)', () => {
  it('muestra los fueros actuales ya marcados, y el resumen', async () => {
    stub({ fueros: [FUEROS[0]!], fueroSimplificado: 'penal' })
    montar()
    const casillas = await screen.findByTestId('fuero-casillas')
    expect(await screen.findByRole('checkbox', { name: 'penal' })).toBeChecked()
    expect(within(casillas).getByRole('checkbox', { name: 'civil' })).not.toBeChecked()
    expect(screen.getByTestId('fuero-resumen')).toHaveTextContent('penal')
  })

  it('marcar un segundo fuero y guardar: el PUT lleva los dos ids, y el resumen recalculado se ve', async () => {
    const red = stub({ fueros: [FUEROS[0]!], fueroSimplificado: 'penal' }, { status: 200, cuerpo: { fueros: FUEROS, fueroSimplificado: 'multifuero' } })
    const u = montar()
    await screen.findByTestId('fuero-casillas')
    await u.click(screen.getByRole('checkbox', { name: 'civil' }))
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(red.puts()).toHaveLength(1))
    expect(red.puts()[0]!.body).toEqual({ fueroIds: [1, 2] })
    expect(await screen.findByTestId('fuero-resumen')).toHaveTextContent('multifuero')
  })

  it('un fallo del PUT de fueros (FR-004) se muestra como mensaje de error, sin romper la pestaña', async () => {
    stub(
      { fueros: [FUEROS[0]!], fueroSimplificado: 'penal' },
      { status: 400, cuerpo: { error: 'No se puede quitar el fuero «penal»: una unidad funcional de este organismo ya tiene una asignación de jueces acotada a ese fuero.', fuerosEnUso: [FUEROS[0]] } },
    )
    const u = montar()
    await screen.findByTestId('fuero-casillas')
    await u.click(screen.getByRole('checkbox', { name: 'penal' })) // lo desmarca
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByTestId('mensaje-datos')).toHaveTextContent('ya tiene una asignación de jueces acotada')
  })
})
