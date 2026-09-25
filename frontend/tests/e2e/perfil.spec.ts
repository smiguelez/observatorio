import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { CLAVE, crearUsuarioConClave, limpiarFixtures, pedirMagicLink, PREFIJO, sql } from './helpers/backend'
import { elegir, entrarUI } from './helpers/ui'

const CON = `${PREFIJO}perfil-clave@example.test`
const SIN = `${PREFIJO}perfil-enlace@example.test`
const NUEVA = 'otra-contrasena-99999'
const evidencia: Record<string, unknown> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(CON)
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.PERFIL_EVIDENCIA ?? 'test-results/perfil-evidencia.json', JSON.stringify(evidencia, null, 2))
})

test('23a. editar datos propios: se guardan y la provincia de la sesión cambia de inmediato', async ({ page }) => {
  await entrarUI(page, CON)
  await page.goto('/perfil')
  await expect(page.getByTestId('perfil-email')).toHaveText(CON)
  await page.getByLabel('Nombre', { exact: true }).fill('Persona de Prueba')
  await elegir(page, 'provinciaId', 'Córdoba')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByTestId('mensaje-perfil')).toContainText('Cambios guardados')
  const fila = sql(`SELECT nombre_display || '/' || p.nombre FROM usuarios u JOIN provincias p ON p.id=u.provincia_id WHERE u.email = '${CON}'`)
  evidencia.datosEnBase = fila
  expect(fila).toBe('Persona de Prueba/Córdoba')

  // "Se refleja de inmediato": el alta de organismo ya trae la provincia nueva, sin recargar ni volver a entrar.
  await page.getByRole('link', { name: 'Mis organismos' }).click()
  await page.getByRole('link', { name: 'Nuevo organismo' }).click()
  await expect(page.locator('#provinciaId')).toContainText('Córdoba')
})

test('23b. métodos de acceso: refleja los reales de la cuenta', async ({ page }) => {
  await entrarUI(page, CON)
  await page.goto('/perfil')
  const lista = page.getByTestId('metodos-acceso')
  await expect(lista).toBeVisible()
  await expect(lista.locator('[data-metodo="contrasena"]')).toHaveAttribute('data-activo', 'true')
  await expect(lista.locator('[data-metodo="google"]')).toHaveAttribute('data-activo', 'false')
  evidencia.metodosConClave = await lista.locator('li').allTextContents()
})

test('23c. cambiar contraseña: la actual errónea se rechaza; con la correcta, el próximo login exige la nueva', async ({ page }) => {
  await entrarUI(page, CON)
  await page.goto('/perfil')
  const form = page.getByRole('form', { name: 'Cambiar contraseña' })

  await form.getByLabel('Contraseña actual').fill('no-es-la-actual')
  await form.getByLabel('Contraseña nueva', { exact: true }).fill(NUEVA)
  await form.getByLabel('Repetir contraseña nueva').fill(NUEVA)
  await form.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(page.getByTestId('mensaje-password')).toContainText('La contraseña actual no es correcta')

  await form.getByLabel('Contraseña actual').fill(CLAVE)
  await form.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(page.getByTestId('mensaje-password')).toContainText('Contraseña actualizada')

  // Validación local: no coinciden => no llega al backend.
  await form.getByLabel('Contraseña actual').fill(NUEVA)
  await form.getByLabel('Contraseña nueva', { exact: true }).fill('12345678')
  await form.getByLabel('Repetir contraseña nueva').fill('87654321')
  await form.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(form.getByText('Las contraseñas no coinciden')).toBeVisible()

  // Cerrar sesión y volver a entrar: la vieja falla, la nueva funciona.
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(CON)
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByTestId('login-error')).toBeVisible()
  await page.getByLabel('Contraseña', { exact: true }).fill(NUEVA)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/organismos$/)
  evidencia.cambioDePassword = { viejaRechazada: true, nuevaAceptada: true }
})

test('23d. cuenta SIN contraseña (entra por enlace): no aparece el formulario, sino el aviso', async ({ page }) => {
  const link = await pedirMagicLink(SIN)
  await page.goto(link)
  await expect(page).toHaveURL(/\/organismos$/)
  await page.goto('/perfil')
  await expect(page.getByTestId('sin-contrasena')).toContainText('no usa contraseña')
  await expect(page.getByRole('form', { name: 'Cambiar contraseña' })).toHaveCount(0)
  await expect(page.getByLabel('Contraseña actual')).toHaveCount(0)
  const lista = page.getByTestId('metodos-acceso')
  await expect(lista.locator('[data-metodo="contrasena"]')).toHaveAttribute('data-activo', 'false')
  evidencia.metodosSinClave = await lista.locator('li').allTextContents()
  await page.screenshot({ path: process.env.PERFIL_PNG ?? 'test-results/perfil-sin-contrasena.png', fullPage: true })
})
