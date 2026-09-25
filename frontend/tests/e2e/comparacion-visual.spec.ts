import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { asignarProvincia, crearUsuarioConClave, limpiarFixtures, PREFIJO, sesionApi, sql } from './helpers/backend'
import { entrarUI } from './helpers/ui'

// SC-007: comparación visual lado a lado entre la SPA vieja (`src/` de la raíz, SIN modificar, con Firebase
// reemplazado por un stub con datos sintéticos — ver tests/visual/spa-vieja/) y la app nueva, en las pantallas
// equivalentes. Requiere VIEJA_URL (p. ej. http://localhost:5180). Ambas con datos SINTÉTICOS.
const VIEJA = process.env.VIEJA_URL
const OUT = process.env.VISUAL_DIR ?? 'test-results'
const U = `${PREFIJO}cmp@example.test`
const VIEWPORT = { width: 1280, height: 720 }

type Pantalla = 'menu-lista' | 'alta' | 'taxonomia'
const capturas: Record<string, { vieja: Buffer; nueva: Buffer }> = {}
const metricas: Record<string, unknown> = {}

test.skip(!VIEJA, 'Falta VIEJA_URL (SPA vieja levantada con tests/visual/spa-vieja/run.sh)')
test.describe.configure({ mode: 'serial' })
test.use({ viewport: VIEWPORT })

/** Rasgos objetivos de la pantalla, medidos en el DOM (no opinión). */
async function rasgos(page: Page) {
  return page.evaluate(() => {
    const cs = (el: Element | null) => (el ? getComputedStyle(el) : null)
    const botones = [...document.querySelectorAll('button, a')].filter((e) => {
      const c = getComputedStyle(e)
      return c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'rgb(255, 255, 255)' && /^(Ver|Crear|Guardar|Nuevo|Iniciar|Mis)/.test(e.textContent?.trim() ?? '')
    })
    return {
      fuente: cs(document.body)!.fontFamily.split(',')[0]!.replace(/"/g, '').trim(),
      fondoPagina: cs(document.body)!.backgroundColor === 'rgba(0, 0, 0, 0)' ? cs(document.querySelector('#root > div'))?.backgroundColor ?? '' : cs(document.body)!.backgroundColor,
      botonPrincipal: botones[0] ? getComputedStyle(botones[0]).backgroundColor : null,
      barraLateral: !!document.querySelector('[data-slot="sidebar"]'),
      migasDePan: !!document.querySelector('nav[aria-label="breadcrumb"]'),
      selectsNativos: document.querySelectorAll('select').length,
      radios: document.querySelectorAll('input[type="radio"], [role="radio"]').length,
      pestanas: document.querySelectorAll('[role="tab"]').length + document.querySelectorAll('nav[aria-label="Secciones del organismo"] a').length,
      tarjetas: document.querySelectorAll('[class*="rounded-xl"][class*="border"], [class*="shadow"]').length,
    }
  })
}

/**
 * Similitud de "tinta" (Jaccard): se marca como tinta todo píxel que difiere del color de fondo dominante de
 * SU propia imagen, y se mide cuánta tinta está en el mismo lugar en ambas (intersección / unión). Una copia
 * visual daría ~1; pantallas de diseño distinto, valores bajos. Se usa esto y no la diferencia cruda de píxeles
 * porque las dos pantallas son mayormente fondo claro y esa diferencia queda artificialmente baja (5 % en la
 * primera medición, aun siendo pantallas evidentemente distintas). Umbral fijado ANTES de medir: una copia
 * visual superaría 0,8; se exige < 0,5.
 */
function similitudDeTinta(a: Buffer, b: Buffer) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b)
  const mascara = (img: PNG) => {
    const cuenta = new Map<number, number>()
    for (let i = 0; i < img.data.length; i += 4) {
      const k = (img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!
      cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
    }
    const fondo = [...cuenta.entries()].sort((x, y) => y[1] - x[1])[0]![0]
    const [fr, fg, fb] = [(fondo >> 16) & 255, (fondo >> 8) & 255, fondo & 255]
    const m = new Uint8Array(img.width * img.height)
    for (let p = 0; p < m.length; p++) {
      const d = Math.abs(img.data[p * 4]! - fr) + Math.abs(img.data[p * 4 + 1]! - fg) + Math.abs(img.data[p * 4 + 2]! - fb)
      m[p] = d > 60 ? 1 : 0
    }
    return m
  }
  const [ma, mb] = [mascara(A), mascara(B)]
  let inter = 0, union = 0
  for (let i = 0; i < ma.length; i++) { if (ma[i] && mb[i]) inter++; if (ma[i] || mb[i]) union++ }
  return Number((inter / union).toFixed(2))
}

function diferencia(a: Buffer, b: Buffer) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b)
  expect([A.width, A.height]).toEqual([B.width, B.height])
  const diff = new PNG({ width: A.width, height: A.height })
  const n = pixelmatch(A.data, B.data, diff.data, A.width, A.height, { threshold: 0.1 })
  return Number(((n / (A.width * A.height)) * 100).toFixed(1))
}

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(U)
  asignarProvincia(U, 1)
  const api = await sesionApi(U)
  const loc = Number(sql('SELECT id FROM localidades WHERE provincia_id = 1 ORDER BY id LIMIT 1'))
  const crear = async (nombre: string, tipo: number) =>
    (await api.post('/api/organismos', { denominacion: `${PREFIJO}${nombre}`, denominacionSimplificadaId: 1, tipoOficinaId: tipo, provinciaId: 1 })).json.id as string
  const a = await crear('Organismo de ejemplo A', 1)
  const b = await crear('Organismo de ejemplo B', 2)
  await crear('Organismo de ejemplo C', 3)
  for (const [org, n] of [[a, 2], [b, 1]] as const) for (let i = 0; i < n; i++) await api.post(`/api/organismos/${org}/unidades-funcionales`, { denominacionUnidad: `Unidad de ejemplo ${i + 1}`, localidadId: loc, tipoUfId: 1 })
  const preguntas = (await api.get('/api/taxonomia/preguntas?tipoOficinaId=1')).json as { codigo: string; opciones: { codigo: string }[] }[]
  await api.put(`/api/organismos/${a}/taxonomia`, { respuestas: preguntas.slice(0, 4).map((p) => ({ preguntaCodigo: p.codigo, opcionesCodigos: [p.opciones[0]!.codigo] })) })
})
test.afterAll(() => {
  limpiarFixtures()
  writeFileSync(`${OUT}/comparacion-visual-metricas.json`, JSON.stringify(metricas, null, 2))
})

async function guardar(pantalla: Pantalla, lado: 'vieja' | 'nueva', page: Page, fullPage = false) {
  const buf = await page.screenshot({ fullPage: false })
  capturas[pantalla] = { ...(capturas[pantalla] ?? { vieja: Buffer.alloc(0), nueva: Buffer.alloc(0) }), [lado]: buf }
  const r = await rasgos(page)
  metricas[pantalla] = { ...(metricas[pantalla] as object), [lado]: r }
  void fullPage
}

test('SPA vieja: menú, lista, alta y taxonomía', async ({ page }) => {
  await page.goto(VIEJA!)
  await expect(page.getByText('Selecciona una opción:')).toBeVisible()
  await guardar('menu-lista', 'vieja', page) // el menú principal es lo primero que ve el usuario (la lista está un clic más allá)
  // La SPA vieja redirige a `/` en cada carga (verificarUsuario -> navigate('/')): se navega SOLO con clics.
  await page.getByRole('link', { name: 'Mis Organismos' }).click()
  await expect(page.getByText('Organismo de ejemplo A')).toBeVisible()
  await expect(page.getByText('Unidades Funcionales: 2')).toBeVisible()
  await page.screenshot({ path: `${OUT}/vieja-lista.png` })
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('link', { name: 'Crear Organismo' }).click()
  await expect(page.getByRole('heading', { name: 'Crear Organismo' })).toBeVisible()
  await guardar('alta', 'vieja', page)
  await page.getByRole('button', { name: 'Volver al menú' }).click()
  await page.getByRole('link', { name: 'Mis Organismos' }).click()
  await page.getByRole('button', { name: 'Ver detalle' }).first().click()
  await page.getByRole('tab', { name: 'Taxonomía' }).click()
  await expect(page.getByText('Valor actual:').first()).toBeVisible()
  await guardar('taxonomia', 'vieja', page)
})

test('App nueva: lista, alta y taxonomía (mismos datos sintéticos)', async ({ page }) => {
  // Solo para la captura: se quita el prefijo de fixtures de los nombres que llegan al navegador.
  const sinPrefijo = (o: unknown): unknown => JSON.parse(JSON.stringify(o).replaceAll(PREFIJO, ''))
  await page.route('**/api/organismos', async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, json: sinPrefijo(await r.json()) }) })
  await page.route('**/api/organismos/*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const r = await route.fetch(); await route.fulfill({ response: r, json: sinPrefijo(await r.json()) })
  })
  await entrarUI(page, U)
  await expect(page.getByText('Organismo de ejemplo A')).toBeVisible()
  await guardar('menu-lista', 'nueva', page)
  await page.goto('/organismos/nuevo')
  await expect(page.getByRole('button', { name: 'Crear organismo' })).toBeVisible()
  await guardar('alta', 'nueva', page)
  await page.goto('/organismos')
  await page.getByRole('link', { name: 'Organismo de ejemplo A' }).click()
  await page.getByRole('link', { name: 'Taxonomía' }).click()
  await expect(page.getByTestId('form-taxonomia')).toBeVisible()
  await guardar('taxonomia', 'nueva', page)
})

test('composición lado a lado y medición de la diferencia', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true })
  const titulos: Record<Pantalla, [string, string, string]> = {
    'menu-lista': ['Primera pantalla tras entrar / navegación', 'SPA vieja: menú de botones (`/`)', 'App nueva: lista con barra lateral (`/organismos`)'],
    alta: ['Alta de organismo', 'SPA vieja: `/crear-organismo`', 'App nueva: `/organismos/nuevo`'],
    taxonomia: ['Taxonomía de un organismo', 'SPA vieja: detalle › pestaña Taxonomía', 'App nueva: `/organismos/:id/taxonomia`'],
  }
  const ctx = await browser.newContext({ viewport: { width: 2600, height: 860 } })
  const page = await ctx.newPage()
  for (const p of Object.keys(capturas) as Pantalla[]) {
    const { vieja, nueva } = capturas[p]!
    const [titulo, izq, der] = titulos[p]
    const img = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`
    await page.setContent(`<body style="margin:0;font:16px system-ui;background:#eee"><h2 style="margin:12px 20px">${titulo}</h2>
      <div style="display:flex;gap:20px;padding:0 20px 20px"><figure style="margin:0"><figcaption style="padding:4px 0">${izq}</figcaption><img src="${img(vieja)}" style="border:2px solid #888;width:1280px"></figure>
      <figure style="margin:0"><figcaption style="padding:4px 0">${der}</figcaption><img src="${img(nueva)}" style="border:2px solid #888;width:1280px"></figure></div></body>`)
    await page.screenshot({ path: `${OUT}/comparacion-${p}.png`, fullPage: true })
    const pct = diferencia(vieja, nueva)
    const sim = similitudDeTinta(vieja, nueva)
    metricas[p] = { ...(metricas[p] as object), pixelesDistintosPorcentaje: pct, similitudDeTintaJaccard: sim }
    expect(sim, `${p}: una copia visual superaría 0,8`).toBeLessThan(0.5)
  }
  await ctx.close()

  // Controles de la métrica: mide algo (1 para la misma imagen) y qué valor da "mismo diseño, otra pantalla".
  const c = capturas
  metricas.controles = {
    mismaImagen: similitudDeTinta(c.taxonomia!.vieja, c.taxonomia!.vieja),
    viejaAltaVsViejaTaxonomia: similitudDeTinta(c.alta!.vieja, c.taxonomia!.vieja),
    nuevaAltaVsNuevaTaxonomia: similitudDeTinta(c.alta!.nueva, c.taxonomia!.nueva),
    viejaMenuVsViejaAlta: similitudDeTinta(c['menu-lista']!.vieja, c.alta!.vieja),
    nuevaListaVsNuevaAlta: similitudDeTinta(c['menu-lista']!.nueva, c.alta!.nueva),
  }
  expect((metricas.controles as { mismaImagen: number }).mismaImagen).toBe(1)
})
