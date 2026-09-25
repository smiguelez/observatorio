import { expect, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { asignarProvincia, crearUsuarioConClave, hacerAdmin, limpiarFixtures, PREFIJO, sesionApi, sql } from './helpers/backend'
import { entrarUI } from './helpers/ui'

// Requiere que el dev server arranque con VITE_DATASTUDIO_URL=https://datastudio.example.test/reporte
const TABLEROS = 'https://datastudio.example.test/reporte'
const N = `${PREFIJO}nav-normal@example.test`
const ADM = `${PREFIJO}nav-admin@example.test`
const evidencia: Record<string, unknown> = {}
let orgId: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(N)
  await crearUsuarioConClave(ADM)
  asignarProvincia(N, 1)
  hacerAdmin(ADM)
  const api = await sesionApi(N)
  orgId = (await api.post('/api/organismos', { denominacion: `${PREFIJO}org nav`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 })).json.id
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.NAV_EVIDENCIA ?? 'test-results/nav-evidencia.json', JSON.stringify(evidencia, null, 2))
})

const menuUsuario = (page: Page) => page.getByRole('button', { name: 'Menú de usuario' })
const sidebar = (page: Page) => page.locator('[data-slot="sidebar-content"]')

test('18. usuario normal: navegación agrupada, sin sección de pools ni de administración', async ({ page }) => {
  await entrarUI(page, N)
  const etiquetas = sidebar(page).locator('[data-slot="sidebar-group-label"]')
  await expect(etiquetas).toHaveText(['Organismos', 'Reportes']) // espera a que renderice
  evidencia.gruposUsuarioNormal = await etiquetas.allTextContents()
  const enlaces = await sidebar(page).getByRole('link').allTextContents()
  evidencia.enlacesUsuarioNormal = enlaces.map((e) => e.trim())
  expect(enlaces.join(' ')).not.toMatch(/pool/i)
  expect(enlaces.join(' ')).not.toMatch(/regist/i)
  await expect(page.getByTestId('grupo-menu-admin')).toHaveCount(0)

  // Perfil y ajustes NO están mezclados con la navegación de organismos: están en el menú de usuario.
  await expect(sidebar(page).getByRole('link', { name: /Perfil|Ajustes/ })).toHaveCount(0)
  await menuUsuario(page).click()
  await expect(page.getByRole('menuitem')).toHaveText(['Perfil', 'Ajustes', 'Cerrar sesión'])
  await page.keyboard.press('Escape')

  // /pools por URL: 404 aun con sesión.
  await page.goto('/pools')
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
})

test('24. desde cualquier pantalla: perfil y ajustes en 2 clics, tableros en 1 (≤ 3)', async ({ page }) => {
  await entrarUI(page, N)
  const pantallas = ['/organismos', `/organismos/${orgId}`, `/organismos/${orgId}/taxonomia`, `/organismos/${orgId}/unidades-funcionales/nueva`, '/organismos/nuevo']
  const clics: Record<string, Record<string, number>> = {}
  for (const ruta of pantallas) {
    await page.goto(ruta)
    clics[ruta] = {}

    let n = 0
    await menuUsuario(page).click(); n++
    await page.getByRole('menuitem', { name: 'Perfil' }).click(); n++
    await expect(page).toHaveURL(/\/perfil$/)
    clics[ruta]!.perfil = n

    await page.goto(ruta)
    n = 0
    await menuUsuario(page).click(); n++
    await page.getByRole('menuitem', { name: 'Ajustes' }).click(); n++
    await expect(page).toHaveURL(/\/ajustes$/)
    await expect(page.getByTestId('ajustes-vacio')).toBeVisible()
    clics[ruta]!.ajustes = n

    // Tableros: un solo clic, enlace externo en otra pestaña.
    await page.goto(ruta)
    await page.context().route('https://datastudio.example.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>tablero</h1>' }))
    const enlace = sidebar(page).getByRole('link', { name: /Tableros/ })
    await expect(enlace).toHaveAttribute('href', TABLEROS)
    await expect(enlace).toHaveAttribute('target', '_blank')
    await expect(enlace).toHaveAttribute('rel', /noopener/)
    const [popup] = await Promise.all([page.context().waitForEvent('page'), enlace.click()])
    expect(popup.url()).toBe(TABLEROS)
    await popup.close()
    clics[ruta]!.tableros = 1
  }
  evidencia.clicsPorPantalla = clics
  for (const c of Object.values(clics)) for (const v of Object.values(c)) expect(v).toBeLessThanOrEqual(3)
})

test('breadcrumbs: la ruta actual con el nombre real del organismo', async ({ page }) => {
  await entrarUI(page, N)
  await page.goto(`/organismos/${orgId}/taxonomia`)
  const migas = page.getByRole('navigation', { name: 'breadcrumb' })
  await expect(migas).toContainText('Mis organismos')
  await expect(migas).toContainText(`${PREFIJO}org nav`)
  await expect(migas).toContainText('Taxonomía')
})

test('admin: ve la sección Administración con sus dos pantallas; no hay pools', async ({ page }) => {
  await entrarUI(page, ADM)
  const etiquetas = sidebar(page).locator('[data-slot="sidebar-group-label"]')
  await expect(etiquetas).toHaveText(['Organismos', 'Reportes', 'Administración'])
  evidencia.gruposAdmin = await etiquetas.allTextContents()
  const admin = page.getByTestId('grupo-menu-admin')
  await expect(admin.getByRole('link')).toHaveText(['Gestión de organismos', 'Usuarios'])
  await admin.getByRole('link', { name: 'Usuarios' }).click()
  await expect(page).toHaveURL(/\/admin\/usuarios$/)
  expect((await sidebar(page).getByRole('link').allTextContents()).join(' ')).not.toMatch(/pool/i)
})

test('cerrar sesión desde el menú de usuario vuelve al login y descarta la sesión', async ({ page }) => {
  await entrarUI(page, N)
  await menuUsuario(page).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login/)
  const s = await page.evaluate(async () => (await fetch('/api/auth/session')).status)
  expect(s).toBe(401)
})

test('móvil: el menú pasa a un panel deslizable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await entrarUI(page, N)
  await expect(page.getByRole('link', { name: 'Mis organismos' })).toHaveCount(0) // cerrado por defecto
  await page.getByRole('button', { name: 'Abrir o cerrar el menú' }).click()
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Mis organismos' })).toBeVisible()
  await page.screenshot({ path: process.env.NAV_PNG ?? 'test-results/nav-movil.png' })
})
