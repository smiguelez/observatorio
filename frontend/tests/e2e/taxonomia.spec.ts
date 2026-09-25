import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { asignarProvincia, crearUsuarioConClave, limpiarFixtures, PREFIJO, sesionApi, sql, type ApiSesion } from './helpers/backend'
import { entrarUI } from './helpers/ui'

const U = `${PREFIJO}tax@example.test`
const evidencia: Record<string, unknown> = {}
let api: ApiSesion

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(U)
  asignarProvincia(U, 1)
  api = await sesionApi(U)
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.TAX_EVIDENCIA ?? 'test-results/taxonomia-evidencia.json', JSON.stringify(evidencia, null, 2))
})

async function crearOrg(nombre: string, tipoOficinaId: number): Promise<string> {
  const r = await api.post('/api/organismos', { denominacion: `${PREFIJO}${nombre}`, denominacionSimplificadaId: 1, tipoOficinaId, provinciaId: 1 })
  expect(r.status).toBe(201)
  return r.json.id as string
}

test('11. formulario dinámico: los 9 controles, precarga, guardar conserva todo', async ({ page }) => {
  const id = await crearOrg('org tax', 1)
  const catalogo = (await api.get('/api/taxonomia/preguntas?tipoOficinaId=1')).json as {
    codigo: string; tipoRespuesta: string; opciones: { codigo: string; etiqueta: string }[]
  }[]
  // Fixture: 3 preguntas ya respondidas (la 1ª, 2ª y 3ª).
  const previas = catalogo.slice(0, 3)
  const put = await api.put(`/api/organismos/${id}/taxonomia`, {
    respuestas: previas.map((p) => ({ preguntaCodigo: p.codigo, opcionesCodigos: [p.opciones[0]!.codigo] })),
  })
  expect(put.status).toBe(200)
  expect(sql(`SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = ${id}`)).toBe('3')

  await entrarUI(page, U)
  await page.goto(`/organismos/${id}/taxonomia`)
  const preguntas = page.locator('[data-testid^="pregunta-"]')
  await expect(preguntas).toHaveCount(catalogo.length)
  evidencia.preguntasRenderizadas = await preguntas.count()

  // Tipos de respuesta presentes en el catálogo REAL y el control que se dibuja para cada uno.
  const tipos = [...new Set(catalogo.map((p) => p.tipoRespuesta))]
  evidencia.tiposEnLaBase = tipos
  for (const p of catalogo) {
    const bloque = page.getByTestId(`pregunta-${p.codigo}`)
    await expect(bloque).toHaveAttribute('data-tipo', p.tipoRespuesta)
    if (p.tipoRespuesta === 'opcion_unica') await expect(bloque.getByRole('radio')).toHaveCount(p.opciones.length)
    // El enunciado no es el identificador crudo (snake_case).
    await expect(bloque.locator('legend')).not.toHaveText(/_/)
  }
  // Precarga: la opción A (la primera) de cada pregunta ya respondida viene marcada.
  for (const p of previas) {
    await expect(page.getByTestId(`pregunta-${p.codigo}`).getByRole('radio').first()).toBeChecked()
  }

  // Cambiar una ya respondida y responder una nueva; guardar.
  const cambiada = previas[0]!, nueva = catalogo[5]!
  await page.getByTestId(`pregunta-${cambiada.codigo}`).getByRole('radio').nth(1).check()
  await page.getByTestId(`pregunta-${nueva.codigo}`).getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Guardar taxonomía' }).click()
  await expect(page.getByTestId('taxonomia-guardada')).toBeVisible()

  const filas = sql(`SELECT p.codigo || ':' || o.codigo FROM evaluaciones_taxonomicas e JOIN taxonomia_preguntas p ON p.id=e.pregunta_id JOIN taxonomia_opciones o ON o.id=e.opcion_id WHERE e.organismo_id = ${id} ORDER BY p.orden`).split('\n')
  evidencia.respuestasEnBase = filas
  // 3 previas (una modificada) + 1 nueva = 4: NINGUNA se borró por omisión.
  expect(filas).toHaveLength(4)
  expect(filas).toContain(`${cambiada.codigo}:${cambiada.opciones[1]!.codigo}`)
  expect(filas).toContain(`${previas[1]!.codigo}:${previas[1]!.opciones[0]!.codigo}`)
  expect(filas).toContain(`${nueva.codigo}:${nueva.opciones[0]!.codigo}`)

  // Recargar: lo guardado vuelve precargado.
  await page.reload()
  await expect(page.getByTestId(`pregunta-${cambiada.codigo}`).getByRole('radio').nth(1)).toBeChecked()
  await expect(page.getByTestId(`pregunta-${nueva.codigo}`).getByRole('radio').first()).toBeChecked()
  await page.screenshot({ path: process.env.TAX_PNG ?? 'test-results/taxonomia.png', fullPage: true })
})

test('12. tipo sin preguntas aplicables (coordinación): mensaje explícito, sin formulario ni request de respuestas', async ({ page }) => {
  const id = await crearOrg('org coordinacion', 3)
  await entrarUI(page, U)
  const pedidos: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/')) pedidos.push(`${r.method()} ${new URL(r.url()).pathname}${new URL(r.url()).search}`) })
  await page.goto(`/organismos/${id}/taxonomia`)
  await expect(page.getByTestId('sin-taxonomia')).toContainText('no tiene taxonomía')
  await expect(page.getByTestId('form-taxonomia')).toHaveCount(0)
  evidencia.pedidosSinTaxonomia = pedidos.filter((p) => p.includes('taxonomia'))
  expect(pedidos.some((p) => p.endsWith(`/api/organismos/${id}/taxonomia`))).toBe(false)
  expect(pedidos.some((p) => p.includes('/api/taxonomia/preguntas?tipoOficinaId=3'))).toBe(true)
})

test('13. error real del backend (400): mensaje completo junto al formulario', async ({ page }) => {
  const id = await crearOrg('org drift', 1)
  await entrarUI(page, U)
  await page.goto(`/organismos/${id}/taxonomia`)
  await expect(page.locator('[data-testid^="pregunta-"]').first()).toBeVisible()

  // Deriva real: entre que se cargó el formulario y se guarda, el tipo del organismo cambia (sin respuestas
  // no exige confirmación). Ahora las preguntas cargadas ya no aplican: el trigger de Protección A rechaza el PUT.
  const cambio = await api.patch(`/api/organismos/${id}`, { tipoOficinaId: 3 })
  expect(cambio.status).toBe(200)

  const estados: number[] = []
  page.on('response', (r) => { if (r.request().method() === 'PUT') estados.push(r.status()) })
  await page.locator('[data-testid^="pregunta-"]').first().getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Guardar taxonomía' }).click()
  const alerta = page.getByTestId('taxonomia-error')
  await expect(alerta).toBeVisible()
  evidencia.errorReal = { estadosPut: estados, mensaje: (await alerta.textContent())?.trim() }
  expect(estados).toEqual([400])
  await expect(alerta).toContainText('no aplica al tipo de organismo')
  expect(sql(`SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = ${id}`)).toBe('0')
})

test('13b. rechazo que nombra la pregunta (mock de red): se resalta la pregunta', async ({ page }) => {
  const id = await crearOrg('org mock', 1)
  const catalogo = (await api.get('/api/taxonomia/preguntas?tipoOficinaId=1')).json as { codigo: string }[]
  await entrarUI(page, U)
  await page.route(`**/api/organismos/${id}/taxonomia`, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: `Pregunta(s) inexistente(s): ${catalogo[2]!.codigo}` }) })
      : route.continue(),
  )
  await page.goto(`/organismos/${id}/taxonomia`)
  await page.locator('[data-testid^="pregunta-"]').first().getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Guardar taxonomía' }).click()
  await expect(page.getByTestId(`pregunta-${catalogo[2]!.codigo}`)).toHaveAttribute('data-invalid', 'true')
  await expect(page.getByTestId(`pregunta-${catalogo[0]!.codigo}`)).not.toHaveAttribute('data-invalid', 'true')
})
