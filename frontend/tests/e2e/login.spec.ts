import { expect, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import {
  CLAVE, contarFixtures, crearUsuarioConClave, crearUsuarioSinClave, limpiarFixtures, PREFIJO, sql, ultimoMagicLink,
} from './helpers/backend'

const OK = `${PREFIJO}login@example.test`
// Cuenta dada de alta por un admin que NUNCA fijó contraseña (007). Reemplaza al fixture "credencial revocada" de 005:
// esa premisa (alta con contraseña sin verificar el email + magic link => Better Auth borra la credencial) ya no existe,
// porque el alta administrada deja `emailVerified = true` y una contraseña fijada por el acceso inicial sobrevive.
const SIN_CLAVE = `${PREFIJO}sinclave@example.test`
const ENLACE = `${PREFIJO}enlace@example.test`
const INEXISTENTE = `${PREFIJO}no-existe@example.test`
const MENSAJE = 'Email o contraseña incorrectos.'
const evidencia: Record<string, unknown> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(OK)
  await crearUsuarioSinClave(SIN_CLAVE)
  // El magic link ya no se pide para un email inexistente (007 no genera enlace): el usuario del test 3 se da de alta antes.
  await crearUsuarioSinClave(ENLACE)
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
  const sinClave = await intentarContrasena(page, SIN_CLAVE, CLAVE)
  await page.screenshot({ path: process.env.LOGIN_PNG ?? 'test-results/login-error.png' })

  evidencia.mensajes = { errada: errada.texto, inexistente: inexistente.texto, sinContrasena: sinClave.texto }
  evidencia.respuestasDelBackend = {
    errada: errada.respuestas, inexistente: inexistente.respuestas, sinContrasena: sinClave.respuestas,
  }
  expect(errada.texto).toContain(MENSAJE)
  expect(inexistente.texto).toBe(errada.texto)
  expect(sinClave.texto).toBe(errada.texto)
  for (const r of [errada, inexistente, sinClave]) expect(r.respuestas.map((x) => x.status)).toEqual([401])
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

test('3b. pedir un enlace para un email NO dado de alta muestra lo mismo, pero no genera ningún enlace (007, FR-003)', async ({ page }) => {
  const noAlta = `${PREFIJO}enlace-no-alta@example.test`
  await page.goto('/login')
  await page.getByRole('tab', { name: 'Con enlace por email' }).click()
  await page.getByLabel('Email', { exact: true }).fill(noAlta)
  await page.getByRole('button', { name: 'Enviarme un enlace' }).click()
  // Indistinguible de un email dado de alta (test 3): la pantalla no revela si el email existe.
  await expect(page.getByTestId('enlace-enviado')).toBeVisible()
  // Pero no quedó ningún enlace utilizable ni ninguna identidad.
  expect(sql(`SELECT count(*) FROM auth.verification WHERE value LIKE '%${noAlta}%'`)).toBe('0')
  expect(sql(`SELECT count(*) FROM usuarios WHERE email = '${noAlta}'`)).toBe('0')
  evidencia.enlaceEmailNoDadoDeAlta = { enlaceEnviadoVisible: true, verificaciones: 0, usuarios: 0 }
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
