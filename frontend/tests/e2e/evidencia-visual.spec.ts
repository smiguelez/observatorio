import { expect, test, type Page } from '@playwright/test'
import { asignarProvincia, crearUsuarioConClave, hacerAdmin, limpiarFixtures, PREFIJO, sesionApi, sql } from './helpers/backend'
import { entrarUI } from './helpers/ui'

// Capturas para `docs/evidencia-frontend/` de pantallas que, contra la base real, muestran DATOS REALES
// (emails y nombres de usuarios, denominaciones de organismos y de pools). Acá los valores reales se
// reemplazan por sintéticos EN LA RESPUESTA que recibe el navegador, antes de dibujar la pantalla: la
// imagen conserva la estructura y las cantidades reales pero ningún dato identificable. Es solo para
// generar imágenes; las pruebas que verifican contenido contra SQL (admin-usuarios, admin-organismos,
// unidades-asignaciones) NO anonimizan y no escriben capturas a docs/.
const ADM = `${PREFIJO}vis-admin@example.test`
const U = `${PREFIJO}vis-user@example.test`
const OUT = process.env.VISUAL_DIR ?? 'test-results'

async function anonimizar(page: Page) {
  const esPrueba = (t: string | null | undefined) => (t ?? '').startsWith(PREFIJO) || (t ?? '').startsWith('Grupo exclusivo de test-frontend')
  await page.route('**/api/usuarios', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const r = await route.fetch()
    const lista = (await r.json()) as { email: string; nombre_display: string | null }[]
    await route.fulfill({ response: r, json: lista.map((u, i) => (esPrueba(u.email) ? u : { ...u, email: `usuario-${i + 1}@ejemplo.test`, nombre_display: u.nombre_display === null ? null : `Usuario ${i + 1}` })) })
  })
  await page.route('**/api/organismos', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const r = await route.fetch()
    const lista = (await r.json()) as { denominacion: string }[]
    await route.fulfill({ response: r, json: lista.map((o, i) => (esPrueba(o.denominacion) ? o : { ...o, denominacion: `Organismo de ejemplo ${i + 1}` })) })
  })
  await page.route('**/api/pools-jueces', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const r = await route.fetch()
    const lista = (await r.json()) as { descripcion: string | null }[]
    await route.fulfill({ response: r, json: lista.map((p, i) => (esPrueba(p.descripcion) ? p : { ...p, descripcion: `Pool de ejemplo ${i + 1}` })) })
  })
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(ADM)
  await crearUsuarioConClave(U)
  hacerAdmin(ADM)
  asignarProvincia(U, 1)
})
test.afterAll(() => limpiarFixtures())

test('captura: usuarios (admin), datos anonimizados', async ({ page }) => {
  await anonimizar(page)
  await entrarUI(page, ADM)
  await page.goto('/admin/usuarios')
  await expect(page.getByTestId('fila-usuario').first()).toBeVisible()
  const total = Number(sql('SELECT count(*) FROM usuarios'))
  await expect(page.getByTestId('fila-usuario')).toHaveCount(total)
  const texto = (await page.locator('body').innerText()).toLowerCase()
  expect(texto).not.toContain('@gmail.com')
  const emails = await page.getByTestId('fila-usuario').evaluateAll((f) => f.map((e) => e.querySelector('td')!.textContent!))
  expect(emails.every((e) => /^usuario-\d+@ejemplo\.test$/.test(e) || e.startsWith('test-frontend-'))).toBe(true)
  await page.screenshot({ path: `${OUT}/admin-usuarios.png` })
})

test('captura: completitud de organismos (admin), datos anonimizados', async ({ page }) => {
  await anonimizar(page)
  await entrarUI(page, ADM)
  await page.getByRole('link', { name: 'Gestión de organismos' }).click()
  await expect(page.getByTestId('resumen-completitud')).toBeVisible({ timeout: 120_000 })
  const nombres = await page.getByTestId('fila-completitud').evaluateAll((f) => f.map((e) => e.querySelector('td a')!.textContent!))
  expect(nombres.length).toBe(Number(sql('SELECT count(*) FROM organismos')))
  expect(nombres.every((n) => /^Organismo de ejemplo \d+$/.test(n) || n.startsWith('test-frontend-'))).toBe(true)
  await page.screenshot({ path: `${OUT}/admin-organismos.png` })
})

test('captura: borrar un pool en uso (500 real), datos anonimizados', async ({ page }) => {
  const api = await sesionApi(U)
  const org = (await api.post('/api/organismos', { denominacion: `${PREFIJO}org vis`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 })).json
  const loc = Number(sql('SELECT id FROM localidades WHERE provincia_id = 1 ORDER BY id LIMIT 1'))
  const uf = (await api.post(`/api/organismos/${org.id}/unidades-funcionales`, { denominacionUnidad: `${PREFIJO}uf vis`, localidadId: loc, tipoUfId: 1 })).json
  const pool = (await api.post('/api/pools-jueces', { provinciaId: 1, descripcion: `${PREFIJO}pool en uso`, totalJueces: 5 })).json
  expect((await api.post(`/api/organismos/${org.id}/unidades-funcionales/${uf.id}/asignaciones-jueces`, { grupoJuecesId: Number(pool.id), cantidadAsignada: 3 })).status).toBe(201)

  await anonimizar(page)
  await entrarUI(page, U)
  await page.goto(`/organismos/${org.id}/unidades-funcionales/${uf.id}`)
  await page.getByRole('button', { name: 'Asignación de jueces' }).click()
  await page.getByRole('tab', { name: 'Pools de la provincia' }).click()
  const estados: number[] = []
  page.on('response', (r) => { if (r.request().method() === 'DELETE' && r.url().includes('/api/pools-jueces/')) estados.push(r.status()) })
  const fila = page.getByTestId('fila-pool').filter({ has: page.locator(`input[value="${PREFIJO}pool en uso"]`) })
  await fila.getByRole('button', { name: /Eliminar pool/ }).click()
  await page.getByRole('button', { name: 'Eliminar pool', exact: true }).click()
  const alerta = page.getByTestId('mensaje-pools')
  await expect(alerta).toContainText('puede estar asignado a otras unidades funcionales')
  expect(estados).toEqual([500])
  const descripciones = await page.getByTestId('fila-pool').evaluateAll((f) => f.map((e) => (e.querySelector('input') as HTMLInputElement).value))
  expect(descripciones.every((d) => /^Pool de ejemplo \d+$/.test(d) || d.startsWith('test-frontend-'))).toBe(true)
  await alerta.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${OUT}/pool-en-uso.png` })
})
