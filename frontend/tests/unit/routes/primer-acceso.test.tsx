import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rutas } from '@/routes'
import { MENSAJE_ACCESO_NO_VALIDO } from '@/routes/primer-acceso/PrimerAccesoPage'
import canje from '../api/fixtures/real/canje.json'
import invalido from '../api/fixtures/real/error-canje-invalido.json'
import corta from '../api/fixtures/real/error-canje-password-corta.json'

const TOKEN = 'tok-de-prueba-0123456789-abcdefghij'
const CLAVE_OK = 'clave-larga-de-prueba-1'
afterEach(() => vi.unstubAllGlobals())

type Respuesta = { status: number; cuerpo: unknown }
function stub(opciones: { canjes?: Respuesta[]; conSesion?: boolean }) {
  const canjes = [...(opciones.canjes ?? [{ status: 200, cuerpo: canje }])]
  const llamadas: { url: string; body?: string }[] = []
  let canjeado = false
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, body: init?.body as string | undefined })
      if (url === '/api/auth/session') {
        const hay = opciones.conSesion || canjeado
        return hay
          ? new Response(JSON.stringify({ usuarioId: '2396', rol: 'usuario_normal', provinciaId: 3 }), { status: 200 })
          : new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 })
      }
      if (url === '/api/acceso-inicial/canjear') {
        const r = canjes.length > 1 ? canjes.shift()! : canjes[0]!
        if (r.status === 200) canjeado = true
        return new Response(JSON.stringify(r.cuerpo), { status: r.status })
      }
      return new Response('[]', { status: 200 })
    }),
  )
  return { canjes: () => llamadas.filter((l) => l.url === '/api/acceso-inicial/canjear'), llamadas }
}

function montar(entrada: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(rutas, { initialEntries: [entrada] })
  const vista = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { client, router, u: userEvent.setup(), vista }
}
async function llenar(u: ReturnType<typeof userEvent.setup>, pass: string, conf = pass) {
  await u.type(screen.getByLabelText('Contraseña', { selector: 'input' }), pass)
  await u.type(screen.getByLabelText('Repetir contraseña'), conf)
  await u.click(screen.getByRole('button', { name: 'Guardar contraseña y entrar' }))
}

describe('pantalla pública de canje (US2)', () => {
  it('con acceso en el fragmento muestra el formulario y QUITA el fragmento de la dirección (FR-013)', async () => {
    stub({})
    const { router } = montar(`/primer-acceso#token=${TOKEN}`)
    expect(await screen.findByTestId('primer-acceso-form')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.hash).toBe(''))
    expect(router.state.location.pathname).toBe('/primer-acceso')
    // el acceso no está en ningún lugar visible del documento
    expect(document.body.innerHTML).not.toContain(TOKEN)
  })

  it('sin acceso (dirección incompleta): mensaje único, sin formulario y 0 solicitudes de canje (FR-011)', async () => {
    const red = stub({})
    montar('/primer-acceso')
    expect(await screen.findByTestId('acceso-no-valido')).toHaveTextContent(MENSAJE_ACCESO_NO_VALIDO)
    expect(screen.queryByTestId('primer-acceso-form')).not.toBeInTheDocument()
    expect(red.canjes()).toHaveLength(0)
  })

  it('política de contraseña: corta, larga y confirmación distinta => mensaje y 0 solicitudes (FR-009)', async () => {
    const red = stub({})
    const { u } = montar(`/primer-acceso#token=${TOKEN}`)
    await screen.findByTestId('primer-acceso-form')
    await llenar(u, 'corta')
    expect(await screen.findByText('Tiene que tener al menos 8 caracteres')).toBeInTheDocument()
    await u.clear(screen.getByLabelText('Contraseña', { selector: 'input' }))
    await u.clear(screen.getByLabelText('Repetir contraseña'))
    await llenar(u, 'x'.repeat(129))
    expect(await screen.findByText('No puede tener más de 128 caracteres')).toBeInTheDocument()
    await u.clear(screen.getByLabelText('Contraseña', { selector: 'input' }))
    await u.clear(screen.getByLabelText('Repetir contraseña'))
    await llenar(u, CLAVE_OK, 'otra-clave-distinta-1')
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(red.canjes()).toHaveLength(0)
  })

  it('éxito: envía { token, password } por POST, descarta el caché de una sesión anterior y va a /organismos con replace', async () => {
    const red = stub({})
    const { client, router, u } = montar(`/primer-acceso#token=${TOKEN}`)
    await screen.findByTestId('primer-acceso-form')
    client.setQueryData(['organismos'], [{ id: 1, dato: 'de-otro-usuario' }]) // lo que dejó una sesión anterior
    await llenar(u, CLAVE_OK)
    await waitFor(() => expect(router.state.location.pathname).toBe('/organismos'))
    expect(JSON.parse(red.canjes()[0]!.body!)).toEqual({ token: TOKEN, password: CLAVE_OK })
    expect(client.getQueryData(['organismos'])).not.toEqual([{ id: 1, dato: 'de-otro-usuario' }])
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('acceso usado / vencido / reemplazado / inventado: UN solo mensaje, idéntico al de "sin acceso", sin sesión', async () => {
    stub({ canjes: [{ status: 400, cuerpo: invalido }] })
    const uno = montar(`/primer-acceso#token=${TOKEN}`)
    await screen.findByTestId('primer-acceso-form')
    await llenar(uno.u, CLAVE_OK)
    const alerta = await screen.findByTestId('acceso-no-valido')
    const conRechazo = alerta.innerHTML
    expect(screen.queryByTestId('primer-acceso-form')).not.toBeInTheDocument()
    uno.vista.unmount()

    stub({})
    montar('/primer-acceso')
    const sinAcceso = (await screen.findByTestId('acceso-no-valido')).innerHTML
    expect(sinAcceso).toBe(conRechazo) // misma estructura y mismo texto: no se distingue la causa
  })

  it('400 PASSWORD_TOO_SHORT del servidor: es un error del CAMPO, no "acceso no válido", y el formulario sigue', async () => {
    stub({ canjes: [{ status: 400, cuerpo: corta }] })
    const { u } = montar(`/primer-acceso#token=${TOKEN}`)
    await screen.findByTestId('primer-acceso-form')
    await llenar(u, CLAVE_OK)
    expect(await screen.findByText(corta.error)).toBeInTheDocument()
    expect(screen.queryByTestId('acceso-no-valido')).not.toBeInTheDocument()
    expect(screen.getByTestId('primer-acceso-form')).toBeInTheDocument()
  })

  it('error de red / 5xx: mensaje transitorio, el acceso se conserva en memoria y se puede reintentar', async () => {
    const red = stub({ canjes: [{ status: 500, cuerpo: { error: 'Error interno del servidor' } }, { status: 200, cuerpo: canje }] })
    const { router, u } = montar(`/primer-acceso#token=${TOKEN}`)
    await screen.findByTestId('primer-acceso-form')
    await llenar(u, CLAVE_OK)
    expect(await screen.findByTestId('primer-acceso-error')).toBeInTheDocument()
    expect(screen.queryByTestId('acceso-no-valido')).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Guardar contraseña y entrar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/organismos'))
    expect(red.canjes()).toHaveLength(2)
    expect(JSON.parse(red.canjes()[1]!.body!).token).toBe(TOKEN) // el mismo acceso, todavía en memoria
  })

  it('con una sesión abierta avisa ANTES de enviar que continuar la reemplaza (FR-014)', async () => {
    stub({ conSesion: true })
    montar(`/primer-acceso#token=${TOKEN}`)
    expect(await screen.findByTestId('aviso-sesion-existente')).toHaveTextContent('se cierra y entrás como la persona invitada')
    expect(screen.getByTestId('primer-acceso-form')).toBeInTheDocument() // NO redirige como /login
  })

  it('ni el acceso ni la contraseña quedan en el caché de consultas ni de mutaciones, ni en el almacenamiento', async () => {
    stub({ canjes: [{ status: 500, cuerpo: { error: 'x' } }] })
    const { client, u } = montar(`/primer-acceso#token=${TOKEN}`)
    await screen.findByTestId('primer-acceso-form')
    await llenar(u, CLAVE_OK)
    await screen.findByTestId('primer-acceso-error')
    const volcado = JSON.stringify({
      consultas: client.getQueryCache().getAll().map((q) => [q.queryKey, q.state.data]),
      mutaciones: client.getMutationCache().getAll().map((m) => [m.state.variables, m.state.data]),
      local: { ...localStorage },
      sesion: { ...sessionStorage },
    })
    expect(volcado).not.toContain(TOKEN)
    expect(volcado).not.toContain(CLAVE_OK)
    expect(client.getMutationCache().getAll()).toHaveLength(0)
    expect(screen.getByLabelText('Contraseña', { selector: 'input' })).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Repetir contraseña')).toHaveAttribute('autocomplete', 'new-password')
  })
})
