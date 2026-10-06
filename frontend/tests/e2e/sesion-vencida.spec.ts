import { expect, test, type Locator } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { asignarProvincia, CLAVE, crearUsuarioConClave, limpiarFixtures, PREFIJO, sesionApi, sql } from './helpers/backend'
import { entrarUI } from './helpers/ui'

// Mismo override que ya usan los helpers de backend (`E2E_ORIGEN_URL`) para el ORIGEN que el
// navegador real visita en 25d — no el `baseURL` del config (que apunta a localhost:5173). El
// bridge Fastify->Better Auth solo confía en el origen de `BETTER_AUTH_URL`; si ese valor es un
// túnel (como en este entorno de desarrollo), un navegador real entrando por localhost:5173 nunca
// pasa el login (403 Invalid Origin) sin que esto tenga nada que ver con el bug que prueba 25d.
const ORIGEN_NAVEGADOR = process.env.E2E_ORIGEN_URL ?? 'http://localhost:5173'

/**
 * Ningún elemento visible DENTRO del diálogo puede sobresalir de su propio borde (desborde
 * horizontal: el link largo de "Ingresar con Google..." empujaba el ancho del diálogo más allá de
 * la tarjeta). Tolerancia de 1px por redondeo de subpíxel. Devuelve la lista de infractores (vacía
 * si todo entra) en vez de aserciones una por una, para un mensaje de fallo útil.
 */
async function hijosQueSobresalen(dialogo: Locator): Promise<{ tag: string; texto: string; delta: number }[]> {
  return dialogo.evaluate((el) => {
    const caja = el.getBoundingClientRect()
    const infractores: { tag: string; texto: string; delta: number }[] = []
    for (const hijo of el.querySelectorAll<HTMLElement>('*')) {
      const r = hijo.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue // sr-only / no renderizado
      const deltaDerecha = r.right - caja.right
      const deltaIzquierda = caja.left - r.left
      const delta = Math.max(deltaDerecha, deltaIzquierda)
      if (delta > 1) {
        infractores.push({ tag: hijo.tagName, texto: (hijo.textContent ?? '').trim().slice(0, 60), delta })
      }
    }
    return infractores
  })
}

const A = `${PREFIJO}venc-a@example.test`
const B = `${PREFIJO}venc-b@example.test`
const evidencia: Record<string, unknown> = {}
let orgId: string
const denominacionEnBase = () => sql(`SELECT denominacion FROM organismos WHERE id = ${orgId}`)
// El backend normaliza `denominacion` al guardar (backend/src/util/denominaciones.ts): sin espacios
// solo capitaliza la primera letra; "a" es una preposición que queda en minúscula salvo que sea la
// primera palabra.
const CAP = PREFIJO[0]!.toUpperCase() + PREFIJO.slice(1)

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
  await expect(campo).toHaveValue(`${CAP}original`)
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
  expect(denominacionEnBase()).toBe(`${CAP}original`) // el guardado fallido no cambió nada
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
  expect(denominacionEnBase()).toBe(`${CAP}borrador Escrito a Mano`)
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

test('25d. el diálogo de sesión vencida no desborda su propia tarjeta, ni ancho ni angosto', async ({ page }) => {
  // Navegación por URL ABSOLUTA (no relativa al `baseURL` del config) — ver ORIGEN_NAVEGADOR arriba.
  await page.goto(`${ORIGEN_NAVEGADOR}/login`)
  await page.getByLabel('Email', { exact: true }).fill(A)
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/organismos$/)
  await page.goto(`${ORIGEN_NAVEGADOR}/organismos/${orgId}`)
  // El formulario real (no el esqueleto de carga) tiene que estar montado ANTES de cortar la
  // sesión — por el túnel hay más latencia de red que contra localhost (que usan 25a/25b/25c) y
  // cortar la sesión mientras todavía está cargando hace que el botón se desmonte/remonte en loop.
  await expect(page.getByLabel('Denominación', { exact: true })).toBeVisible()
  await page.context().clearCookies()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  const dialogo = page.getByTestId('sesion-vencida')
  await expect(dialogo).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: process.env.VENC_DESBORDE_1280_PNG ?? 'test-results/sesion-vencida-1280.png' })
  const infractores1280 = await hijosQueSobresalen(dialogo)
  evidencia.infractores1280 = infractores1280

  await page.setViewportSize({ width: 375, height: 700 })
  await page.screenshot({ path: process.env.VENC_DESBORDE_375_PNG ?? 'test-results/sesion-vencida-375.png' })
  const infractores375 = await hijosQueSobresalen(dialogo)
  evidencia.infractores375 = infractores375

  expect(infractores1280, `elementos que sobresalen a 1280px: ${JSON.stringify(infractores1280)}`).toEqual([])
  expect(infractores375, `elementos que sobresalen a 375px: ${JSON.stringify(infractores375)}`).toEqual([])
})
