import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { asignarProvincia, crearUsuarioConClave, hacerAdmin, limpiarFixtures, PREFIJO, sesionApi, sql } from './helpers/backend'
import { entrarUI } from './helpers/ui'

// Auditoría automática de accesibilidad (axe-core, reglas WCAG 2.x A/AA) sobre las pantallas principales
// y los diálogos, en escritorio y en móvil. Falla ante impacto "serious" o "critical"; el resto se informa.
const U = `${PREFIJO}a11y@example.test`
const ADM = `${PREFIJO}a11y-admin@example.test`
const evidencia: Record<string, unknown> = {}
const resultados: { pantalla: string; violaciones: { regla: string; impacto: string | null | undefined; nodos: number }[] }[] = []
let orgId: string
let ufId: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(U)
  await crearUsuarioConClave(ADM)
  asignarProvincia(U, 1)
  hacerAdmin(ADM)
  const api = await sesionApi(U)
  orgId = (await api.post('/api/organismos', { denominacion: `${PREFIJO}org a11y`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 })).json.id
  const loc = Number(sql('SELECT id FROM localidades WHERE provincia_id = 1 ORDER BY id LIMIT 1'))
  ufId = (await api.post(`/api/organismos/${orgId}/unidades-funcionales`, { denominacionUnidad: 'uf a11y', localidadId: loc, tipoUfId: 1 })).json.id
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.pantallas = resultados
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.A11Y_EVIDENCIA ?? 'test-results/a11y-evidencia.json', JSON.stringify(evidencia, null, 2))
})

async function auditar(page: Page, pantalla: string, contexto?: string) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  if (contexto) b = b.include(contexto)
  const r = await b.analyze()
  const violaciones = r.violations.map((v) => ({ regla: v.id, impacto: v.impact, nodos: v.nodes.length }))
  resultados.push({ pantalla, violaciones })
  const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), pantalla).toEqual([])
}

test('login (escritorio y móvil)', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible()
  await auditar(page, 'login')
  await page.setViewportSize({ width: 390, height: 800 })
  await auditar(page, 'login (móvil 390px)')
})

test('pantallas de usuario normal', async ({ page }) => {
  await entrarUI(page, U)
  await auditar(page, 'lista de organismos')
  await page.goto('/organismos/nuevo')
  await expect(page.getByRole('button', { name: 'Crear organismo' })).toBeVisible()
  await auditar(page, 'alta de organismo')
  await page.goto(`/organismos/${orgId}`)
  await expect(page.getByTestId('titulo-organismo')).toBeVisible()
  await auditar(page, 'detalle: datos')
  await page.goto(`/organismos/${orgId}/taxonomia`)
  await expect(page.getByTestId('form-taxonomia')).toBeVisible()
  await auditar(page, 'taxonomía (formulario dinámico)')
  await page.goto(`/organismos/${orgId}/editores`)
  await expect(page.getByRole('heading', { name: 'Editores' })).toBeVisible()
  await auditar(page, 'editores')
  await page.goto(`/organismos/${orgId}/unidades-funcionales`)
  await expect(page.getByTestId('fila-uf')).toHaveCount(1)
  await auditar(page, 'unidades funcionales (lista)')
  await page.goto(`/organismos/${orgId}/unidades-funcionales/${ufId}`)
  await expect(page.getByRole('button', { name: 'Asignación de jueces' })).toBeVisible()
  await auditar(page, 'unidad funcional (formulario)')
  await page.goto('/perfil')
  await expect(page.getByTestId('perfil-email')).toBeVisible()
  await auditar(page, 'perfil')
  await page.goto('/ajustes')
  await auditar(page, 'ajustes')
})

test('diálogos: asignación de jueces (asignar y pools) y menú de usuario', async ({ page }) => {
  await entrarUI(page, U)
  await page.goto(`/organismos/${orgId}/unidades-funcionales/${ufId}`)
  await page.getByRole('button', { name: 'Asignación de jueces' }).click()
  await expect(page.getByTestId('dialogo-asignaciones')).toBeVisible()
  await auditar(page, 'diálogo de asignación: pestaña asignar', '[data-testid="dialogo-asignaciones"]')
  await page.getByRole('tab', { name: 'Pools de la provincia' }).click()
  await expect(page.getByTestId('panel-pools')).toBeVisible()
  await auditar(page, 'diálogo de asignación: pestaña pools', '[data-testid="dialogo-asignaciones"]')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Menú de usuario' }).click()
  await expect(page.getByRole('menuitem', { name: 'Perfil' })).toBeVisible()
  await auditar(page, 'menú de usuario abierto')
})

test('pantallas de admin y móvil', async ({ page }) => {
  await entrarUI(page, ADM)
  await page.goto('/admin/usuarios')
  await expect(page.getByTestId('fila-usuario').first()).toBeVisible()
  await auditar(page, 'admin: usuarios')
  await page.goto('/admin/organismos')
  await expect(page.getByTestId('resumen-completitud')).toBeVisible({ timeout: 120_000 })
  await auditar(page, 'admin: completitud de organismos')

  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/organismos')
  await page.getByRole('button', { name: 'Abrir o cerrar el menú' }).click()
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Mis organismos' })).toBeVisible()
  await auditar(page, 'móvil: menú lateral abierto (sheet)')
})
