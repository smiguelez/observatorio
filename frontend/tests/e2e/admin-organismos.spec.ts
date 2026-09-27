import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { asignarProvincia, crearUsuarioConClave, hacerAdmin, limpiarFixtures, PREFIJO, sesionApi, sql } from './helpers/backend'
import { entrarUI } from './helpers/ui'

const P = `${PREFIJO}adm-owner@example.test`
const ADM = `${PREFIJO}adm-admin@example.test`
const NORMAL = `${PREFIJO}adm-normal@example.test`
const evidencia: Record<string, unknown> = {}
// Solo la API real (no los módulos del dev server, que también contienen '/api/' en su ruta: /src/api/*.ts).
const esApi = (url: string) => { const p = new URL(url).pathname; return p.startsWith('/api/') && !p.startsWith('/api/auth/') }
const ids: Record<string, string> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  for (const e of [P, ADM, NORMAL]) await crearUsuarioConClave(e)
  asignarProvincia(P, 1)
  hacerAdmin(ADM)
  const api = await sesionApi(P)
  const localidad = Number(sql('SELECT id FROM localidades WHERE provincia_id = 1 ORDER BY id LIMIT 1'))
  const crear = async (clave: string, tipo: number, conUf: boolean) => {
    const r = await api.post('/api/organismos', { denominacion: `${PREFIJO}${clave}`, denominacionSimplificadaId: 1, tipoOficinaId: tipo, provinciaId: 1 })
    ids[clave] = r.json.id
    if (conUf) await api.post(`/api/organismos/${r.json.id}/unidades-funcionales`, { denominacionUnidad: 'uf', localidadId: localidad, tipoUfId: 1 })
    return r.json.id as string
  }
  const completo = await crear('completo', 1, true)
  const preguntas = (await api.get('/api/taxonomia/preguntas?tipoOficinaId=1')).json as { codigo: string; opciones: { codigo: string }[] }[]
  await api.put(`/api/organismos/${completo}/taxonomia`, { respuestas: [{ preguntaCodigo: preguntas[0]!.codigo, opcionesCodigos: [preguntas[0]!.opciones[0]!.codigo] }] })
  await crear('sin-uf', 1, false)
  await crear('coordinacion', 3, true) // tipo sin preguntas: taxonomía completa con 0 respuestas
  await crear('sin-taxonomia', 1, true)
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.ADMORG_EVIDENCIA ?? 'test-results/admin-organismos-evidencia.json', JSON.stringify(evidencia, null, 2))
})

test('20. completitud: UNA sola solicitud a la API (no ~3 por organismo), estados correctos y cada fila coincide con la base', async ({ page }) => {
  await entrarUI(page, ADM)
  // Se espera a que termine lo de la pantalla anterior (la lista de "Mis organismos" y su refetch en segundo plano) para medir SOLO
  // lo que hace la pantalla de gestión.
  await expect(page.getByRole('heading', { name: 'Mis organismos' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  // Cada llamada a la API real desde que se abre la pantalla (se excluye auth y los módulos del dev server).
  const llamadas: { metodo: string; ruta: string }[] = []
  page.on('request', (r) => { if (esApi(r.url())) llamadas.push({ metodo: r.method(), ruta: new URL(r.url()).pathname }) })

  const t0 = Date.now()
  await page.getByRole('link', { name: 'Gestión de organismos' }).click()
  await expect(page.getByTestId('resumen-completitud')).toBeVisible({ timeout: 30_000 })
  const ms = Date.now() - t0

  const filas = page.getByTestId('fila-completitud')
  const cantidad = await filas.count()
  const enBase = Number(sql('SELECT count(*) FROM organismos'))
  expect(cantidad).toBe(enBase)

  // 009: ANTES eran ~3 llamadas por organismo (detalle, unidades, taxonomía) + el catálogo por tipo (~341 con 118 organismos).
  // AHORA es exactamente una: el endpoint agregado. Nada por fila.
  const completitud = llamadas.filter((l) => l.ruta === '/api/organismos/completitud')
  const porFila = llamadas.filter((l) => /^\/api\/organismos\/\d+/.test(l.ruta) || l.ruta.startsWith('/api/taxonomia/'))
  expect(completitud).toEqual([{ metodo: 'GET', ruta: '/api/organismos/completitud' }])
  expect(porFila).toEqual([])
  expect(llamadas).toHaveLength(1) // ni siquiera la lista de organismos: la pantalla no necesita nada más

  // Los cuatro fixtures, con su estado esperado.
  const estado = (clave: string) => page.locator(`[data-org-id="${ids[clave]}"]`)
  await expect(estado('completo')).toHaveAttribute('data-estado', 'completo')
  await expect(estado('sin-uf')).toHaveAttribute('data-estado', 'incompleto')
  await expect(estado('sin-uf').locator('[data-col="unidades"] [data-estado]')).toHaveAttribute('data-estado', 'incompleto')
  await expect(estado('coordinacion')).toHaveAttribute('data-estado', 'completo') // taxonomía completa sin respuestas
  await expect(estado('coordinacion')).toContainText('sin preguntas aplicables')
  await expect(estado('sin-taxonomia')).toHaveAttribute('data-estado', 'incompleto')
  await expect(estado('sin-taxonomia').locator('[data-col="taxonomia"] [data-estado]')).toHaveAttribute('data-estado', 'incompleto')

  // Verdad independiente: el mismo criterio calculado por SQL, para TODOS los organismos.
  const esperado = new Map(
    sql(`SELECT o.id || '|' || (
           EXISTS (SELECT 1 FROM unidades_funcionales u WHERE u.organismo_id = o.id)
           AND (NOT EXISTS (SELECT 1 FROM taxonomia_pregunta_tipos_oficina x WHERE x.tipo_oficina_id = o.tipo_oficina_id)
                OR EXISTS (SELECT 1 FROM evaluaciones_taxonomicas e WHERE e.organismo_id = o.id)))
         FROM organismos o ORDER BY o.id`)
      .split('\n').map((l) => l.split('|') as [string, string]),
  )
  const enUi = await filas.evaluateAll((els) => els.map((e) => [e.getAttribute('data-org-id')!, e.getAttribute('data-estado')!] as const))
  let discrepancias = 0
  for (const [id, est] of enUi) if ((est === 'completo') !== (esperado.get(id) === 'true')) discrepancias++
  const completosSql = [...esperado.values()].filter((v) => v === 'true').length

  const resumen = (await page.getByTestId('resumen-completitud').textContent())?.trim()
  evidencia.medicion = { organismos: cantidad, solicitudesDeApi: llamadas.length, solicitudesPorFila: porFila.length, anteriormenteAprox: cantidad * 3 + 4, milisegundos: ms, resumen, completosSegunSql: completosSql, discrepanciasUiVsSql: discrepancias }
  expect(discrepancias).toBe(0)
  expect(resumen).toContain(`${completosSql} de ${enBase} organismos completos`)
  // Sin captura acá: esta pantalla muestra datos reales; las imágenes salen de evidencia-visual.spec.ts (anonimizadas).
})

test('20b. filtros por estado (sobre lo ya cargado: no piden nada más)', async ({ page }) => {
  await entrarUI(page, ADM)
  await page.goto('/admin/organismos')
  await expect(page.getByTestId('resumen-completitud')).toBeVisible({ timeout: 30_000 })
  const solicitudes: string[] = []
  page.on('request', (r) => { if (esApi(r.url())) solicitudes.push(r.url()) })
  const distintos = () =>
    page.getByTestId('fila-completitud').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-estado')))].sort().join(','))
  const cuantas = () => page.getByTestId('fila-completitud').count()

  await page.getByRole('button', { name: 'Incompletos' }).click()
  await expect.poll(distintos).toBe('incompleto') // espera el re-render del filtro
  const incompletos = await cuantas()
  expect(incompletos).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Completos', exact: true }).click()
  await expect.poll(distintos).toBe('completo')
  const completos = await cuantas()

  await page.getByRole('button', { name: 'Todos', exact: true }).click()
  await expect.poll(cuantas).toBe(incompletos + completos)
  expect(solicitudes).toEqual([]) // cambiar de filtro no pide nada al servidor
})

test('20c. exportar PDF: un archivo válido con la misma información que la pantalla', async ({ page }) => {
  // La respuesta llega casi al instante: se demora a propósito para verificar que el botón está deshabilitado hasta tener los datos.
  await page.route('**/api/organismos/completitud', async (route) => {
    await new Promise((r) => setTimeout(r, 1000))
    await route.continue()
  })
  await entrarUI(page, ADM)
  await page.goto('/admin/organismos')
  const boton = page.getByRole('button', { name: 'Exportar PDF' })
  await expect(boton).toBeDisabled() // hasta tener los datos
  await expect(page.getByTestId('progreso')).toBeVisible() // indicador de carga mientras espera
  await expect(page.getByTestId('resumen-completitud')).toBeVisible({ timeout: 30_000 })
  await expect(boton).toBeEnabled()
  const resumen = (await page.getByTestId('resumen-completitud').textContent())!.trim()
  const m = resumen.match(/(\d+) de (\d+) organismos completos/)!

  const [descarga] = await Promise.all([page.waitForEvent('download'), boton.click()])
  const destino = process.env.ADMORG_PDF ?? 'test-results/completitud.pdf'
  await descarga.saveAs(destino)
  const bytes = readFileSync(destino)
  const texto = bytes.toString('latin1')
  evidencia.pdf = { archivo: descarga.suggestedFilename(), bytes: bytes.length, empiezaConPdf: texto.startsWith('%PDF-'), paginas: (texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length }
  expect(texto.startsWith('%PDF-')).toBe(true)
  expect(descarga.suggestedFilename()).toMatch(/^completitud-organismos-\d{4}-\d{2}-\d{2}\.pdf$/)
  expect(texto).toContain(`${m[1]} de ${m[2]} organismos completos`) // el mismo resumen que en pantalla
  for (const clave of ['completo', 'sin-uf', 'coordinacion', 'sin-taxonomia']) expect(texto).toContain(`${PREFIJO}${clave}`)
})

test('un usuario normal en /admin/organismos ve lo mismo que una ruta inexistente', async ({ page }) => {
  await entrarUI(page, NORMAL)
  await page.goto('/admin/organismos')
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
  await expect(page.getByTestId('progreso')).toHaveCount(0)
})
