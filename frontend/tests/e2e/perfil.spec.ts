import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { asignarProvincia, CLAVE, crearUsuarioConClave, crearUsuarioSinClave, limpiarFixtures, pedirMagicLink, PREFIJO, sesionApi, sql } from './helpers/backend'
import { elegir, entrarUI } from './helpers/ui'

const CON = `${PREFIJO}perfil-clave@example.test`
const SIN = `${PREFIJO}perfil-enlace@example.test`
const ADM_PERFIL = `${PREFIJO}perfil-admin@example.test`
const NUEVA = 'otra-contrasena-99999'
const evidencia: Record<string, unknown> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(CON)
  await crearUsuarioConClave(ADM_PERFIL, { rol: 'admin' })
  // 23d: cuenta dada de alta que nunca fijó contraseña. Un magic link para un email no dado de alta ya no genera enlace (007).
  await crearUsuarioSinClave(SIN)
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.PERFIL_EVIDENCIA ?? 'test-results/perfil-evidencia.json', JSON.stringify(evidencia, null, 2))
})

test('23a. la provincia de un usuario normal es de SOLO LECTURA; guardar el nombre funciona y el PATCH no lleva provincia (008)', async ({ page }) => {
  await entrarUI(page, CON)
  asignarProvincia(CON, 6) // Córdoba: la asignó "un administrador" (por SQL, es un fixture)
  await page.goto('/perfil')
  await expect(page.getByTestId('perfil-email')).toHaveText(CON)
  await expect(page.getByTestId('provincia-solo-lectura')).toContainText('La asigna un administrador')
  await expect(page.getByTestId('provincia-valor')).toHaveText('Córdoba')
  await expect(page.locator('#provinciaId')).toHaveCount(0) // sin selector

  const patches: { url: string; cuerpo: string }[] = []
  page.on('request', (r) => { if (r.method() === 'PATCH' && new URL(r.url()).pathname.startsWith('/api/usuarios/')) patches.push({ url: r.url(), cuerpo: r.postData() ?? '' }) })
  await page.getByLabel('Nombre', { exact: true }).fill('Persona de Prueba')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByTestId('mensaje-perfil')).toContainText('Cambios guardados')
  const fila = sql(`SELECT nombre_display || '/' || p.nombre FROM usuarios u JOIN provincias p ON p.id=u.provincia_id WHERE u.email = '${CON}'`)
  evidencia.datosEnBase = fila
  expect(fila).toBe('Persona de Prueba/Córdoba')
  expect(patches).toHaveLength(1)
  expect(JSON.parse(patches[0]!.cuerpo)).not.toHaveProperty('provinciaId') // ni siquiera la actual
  evidencia.patchSinProvincia = JSON.parse(patches[0]!.cuerpo)

  // Un intento de cambio directo contra el servidor (lo que ya no ofrece la pantalla) recibe el 403 explícito de 007.
  const api = await sesionApi(CON)
  const r = await api.patch(`/api/usuarios/${sql(`SELECT id FROM usuarios WHERE email = '${CON}'`)}`, { provinciaId: 9 })
  expect(r.status).toBe(403)
  expect(r.json.error).toBe('La provincia de un usuario solo la puede asignar un administrador.')
  expect(sql(`SELECT provincia_id FROM usuarios WHERE email = '${CON}'`)).toBe('6')
  evidencia.cambioDirecto403 = r.json.error
})

test('23a-bis. un ADMINISTRADOR sí edita su provincia en el perfil', async ({ page }) => {
  await entrarUI(page, ADM_PERFIL)
  await page.goto('/perfil')
  await expect(page.locator('#provinciaId')).toBeVisible()
  await elegir(page, 'provinciaId', 'Mendoza')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByTestId('mensaje-perfil')).toContainText('Cambios guardados')
  expect(sql(`SELECT p.nombre FROM usuarios u JOIN provincias p ON p.id=u.provincia_id WHERE u.email = '${ADM_PERFIL}'`)).toBe('Mendoza')
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
