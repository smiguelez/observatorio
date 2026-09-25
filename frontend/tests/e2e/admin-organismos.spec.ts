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

test('20. completitud: estados correctos, progreso visible, concurrencia ≤ 6, y cada fila coincide con la base', async ({ page }) => {
  // Medición a nivel de aplicación: envuelve fetch y cuenta las llamadas a la API sin resolver. Es lo que
  // limita la cola (una tarea no pide lo siguiente hasta terminar la anterior). Los eventos de red de
  // Playwright llegan con un pequeño desfase (una request nueva se ve antes que el `requestfinished` de la
  // anterior), por eso se informan aparte y no se usan como cota.
  await page.addInitScript(() => {
    const w = window as unknown as { __enVuelo: number; __maximo: number }
    w.__enVuelo = 0
    w.__maximo = 0
    ;(w as unknown as { __urls: Set<string>; __enMax: string[] }).__urls = new Set()
    ;(w as unknown as { __enMax: string[] }).__enMax = []
    const original = window.fetch.bind(window)
    window.fetch = async (...args) => {
      const url = String(args[0] instanceof Request ? args[0].url : args[0])
      // Solo las llamadas de la evaluación: se excluye la lista `/api/organismos`, que TanStack Query
      // refetchea en segundo plano al montar (ya estaba en caché desde /organismos) y no forma parte de la cola.
      const api = url.startsWith('/api/') && !url.startsWith('/api/auth/') && url !== '/api/organismos'
      const ww = w as unknown as { __urls: Set<string>; __enMax: string[] }
      if (api) { ww.__urls.add(url); w.__enVuelo++; if (w.__enVuelo > w.__maximo) { w.__maximo = w.__enVuelo; ww.__enMax = [...ww.__urls] } }
      try { return await original(...args) } finally { if (api) { w.__enVuelo--; ww.__urls.delete(url) } }
    }
  })
  await entrarUI(page, ADM)
  let enVuelo = 0, maximo = 0, total = 0
  page.on('request', (r) => { if (esApi(r.url())) { total++; maximo = Math.max(maximo, ++enVuelo) } })
  page.on('requestfinished', (r) => { if (esApi(r.url())) enVuelo-- })
  page.on('requestfailed', (r) => { if (esApi(r.url())) enVuelo-- })

  const t0 = Date.now()
  await page.getByRole('link', { name: 'Gestión de organismos' }).click()
  await expect(page.getByTestId('progreso')).toBeVisible()
  await expect(page.getByTestId('resumen-completitud')).toBeVisible({ timeout: 120_000 })
  const ms = Date.now() - t0

  const filas = page.getByTestId('fila-completitud')
  const cantidad = await filas.count()
  const enBase = Number(sql('SELECT count(*) FROM organismos'))
  expect(cantidad).toBe(enBase)

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
  const maximoApp = await page.evaluate(() => (window as unknown as { __maximo: number }).__maximo)
  evidencia.enVueloAlMaximoDeLaEvaluacion = await page.evaluate(() => (window as unknown as { __enMax: string[] }).__enMax)
  evidencia.medicion = { organismos: cantidad, requestsDeApi: total, maximoEnVueloSegunLaApp: maximoApp, maximoEnVueloSegunEventosDeRed: maximo, milisegundos: ms, resumen, completosSegunSql: completosSql, discrepanciasUiVsSql: discrepancias }
  expect(discrepancias).toBe(0)
  expect(resumen).toContain(`${completosSql} de ${enBase} organismos completos`)
  expect(maximoApp).toBeLessThanOrEqual(6) // la cola limita a 6 (la lista inicial ya había terminado)
  expect(maximo).toBeLessThanOrEqual(7) // eventos de red: incluyen el refetch de la lista (+1) y el desfase descrito arriba
  // Sin captura acá: esta pantalla muestra datos reales; las imágenes salen de evidencia-visual.spec.ts (anonimizadas).
})

test('20b. filtros por estado', async ({ page }) => {
  await entrarUI(page, ADM)
  await page.goto('/admin/organismos')
  await expect(page.getByTestId('resumen-completitud')).toBeVisible({ timeout: 120_000 })
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
})

test('20c. exportar PDF: un archivo válido con la misma información que la pantalla', async ({ page }) => {
  await entrarUI(page, ADM)
  await page.goto('/admin/organismos')
  const boton = page.getByRole('button', { name: 'Exportar PDF' })
  await expect(boton).toBeDisabled() // hasta terminar de evaluar
  await expect(page.getByTestId('resumen-completitud')).toBeVisible({ timeout: 120_000 })
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
