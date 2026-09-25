import { expect, request, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import {
  CLAVE, contarFixtures, crearUsuarioConClave, limpiarFixtures, pedirMagicLink, PREFIJO, ultimoMagicLink,
} from './helpers/backend'

const OK = `${PREFIJO}login@example.test`
const REVOCADO = `${PREFIJO}revocada@example.test`
const ENLACE = `${PREFIJO}enlace@example.test`
const INEXISTENTE = `${PREFIJO}no-existe@example.test`
const MENSAJE = 'Email o contraseña incorrectos.'
const evidencia: Record<string, unknown> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(OK)
  // Credencial invalidada por el backend: alta con contraseña SIN verificar el email, y luego
  // verificación del email por magic link => Better Auth borra la credencial (revokeUnprovenAccountAccess).
  await crearUsuarioConClave(REVOCADO)
  const link = await pedirMagicLink(REVOCADO)
  // Vite escucha en ::1; el fetch de Node resolvería 127.0.0.1. El contexto de Playwright resuelve bien `localhost`.
  const ctx = await request.newContext()
  await ctx.get(link, { maxRedirects: 0 })
  await ctx.dispose()
})

test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = contarFixtures()
  writeFileSync(process.env.LOGIN_EVIDENCIA ?? 'test-results/login-evidencia.json', JSON.stringify(evidencia, null, 2))
})

async function intentarContrasena(page: Page, email: string, password: string) {
  const respuestas: { status: number; cuerpo: string }[] = []
  const alResponder = async (r: import('@playwright/test').Response) => {
    if (r.url().includes('/api/auth/sign-in/email')) respuestas.push({ status: r.status(), cuerpo: await r.text() })
  }
  page.on('response', alResponder)
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  const alerta = page.getByTestId('login-error')
  await expect(alerta).toBeVisible()
  page.off('response', alResponder)
  return { texto: (await alerta.textContent())?.trim() ?? '', respuestas }
}

test('1. login por contraseña entra a /organismos', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(OK)
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/organismos$/)
  await expect(page.getByRole('heading', { name: 'Mis organismos' })).toBeVisible()
  evidencia.loginContrasena = { urlFinal: page.url() }
})

test('4. tres causas de fallo distintas => exactamente el mismo mensaje', async ({ page }) => {
  const errada = await intentarContrasena(page, OK, 'contrasena-equivocada')
  const inexistente = await intentarContrasena(page, INEXISTENTE, CLAVE)
  const revocada = await intentarContrasena(page, REVOCADO, CLAVE)
  await page.screenshot({ path: process.env.LOGIN_PNG ?? 'test-results/login-error.png' })

  evidencia.mensajes = { errada: errada.texto, inexistente: inexistente.texto, revocada: revocada.texto }
  evidencia.respuestasDelBackend = {
    errada: errada.respuestas, inexistente: inexistente.respuestas, revocada: revocada.respuestas,
  }
  expect(errada.texto).toContain(MENSAJE)
  expect(inexistente.texto).toBe(errada.texto)
  expect(revocada.texto).toBe(errada.texto)
  for (const r of [errada, inexistente, revocada]) expect(r.respuestas.map((x) => x.status)).toEqual([401])
})

test('3. magic link: pedido desde la UI, consumo del link, y link reusado', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('tab', { name: 'Con enlace por email' }).click()
  await page.getByLabel('Email', { exact: true }).fill(ENLACE)
  await page.getByRole('button', { name: 'Enviarme un enlace' }).click()
  await expect(page.getByTestId('enlace-enviado')).toBeVisible()
  await page.waitForTimeout(500)
  const link = ultimoMagicLink(ENLACE)
  evidencia.magicLink = { linkHost: new URL(link).origin }

  await page.goto(link)
  await expect(page).toHaveURL(/\/organismos$/)
  const sesion = await page.evaluate(async () => (await fetch('/api/auth/session')).json())
  evidencia.magicLinkSesion = sesion
  expect(sesion.rol).toBe('usuario_normal')

  // Mismo link otra vez, con otra sesión limpia: de un solo uso.
  await page.context().clearCookies()
  await page.goto(link)
  await expect(page).toHaveURL(/\/login\?error=INVALID_TOKEN/)
  await expect(page.getByTestId('login-error-url')).toContainText('El enlace es inválido o venció')
})

test('2. Google: el botón lleva a Google con el redirect_uri de este origen', async ({ page }) => {
  let destino = ''
  await page.route('https://accounts.google.com/**', (route) => {
    destino = route.request().url()
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>google (interceptado)</h1>' })
  })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Continuar con Google' }).click()
  await expect.poll(() => destino).toContain('accounts.google.com')
  const u = new URL(destino)
  evidencia.google = { host: u.host, redirect_uri: u.searchParams.get('redirect_uri'), client_id: u.searchParams.get('client_id') }
  expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:5173/api/auth/callback/google')
})

test('5. sin sesión => /login?returnTo, y tras entrar vuelve a la ruta pedida', async ({ page }) => {
  await page.goto('/organismos/5?x=1')
  await expect(page).toHaveURL(/\/login\?returnTo=%2Forganismos%2F5%3Fx%3D1/)
  await page.getByLabel('Email', { exact: true }).fill(OK)
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/organismos\/5\?x=1$/)
})

test('6. no hay pantalla de registro (ni /pools)', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('link', { name: /regist|crear cuenta|sign ?up/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /regist|crear cuenta|sign ?up/i })).toHaveCount(0)
  for (const ruta of ['/registro', '/signup', '/pools']) {
    await page.goto(ruta)
    // sin sesión => login; con sesión => 404. En ambos casos NO hay formulario de alta.
    await expect(page.getByLabel('Nombre')).toHaveCount(0)
  }
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(OK)
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/organismos$/)
  for (const ruta of ['/registro', '/signup', '/pools']) {
    await page.goto(ruta)
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
  }
})
