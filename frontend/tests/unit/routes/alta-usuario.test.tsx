import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AltaUsuarioDialog from '@/routes/admin/AltaUsuarioDialog'
import alta from '../api/fixtures/real/usuario-alta.json'
import altaAdmin from '../api/fixtures/real/usuario-alta-admin.json'
import duplicado from '../api/fixtures/real/error-alta-duplicado.json'

const TOKEN_REAL_FORMA = 'tok-super-secreto-de-prueba-0123456789'
afterEach(() => vi.unstubAllGlobals())

interface Llamada { url: string; init?: RequestInit }
// 010 (US2): `respuestaEnvio` es opcional — los tests de alta que no la tocan no llaman nunca a
// `/acceso-inicial/enviar-email`, así que no hace falta configurarla para ellos.
function stub(respuestaAlta: { status: number; cuerpo: unknown }, respuestaEnvio?: { status: number; cuerpo: unknown }) {
  const llamadas: Llamada[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init })
      if (url === '/api/provincias') return new Response(JSON.stringify([{ id: 3, nombre: 'Buenos Aires' }, { id: 6, nombre: 'Córdoba' }]), { status: 200 })
      if (url === '/api/usuarios' && init?.method === 'POST') return new Response(JSON.stringify(respuestaAlta.cuerpo), { status: respuestaAlta.status })
      if (url.endsWith('/acceso-inicial/enviar-email') && init?.method === 'POST' && respuestaEnvio) {
        return new Response(JSON.stringify(respuestaEnvio.cuerpo), { status: respuestaEnvio.status })
      }
      return new Response('[]', { status: 200 })
    }),
  )
  return {
    altas: () => llamadas.filter((l) => l.url === '/api/usuarios' && l.init?.method === 'POST'),
    envios: () => llamadas.filter((l) => l.url.endsWith('/acceso-inicial/enviar-email')),
  }
}

function Envoltorio() {
  const [abierto, setAbierto] = useState(true)
  return <AltaUsuarioDialog abierto={abierto} alCambiar={setAbierto} />
}
function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Envoltorio />
    </QueryClientProvider>,
  )
  return { client, u: userEvent.setup() }
}
const conToken = <T extends { accesoInicial: { token: string; vence: string } }>(o: T): T => ({ ...o, accesoInicial: { ...o.accesoInicial, token: TOKEN_REAL_FORMA } })

async function elegirProvincia(u: ReturnType<typeof userEvent.setup>, nombre: string) {
  await u.click(screen.getByRole('combobox', { name: /Provincia/ }))
  await u.click(await screen.findByRole('option', { name: nombre }))
}

describe('alta administrada (US1)', () => {
  it('usuario normal SIN provincia: mensaje claro y 0 solicitudes (FR-001)', async () => {
    const red = stub({ status: 201, cuerpo: conToken(alta) })
    const { u } = montar()
    await u.type(screen.getByLabelText('Email'), 'persona@ejemplo.test')
    await u.click(screen.getByRole('button', { name: 'Dar de alta' }))
    expect(await screen.findByText('La provincia es obligatoria para un usuario normal')).toBeInTheDocument()
    expect(red.altas()).toHaveLength(0)
  })

  it('email inválido: mensaje y 0 solicitudes', async () => {
    const red = stub({ status: 201, cuerpo: conToken(alta) })
    const { u } = montar()
    await u.type(screen.getByLabelText('Email'), 'no-es-email')
    await elegirProvincia(u, 'Buenos Aires')
    await u.click(screen.getByRole('button', { name: 'Dar de alta' }))
    expect(await screen.findByText('Ingresá un email válido')).toBeInTheDocument()
    expect(red.altas()).toHaveLength(0)
  })

  it('un administrador puede darse de alta SIN provincia: no se envía el campo y se muestra el enlace, el vencimiento y el aviso de un solo uso', async () => {
    const red = stub({ status: 201, cuerpo: conToken(altaAdmin) })
    const { u } = montar()
    await u.type(screen.getByLabelText('Email'), 'admin@ejemplo.test')
    await u.click(screen.getByLabelText('Administrador'))
    await u.click(screen.getByRole('button', { name: 'Dar de alta' }))
    const enlace = (await screen.findByTestId('enlace-acceso')) as HTMLInputElement
    expect(JSON.parse(red.altas()[0]!.init!.body as string)).toEqual({ email: 'admin@ejemplo.test', rol: 'admin' })
    expect(enlace.value).toBe(`${window.location.origin}/primer-acceso#token=${TOKEN_REAL_FORMA}`)
    expect(screen.getByTestId('vence-acceso')).toHaveTextContent('Vence el')
    expect(screen.getByTestId('aviso-un-solo-uso')).toHaveTextContent('no volverá a mostrarse')
  })

  it('cerrar SIN copiar pide confirmación; tras cerrar el enlace no está en pantalla ni en el caché de mutaciones (FR-003)', async () => {
    stub({ status: 201, cuerpo: conToken(alta) })
    const { client, u } = montar()
    await u.type(screen.getByLabelText('Email'), 'persona@ejemplo.test')
    await elegirProvincia(u, 'Buenos Aires')
    await u.click(screen.getByRole('button', { name: 'Dar de alta' }))
    await screen.findByTestId('enlace-acceso')

    await u.click(screen.getByTestId('cerrar-acceso'))
    const confirmacion = await screen.findByTestId('confirmar-cierre-acceso')
    expect(confirmacion).toHaveTextContent('No vas a poder verlo de nuevo')
    await u.click(within(confirmacion).getByRole('button', { name: 'Volver' }))
    expect(screen.getByTestId('enlace-acceso')).toBeInTheDocument() // "Volver" no lo cierra

    await u.click(screen.getByTestId('cerrar-acceso'))
    await u.click(within(await screen.findByTestId('confirmar-cierre-acceso')).getByRole('button', { name: 'Cerrar igual' }))
    await waitFor(() => expect(screen.queryByTestId('enlace-acceso')).not.toBeInTheDocument())
    expect(document.body.textContent).not.toContain(TOKEN_REAL_FORMA)
    // Ni el resultado ni las variables de la mutación quedan en el caché.
    expect(client.getMutationCache().getAll()).toHaveLength(0)
    expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(TOKEN_REAL_FORMA)
  })

  it('copiar evita la confirmación al cerrar y deja el enlace completo en el portapapeles', async () => {
    stub({ status: 201, cuerpo: conToken(alta) })
    const { u } = montar()
    await u.type(screen.getByLabelText('Email'), 'persona@ejemplo.test')
    await elegirProvincia(u, 'Córdoba')
    await u.click(screen.getByRole('button', { name: 'Dar de alta' }))
    await screen.findByTestId('enlace-acceso')
    await u.click(screen.getByTestId('copiar-enlace'))
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/primer-acceso#token=${TOKEN_REAL_FORMA}`)
    await u.click(screen.getByTestId('cerrar-acceso'))
    await waitFor(() => expect(screen.queryByTestId('enlace-acceso')).not.toBeInTheDocument())
    expect(screen.queryByTestId('confirmar-cierre-acceso')).not.toBeInTheDocument()
  })

  it('enviar por email exitoso: aviso de éxito, y "Copiar enlace" sigue funcionando después (US2)', async () => {
    const red = stub({ status: 201, cuerpo: conToken(alta) }, { status: 200, cuerpo: { emailEnviado: true } })
    const { u } = montar()
    await u.type(screen.getByLabelText('Email'), 'persona@ejemplo.test')
    await elegirProvincia(u, 'Buenos Aires')
    await u.click(screen.getByRole('button', { name: 'Dar de alta' }))
    await screen.findByTestId('enlace-acceso')

    await u.click(screen.getByTestId('enviar-por-email'))
    expect(await screen.findByTestId('email-enviado')).toHaveTextContent('Enviado por email')
    expect(red.envios()).toHaveLength(1)
    expect(red.envios()[0]!.url).toBe(`/api/usuarios/${alta.id}/acceso-inicial/enviar-email`)

    // El enlace sigue disponible: copiar sigue andando después de un envío exitoso.
    await u.click(screen.getByTestId('copiar-enlace'))
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/primer-acceso#token=${TOKEN_REAL_FORMA}`)
  })

  it('enviar por email fallido: aviso de fallo, el enlace no se pierde y "Copiar enlace" sigue funcionando (FR-007)', async () => {
    stub({ status: 201, cuerpo: conToken(alta) }, { status: 200, cuerpo: { emailEnviado: false } })
    const { u } = montar()
    await u.type(screen.getByLabelText('Email'), 'persona@ejemplo.test')
    await elegirProvincia(u, 'Córdoba')
    await u.click(screen.getByRole('button', { name: 'Dar de alta' }))
    await screen.findByTestId('enlace-acceso')

    await u.click(screen.getByTestId('enviar-por-email'))
    expect(await screen.findByTestId('email-no-enviado')).toHaveTextContent('El enlace sigue disponible')
    // El enlace del input no cambió: sigue siendo el mismo ya generado.
    expect((screen.getByTestId('enlace-acceso') as HTMLInputElement).value).toBe(`${window.location.origin}/primer-acceso#token=${TOKEN_REAL_FORMA}`)

    await u.click(screen.getByTestId('copiar-enlace'))
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/primer-acceso#token=${TOKEN_REAL_FORMA}`)
  })

  it('email ya dado de alta: se muestra el mensaje del servidor y NO se da el alta por hecha (FR-006)', async () => {
    stub({ status: 400, cuerpo: duplicado })
    const { u } = montar()
    await u.type(screen.getByLabelText('Email'), 'persona@ejemplo.test')
    await elegirProvincia(u, 'Buenos Aires')
    await u.click(screen.getByRole('button', { name: 'Dar de alta' }))
    expect(await screen.findByTestId('alta-error')).toHaveTextContent('Ese email ya está dado de alta.')
    expect(screen.queryByTestId('enlace-acceso')).not.toBeInTheDocument()
    expect(screen.getByTestId('alta-usuario-dialog')).toBeInTheDocument() // el formulario sigue abierto para corregir
  })
})
