import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLAVE_SESION } from '@/auth/useSesion'
import { rutas } from '@/routes'
import { MENSAJE_LOGIN_FALLIDO } from '@/routes/login/mensajes'

const signInEmail = vi.fn()
vi.mock('@/api/auth-client', () => ({
  authClient: {
    signIn: { email: (...a: unknown[]) => signInEmail(...a), magicLink: vi.fn(), social: vi.fn() },
  },
}))

function montarLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(CLAVE_SESION, null)
  const router = createMemoryRouter(rutas, { initialEntries: ['/login'] })
  const { container } = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { container }
}

async function intentar(email = 'a@b.co', password = 'x') {
  const u = userEvent.setup()
  await u.type(screen.getByLabelText('Email', { selector: 'input' }), email)
  await u.type(screen.getByLabelText('Contraseña', { selector: 'input' }), password)
  await u.click(screen.getByRole('button', { name: 'Ingresar' }))
  return (await screen.findByTestId('login-error')).textContent
}

// Con llaves: vitest trata un valor de retorno función de beforeEach como cleanup (y mockReset() devuelve el mock).
beforeEach(() => {
  signInEmail.mockReset()
})

describe('login por contraseña — mensaje único (FR-002, SC-008)', () => {
  // Causas de fallo con respuestas distintas del servidor: NINGUNA puede notarse en pantalla.
  const causas: [string, unknown][] = [
    ['contraseña incorrecta', { error: { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' } }],
    ['cuenta inexistente', { error: { status: 401, code: 'USER_NOT_FOUND', message: 'User not found' } }],
    ['credencial invalidada', { error: { status: 401, code: 'CREDENTIAL_ACCOUNT_NOT_FOUND', message: 'Credential account not found' } }],
    ['rechazo de alta no provisionada (D14)', { error: { status: 403, code: 'UNPROVISIONED', message: 'Email no provisionado' } }],
    ['error del servidor', { error: { status: 500, code: 'INTERNAL', message: 'boom' } }],
  ]

  it.each(causas)('%s => mismo mensaje genérico', async (_causa, respuesta) => {
    signInEmail.mockResolvedValue(respuesta)
    montarLogin()
    const texto = await intentar()
    expect(texto).toContain(MENSAJE_LOGIN_FALLIDO)
    expect(texto).not.toMatch(/inexistente|no existe|invalid|revoc|invalidad|provision|boom/i)
  })

  it('una excepción de red también muestra el mismo mensaje', async () => {
    signInEmail.mockImplementation(async () => {
      throw new TypeError('Failed to fetch')
    })
    montarLogin()
    expect(await intentar()).toContain(MENSAJE_LOGIN_FALLIDO)
  })

  it('el texto renderizado es idéntico para todas las causas', async () => {
    const textos: (string | null)[] = []
    for (const [, respuesta] of causas) {
      signInEmail.mockResolvedValue(respuesta)
      const { container } = montarLogin()
      textos.push(await intentar())
      container.remove()
      document.body.innerHTML = ''
    }
    expect(new Set(textos).size).toBe(1)
  })

  it('no hay ningún enlace ni botón de registro', () => {
    montarLogin()
    expect(screen.queryByRole('link', { name: /regist|crear cuenta|sign ?up/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /regist|crear cuenta|sign ?up/i })).not.toBeInTheDocument()
  })

  it('validación local: email inválido no llama al backend', async () => {
    montarLogin()
    const u = userEvent.setup()
    await u.type(screen.getByLabelText('Email', { selector: 'input' }), 'no-es-email')
    await u.type(screen.getByLabelText('Contraseña', { selector: 'input' }), 'x')
    await u.click(screen.getByRole('button', { name: 'Ingresar' }))
    await waitFor(() => expect(screen.getByText('Ingresá un email válido')).toBeInTheDocument())
    expect(signInEmail).not.toHaveBeenCalled()
  })
})
