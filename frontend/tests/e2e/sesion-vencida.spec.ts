import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { asignarProvincia, CLAVE, crearUsuarioConClave, limpiarFixtures, PREFIJO, sesionApi, sql } from './helpers/backend'
import { entrarUI } from './helpers/ui'

const A = `${PREFIJO}venc-a@example.test`
const B = `${PREFIJO}venc-b@example.test`
const evidencia: Record<string, unknown> = {}
let orgId: string
const denominacionEnBase = () => sql(`SELECT denominacion FROM organismos WHERE id = ${orgId}`)

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(A)
  await crearUsuarioConClave(B)
  asignarProvincia(A, 1)
  asignarProvincia(B, 1)
  orgId = (await (await sesionApi(A)).post('/api/organismos', { denominacion: `${PREFIJO}original`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 })).json.id
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.VENC_EVIDENCIA ?? 'test-results/sesion-vencida-evidencia.json', JSON.stringify(evidencia, null, 2))
})

test('25a. la sesión vence con un formulario a medias: aviso, re-ingreso sin recargar y sin perder lo escrito', async ({ page }) => {
  await entrarUI(page, A)
  await page.goto(`/organismos/${orgId}`)
  const campo = page.getByLabel('Denominación', { exact: true })
  await expect(campo).toHaveValue(`${PREFIJO}original`)
  await campo.fill(`${PREFIJO}borrador escrito a mano`)

  // Marca en window: si la página se recargara o la app se remontara, se pierde. Prueba de que NO pasó.
  await page.evaluate(() => { (window as unknown as { __marca: string }).__marca = 'sigue-la-misma-pagina' })

  await page.context().clearCookies() // la sesión "vence"
  const estados: number[] = []
  page.on('response', (r) => { if (r.request().method() === 'PATCH') estados.push(r.status()) })
  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  const dialogo = page.getByTestId('sesion-vencida')
  await expect(dialogo).toBeVisible()
  await expect(dialogo).toContainText('Tu sesión venció')
  expect(estados).toEqual([401])
  expect(denominacionEnBase()).toBe(`${PREFIJO}original`) // el guardado fallido no cambió nada
  await page.screenshot({ path: process.env.VENC_PNG ?? 'test-results/sesion-vencida.png' })

  // Re-ingreso por contraseña sobre la misma pantalla.
  await dialogo.getByLabel('Email', { exact: true }).fill(A)
  await dialogo.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await dialogo.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(dialogo).toHaveCount(0)

  // Lo escrito sigue ahí, la página no se recargó, y ahora sí se puede guardar.
  await expect(campo).toHaveValue(`${PREFIJO}borrador escrito a mano`)
  expect(await page.evaluate(() => (window as unknown as { __marca?: string }).__marca)).toBe('sigue-la-misma-pagina')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByTestId('mensaje-datos')).toContainText('Cambios guardados')
  expect(denominacionEnBase()).toBe(`${PREFIJO}borrador escrito a mano`)
  evidencia.mismaCuenta = { estados, recargo: false, guardado: denominacionEnBase() }
})

test('25b. si vuelve a entrar OTRA cuenta no se mezclan datos: se recarga la app y el borrador no se guarda', async ({ page }) => {
  await entrarUI(page, A)
  await page.goto(`/organismos/${orgId}`)
  await page.getByLabel('Denominación', { exact: true }).fill(`${PREFIJO}borrador de A`)
  await page.context().clearCookies()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  const dialogo = page.getByTestId('sesion-vencida')
  await expect(dialogo).toBeVisible()
  const antes = denominacionEnBase()

  await dialogo.getByLabel('Email', { exact: true }).fill(B)
  await dialogo.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await dialogo.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page).toHaveURL(/\/organismos$/) // recarga completa a la lista
  await expect(page.getByTestId('organismos-vacio')).toBeVisible() // la lista de B (vacía), no la de A
  expect(denominacionEnBase()).toBe(antes) // el borrador de A no se guardó con la sesión de B
  evidencia.otraCuenta = { urlFinal: page.url(), listaDeB: 'vacía', baseSinCambios: true }
})

test('25c. quien entra por Google/enlace: lo lleva al login con returnTo y le avisa que se pierde lo no guardado', async ({ page }) => {
  await entrarUI(page, A)
  await page.goto(`/organismos/${orgId}`)
  await page.getByLabel('Denominación', { exact: true }).fill('otro borrador')
  await page.context().clearCookies()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  const dialogo = page.getByTestId('sesion-vencida')
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole('button', { name: /Ingresar con Google o con un enlace/ }).click()
  await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=%2Forganismos%2F${orgId}`))
})
