import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { crearUsuarioConClave, crearUsuarioSinClave, limpiarFixtures, PREFIJO, sql } from './helpers/backend'
import { entrarUI } from './helpers/ui'

// 008 — invariantes de seguridad de la pantalla pública y rutas que NO existen (quickstart 16 y 17; contracts/routes.md).
// Los invariantes 1–3 se miden en un navegador real; el 4 (caché de TanStack Query) no es accesible desde Playwright y lo
// cubren los tests unitarios de PrimerAccesoPage y AltaUsuarioDialog.
const ADM = `${PREFIJO}seg-admin@example.test`
const NORMAL = `${PREFIJO}seg-normal@example.test`
const evidencia: Record<string, unknown> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(ADM, { rol: 'admin' })
  await crearUsuarioConClave(NORMAL, { provinciaId: 1 })
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.SEG_EVIDENCIA ?? 'test-results/seguridad-acceso-evidencia.json', JSON.stringify(evidencia, null, 2))
})

test('16. durante un canje real: ninguna solicitud lleva el acceso (URL ni Referer) y no hay rastro en el navegador', async ({ browser }) => {
  const { token } = await crearUsuarioSinClave(`${PREFIJO}seg-canje@example.test`, 5)
  const clave = 'clave-de-seguridad-2026'
  const contexto = await browser.newContext()
  const page = await contexto.newPage()
  const pedidos: { url: string; referer: string; cuerpo: string }[] = []
  page.on('request', (r) => pedidos.push({ url: r.url(), referer: r.headers()['referer'] ?? '', cuerpo: r.postData() ?? '' }))
  await page.goto(`/primer-acceso#token=${token}`)
  await page.getByLabel('Contraseña', { exact: true }).fill(clave)
  await page.getByLabel('Repetir contraseña').fill(clave)
  await page.getByRole('button', { name: 'Guardar contraseña y entrar' }).click()
  await expect(page).toHaveURL(/\/organismos$/)

  // 1. Ninguna URL ni Referer contiene el acceso ni la contraseña (el fragmento no se envía). Solo el cuerpo del POST del canje.
  expect(pedidos.filter((p) => p.url.includes(token) || p.referer.includes(token) || p.url.includes(clave) || p.referer.includes(clave))).toEqual([])
  const conCuerpo = pedidos.filter((p) => p.cuerpo.includes(token))
  expect(conCuerpo.map((p) => new URL(p.url).pathname)).toEqual(['/api/acceso-inicial/canjear'])
  // 2. location.href sin el acceso, y el historial de esta pestaña tampoco.
  expect(page.url()).not.toContain(token)
  // 3. Ni almacenamiento ni cookies visibles al script (la cookie de sesión es httpOnly) contienen acceso o contraseña.
  const rastro = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie + JSON.stringify(history.state))
  expect(rastro).not.toContain(token)
  expect(rastro).not.toContain(clave)
  expect(await page.evaluate(() => document.cookie.includes('better-auth.session_token'))).toBe(false) // httpOnly
  evidencia.invariantes = { solicitudesConAcceso: 0, refererConAcceso: 0, unicaSolicitudConCuerpo: '/api/acceso-inicial/canjear', rastroEnNavegador: false }
  await contexto.close()
})

test('17. /registro, /signup y /pools no existen (con sesión: no encontrado; sin sesión: login) y nada enlaza a /primer-acceso', async ({ page, browser }) => {
  for (const ruta of ['/registro', '/signup', '/pools']) {
    const anonimo = await browser.newContext()
    const p = await anonimo.newPage()
    await p.goto(ruta)
    await expect(p).toHaveURL(/\/login\?returnTo=/)
    await anonimo.close()
  }
  await entrarUI(page, NORMAL)
  for (const ruta of ['/registro', '/signup', '/pools']) {
    await page.goto(ruta)
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
  }
  // Ninguna pantalla (login, usuario normal, admin) enlaza a la pantalla pública.
  const enlaces = async (p: import('@playwright/test').Page, rutas: string[]) => {
    const cuenta: Record<string, number> = {}
    for (const r of rutas) {
      await p.goto(r)
      await p.waitForLoadState('networkidle')
      cuenta[r] = await p.locator('a[href*="primer-acceso"]').count()
    }
    return cuenta
  }
  const normal = await enlaces(page, ['/organismos', '/perfil', '/ajustes'])
  const anonimo = await browser.newContext()
  const login = await enlaces(await anonimo.newPage(), ['/login'])
  await anonimo.close()
  const admin = await browser.newContext()
  const pa = await admin.newPage()
  await entrarUI(pa, ADM)
  const deAdmin = await enlaces(pa, ['/admin/usuarios', '/admin/organismos'])
  await admin.close()
  for (const c of [normal, login, deAdmin]) expect(Object.values(c).every((n) => n === 0)).toBe(true)
  evidencia.enlacesAPrimerAcceso = { ...normal, ...login, ...deAdmin }
})
