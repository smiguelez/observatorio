import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import {
  asignarProvincia, crearUsuarioConClave, hacerAdmin, limpiarFixtures, PREFIJO, sesionApi, sql,
} from './helpers/backend'
import { elegir, entrarUI } from './helpers/ui'

const A = `${PREFIJO}org-a@example.test`
const B = `${PREFIJO}org-b@example.test`
const SIN_PROV = `${PREFIJO}org-sinprov@example.test`
const ADMIN = `${PREFIJO}org-admin@example.test`
const evidencia: Record<string, unknown> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  for (const e of [A, B, SIN_PROV, ADMIN]) await crearUsuarioConClave(e)
  asignarProvincia(A, 1)
  asignarProvincia(B, 2)
  asignarProvincia(ADMIN, 1)
  hacerAdmin(ADMIN)
})

test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.ORG_EVIDENCIA ?? 'test-results/organismos-evidencia.json', JSON.stringify(evidencia, null, 2))
})

test('7. alta (usuario_normal): provincia fija, aparece en la lista sin recargar, fuero solo lectura', async ({ page }) => {
  await entrarUI(page, A)
  await expect(page.getByTestId('organismos-vacio')).toBeVisible()

  await page.getByRole('link', { name: 'Nuevo organismo' }).click()
  await expect(page.locator('#provinciaId')).toBeDisabled()
  await expect(page.locator('#provinciaId')).toContainText(/\S/) // prellenada
  evidencia.provinciaPrellenada = (await page.locator('#provinciaId').textContent())?.trim()
  await expect(page.getByTestId('fuero-solo-lectura')).toContainText('Sin fuero asignado')
  // No existe ningún campo de propietario (FR-004).
  await expect(page.getByLabel(/propietari/i)).toHaveCount(0)

  await page.getByLabel('Denominación', { exact: true }).fill(`${PREFIJO}org de A`)
  await elegir(page, 'denominacionSimplificadaId', /./)
  await elegir(page, 'tipoOficinaId', 'oficina judicial')
  await page.getByRole('button', { name: 'Crear organismo' }).click()
  await expect(page.getByTestId('titulo-organismo')).toHaveText(`${PREFIJO}org de A`)
  await expect(page.getByTestId('fuero-solo-lectura')).toContainText('Sin fuero asignado')

  // Sin recargar la página: volver por el historial de la SPA (navegación de documento único,
  // sin request de documento). La mutación invalidó la lista, así que ya trae el organismo nuevo.
  let recargas = 0
  page.on('request', (r) => { if (r.isNavigationRequest()) recargas++ })
  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL(/\/organismos$/)
  evidencia.navegacionesDeDocumento = recargas
  expect(recargas).toBe(0)
  await expect(page.getByTestId('fila-organismo')).toHaveCount(1)
  await expect(page.getByTestId('fila-organismo')).toContainText('Propio')
  evidencia.altaNormal = { filas: 1 }
})

test('8. usuario sin provincia: alta bloqueada con explicación', async ({ page }) => {
  await entrarUI(page, SIN_PROV)
  await page.goto('/organismos/nuevo')
  await expect(page.getByTestId('alta-sin-provincia')).toContainText('completar tu provincia')
  await expect(page.getByRole('button', { name: 'Crear organismo' })).toHaveCount(0)
})

test('9. admin: provincia editable en el alta y en la edición', async ({ page }) => {
  await entrarUI(page, ADMIN)
  await page.goto('/organismos/nuevo')
  await expect(page.locator('#provinciaId')).toBeEnabled()
  await page.getByLabel('Denominación', { exact: true }).fill(`${PREFIJO}org de admin`)
  await elegir(page, 'denominacionSimplificadaId', /./)
  await elegir(page, 'tipoOficinaId', 'oficina judicial')
  await page.getByRole('button', { name: 'Crear organismo' }).click()
  await expect(page.getByTestId('titulo-organismo')).toHaveText(`${PREFIJO}org de admin`)

  const id = page.url().match(/organismos\/(\d+)/)![1]
  const antes = sql(`SELECT provincia_id FROM organismos WHERE id = ${id}`)
  await expect(page.locator('#provinciaId')).toBeEnabled()
  const actual = (await page.locator('#provinciaId').textContent())?.trim()
  await page.locator('#provinciaId').click()
  const opciones = (await page.getByRole('option').allTextContents()).map((o) => o.trim())
  const otra = opciones.find((o) => o !== actual)!
  await page.getByRole('option', { name: otra, exact: true }).click()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByTestId('mensaje-datos')).toContainText('Cambios guardados')
  const despues = sql(`SELECT provincia_id FROM organismos WHERE id = ${id}`)
  evidencia.provinciaAdmin = { antes, despues }
  expect(despues).not.toBe(antes)
})

test('9b. usuario_normal: la provincia de un organismo no es editable', async ({ page }) => {
  await entrarUI(page, A)
  await page.getByTestId('fila-organismo').getByRole('link').click()
  await expect(page.locator('#provinciaId')).toBeDisabled()
})

test('10. organismo ajeno por URL => No autorizado (403), no una pantalla vacía', async ({ page }) => {
  const idDeA = sql(`SELECT o.id FROM organismos o JOIN usuarios u ON u.id = o.propietario_id WHERE u.email = '${A}' LIMIT 1`)
  await entrarUI(page, B)
  const respuestas: number[] = []
  page.on('response', (r) => {
    if (r.url().endsWith(`/api/organismos/${idDeA}`)) respuestas.push(r.status())
  })
  await page.goto(`/organismos/${idDeA}`)
  await expect(page.getByRole('heading', { name: 'No autorizado' })).toBeVisible()
  evidencia.ajeno = { organismo: idDeA, statusDelBackend: respuestas }
  expect(respuestas).toContain(403)
  // La lista de B no lo incluye.
  await page.goto('/organismos')
  await expect(page.getByTestId('fila-organismo')).toHaveCount(0)
})

test('14. Protección B: cambiar el tipo con respuestas exige confirmar y lista qué se pierde', async ({ page }) => {
  const api = await sesionApi(A)
  const creado = await api.post('/api/organismos', {
    denominacion: `${PREFIJO}org taxonomia`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1,
  })
  const id = creado.json.id as string
  const preguntas = (await api.get('/api/taxonomia/preguntas?tipoOficinaId=1')).json as {
    codigo: string; texto: string; tipoRespuesta: string; opciones?: { codigo: string }[]
  }[]
  const unica = preguntas.find((p) => p.tipoRespuesta === 'opcion_unica')!
  const put = await api.put(`/api/organismos/${id}/taxonomia`, {
    respuestas: [{ preguntaCodigo: unica.codigo, opcionesCodigos: [unica.opciones![0]!.codigo] }],
  })
  expect(put.status).toBe(200)

  await entrarUI(page, A)
  await page.goto(`/organismos/${id}`)
  const tipoAntes = sql(`SELECT tipo_oficina_id FROM organismos WHERE id = ${id}`)
  await elegir(page, 'tipoOficinaId', 'coordinación')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  // Diálogo: lista la pregunta que se perdería; hasta confirmar no cambió nada.
  const lista = page.getByTestId('preguntas-por-perder')
  await expect(lista).toContainText(unica.texto)
  expect(sql(`SELECT tipo_oficina_id FROM organismos WHERE id = ${id}`)).toBe(tipoAntes)
  await page.getByRole('button', { name: 'Cancelar' }).click()
  expect(sql(`SELECT tipo_oficina_id FROM organismos WHERE id = ${id}`)).toBe(tipoAntes)
  expect(sql(`SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = ${id}`)).toBe('1')

  // Confirmar: se reenvía con confirmarPerdidaTaxonomia y recién ahí cambia y se borran las respuestas.
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await page.getByRole('button', { name: 'Cambiar el tipo y eliminar' }).click()
  await expect(page.getByTestId('mensaje-datos')).toContainText('Cambios guardados')
  const tipoDespues = sql(`SELECT tipo_oficina_id FROM organismos WHERE id = ${id}`)
  const respuestasDespues = sql(`SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = ${id}`)
  evidencia.proteccionB = { pregunta: unica.texto, tipoAntes, tipoDespues, respuestasDespues }
  expect(tipoDespues).not.toBe(tipoAntes)
  expect(respuestasDespues).toBe('0')
})
