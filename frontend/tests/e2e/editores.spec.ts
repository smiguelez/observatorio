import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { asignarProvincia, crearUsuarioConClave, hacerAdmin, limpiarFixtures, PREFIJO, sesionApi, sql, type ApiSesion } from './helpers/backend'
import { entrarUI } from './helpers/ui'

const OWNER = `${PREFIJO}ed-owner@example.test`
const ED = `${PREFIJO}ed-editor@example.test`
const ED2 = `${PREFIJO}ed-editor2@example.test`
const ADM = `${PREFIJO}ed-admin@example.test`
const evidencia: Record<string, unknown> = {}
let orgId: string
let apiOwner: ApiSesion

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  for (const e of [OWNER, ED, ED2, ADM]) await crearUsuarioConClave(e)
  for (const e of [OWNER, ED, ED2]) asignarProvincia(e, 1)
  hacerAdmin(ADM)
  apiOwner = await sesionApi(OWNER)
  orgId = (await apiOwner.post('/api/organismos', { denominacion: `${PREFIJO}org editores`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 })).json.id
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.ED_EVIDENCIA ?? 'test-results/editores-evidencia.json', JSON.stringify(evidencia, null, 2))
})

const editoresEnBase = () => sql(`SELECT coalesce(string_agg(u.email, ',' ORDER BY u.email), '') FROM organismo_editores e JOIN usuarios u ON u.id = e.usuario_id WHERE e.organismo_id = ${orgId}`)

test('19a. el propietario agrega un editor: el editor ve el organismo en su lista y puede abrirlo', async ({ page, browser }) => {
  // Antes: el editor NO tiene acceso.
  const antes = await (await sesionApi(ED)).get(`/api/organismos/${orgId}`)
  expect(antes.status).toBe(403)

  await entrarUI(page, OWNER)
  await page.goto(`/organismos/${orgId}/editores`)
  await expect(page.getByTestId('sin-editores')).toBeVisible()
  // Candidatos: no incluye al propietario.
  await page.locator('#editor-nuevo').click()
  const opciones = await page.getByRole('option').allTextContents()
  expect(opciones.some((o) => o.includes(OWNER))).toBe(false)
  expect(opciones.some((o) => o.includes(ED))).toBe(true)
  await page.getByRole('option', { name: new RegExp(ED) }).click()
  await page.getByRole('button', { name: 'Agregar editor' }).click()
  await expect(page.getByTestId('mensaje-editores')).toContainText('Editor agregado')
  await expect(page.getByTestId('fila-editor')).toContainText(ED)
  expect(editoresEnBase()).toBe(ED)

  // El editor, en otra sesión de navegador, lo ve en SU lista (con la etiqueta "Editor") y accede.
  const ctx = await browser.newContext()
  const otra = await ctx.newPage()
  await entrarUI(otra, ED)
  await expect(otra.getByTestId('fila-organismo')).toHaveCount(1)
  await expect(otra.getByTestId('fila-organismo')).toContainText('Editor')
  await otra.goto(`/organismos/${orgId}`)
  await expect(otra.getByTestId('titulo-organismo')).toContainText('org editores')
  evidencia.editorVeElOrganismo = true
  await ctx.close()
})

test('19b. un EDITOR no puede gestionar editores: sin controles en la UI y 403 real del backend', async ({ page }) => {
  await entrarUI(page, ED)
  await page.goto(`/organismos/${orgId}/editores`)
  await expect(page.getByTestId('editores-solo-lectura')).toContainText('Solo el propietario o un administrador')
  await expect(page.getByTestId('fila-editor')).toHaveCount(1) // puede VER la lista
  await expect(page.getByRole('button', { name: 'Agregar editor' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Quitar a/ })).toHaveCount(0)

  // El control real es el backend: aunque se salte la UI, 403.
  const apiEd = await sesionApi(ED)
  const idEd2 = sql(`SELECT id FROM usuarios WHERE email = '${ED2}'`)
  const post = await apiEd.post(`/api/organismos/${orgId}/editores`, { usuarioId: Number(idEd2) })
  const del = await apiEd.del(`/api/organismos/${orgId}/editores/${sql(`SELECT id FROM usuarios WHERE email = '${ED}'`)}`)
  evidencia.editorIntentaGestionar = { post: post.status, delete: del.status }
  expect(post.status).toBe(403)
  expect(del.status).toBe(403)
  expect(editoresEnBase()).toBe(ED) // nada cambió
})

test('19c. 400 real: agregar un usuario que ya es editor (carrera entre pestañas)', async ({ page }) => {
  await entrarUI(page, OWNER)
  await page.goto(`/organismos/${orgId}/editores`)
  await expect(page.getByTestId('fila-editor')).toHaveCount(1)
  // ED2 se agrega por otro lado mientras esta pantalla sigue abierta con la lista vieja.
  const idEd2 = Number(sql(`SELECT id FROM usuarios WHERE email = '${ED2}'`))
  expect((await apiOwner.post(`/api/organismos/${orgId}/editores`, { usuarioId: idEd2 })).status).toBe(201)
  const estados: number[] = []
  page.on('response', (r) => { if (r.request().method() === 'POST' && r.url().endsWith('/editores')) estados.push(r.status()) })
  await page.locator('#editor-nuevo').click()
  await page.getByRole('option', { name: new RegExp(ED2) }).click()
  await page.getByRole('button', { name: 'Agregar editor' }).click()
  const alerta = page.getByTestId('mensaje-editores')
  await expect(alerta).toContainText('Ese usuario ya es editor de este organismo.')
  evidencia.duplicado = { status: estados, mensaje: (await alerta.textContent())?.trim() }
  expect(estados).toEqual([400])
})

test('19d. el propietario quita a un editor: pierde el acceso de inmediato, sin re-login', async ({ page, browser }) => {
  // El editor tiene una sesión abierta y ve el organismo.
  const ctx = await browser.newContext()
  const otra = await ctx.newPage()
  await entrarUI(otra, ED)
  await expect(otra.getByTestId('fila-organismo')).toHaveCount(1)

  await entrarUI(page, OWNER)
  await page.goto(`/organismos/${orgId}/editores`)
  await page.getByRole('button', { name: `Quitar a ${ED}` }).click()
  await page.getByRole('button', { name: 'Quitar editor' }).click()
  await expect(page.getByTestId('mensaje-editores')).toContainText('Editor quitado')
  expect(editoresEnBase()).toBe(ED2)

  // Misma sesión del editor, sin volver a entrar: ya no lo ve ni puede abrirlo.
  await otra.goto('/organismos')
  await expect(otra.getByTestId('organismos-vacio')).toBeVisible()
  const respuestas: number[] = []
  otra.on('response', (r) => { if (r.url().endsWith(`/api/organismos/${orgId}`)) respuestas.push(r.status()) })
  await otra.goto(`/organismos/${orgId}`)
  await expect(otra.getByRole('heading', { name: 'No autorizado' })).toBeVisible()
  evidencia.editorQuitado = { statusDelBackend: respuestas }
  expect(respuestas).toContain(403)
  await ctx.close()
})

test('19e. un admin agrega y quita editores de un organismo AJENO', async ({ page }) => {
  await entrarUI(page, ADM)
  await page.goto(`/organismos/${orgId}/editores`)
  await expect(page.getByTestId('editores-solo-lectura')).toHaveCount(0) // admin sí puede gestionar
  await page.locator('#editor-nuevo').click()
  await page.getByRole('option', { name: new RegExp(ED) }).click()
  await page.getByRole('button', { name: 'Agregar editor' }).click()
  await expect(page.getByTestId('mensaje-editores')).toContainText('Editor agregado')
  expect(editoresEnBase()).toBe([ED, ED2].sort().join(",")) // string_agg ordenado por email
  await page.getByRole('button', { name: `Quitar a ${ED2}` }).click()
  await page.getByRole('button', { name: 'Quitar editor' }).click()
  await expect(page.getByTestId('mensaje-editores')).toContainText('Editor quitado')
  expect(editoresEnBase()).toBe(ED)
  await page.screenshot({ path: process.env.ED_PNG ?? 'test-results/editores.png' })
})
