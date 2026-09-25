import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { crearUsuarioConClave, hacerAdmin, limpiarFixtures, PREFIJO, sql } from './helpers/backend'
import { entrarUI } from './helpers/ui'

// Re-corrida de la evaluación de completitud (US7) SOLO sobre los organismos reales: no crea ningún
// organismo de prueba (solo un usuario admin), así que el universo de la app y el de SQL es la base tal cual.
const ADM = `${PREFIJO}real-admin@example.test`

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(ADM)
  hacerAdmin(ADM)
})
test.afterAll(() => limpiarFixtures())

test('completitud sobre los organismos reales: app y SQL sobre el mismo universo', async ({ page }) => {
  const universo = Number(sql('SELECT count(*) FROM organismos'))
  const deFixtures = Number(sql(`SELECT count(*) FROM organismos WHERE denominacion LIKE '${PREFIJO}%'`))
  await entrarUI(page, ADM)
  await page.getByRole('link', { name: 'Gestión de organismos' }).click()
  await expect(page.getByTestId('resumen-completitud')).toBeVisible({ timeout: 120_000 })

  const enUi = await page.getByTestId('fila-completitud').evaluateAll((els) => els.map((e) => [e.getAttribute('data-org-id')!, e.getAttribute('data-estado')!] as const))
  const filas = sql(`SELECT o.id || '|' || (
       EXISTS (SELECT 1 FROM unidades_funcionales u WHERE u.organismo_id = o.id)
       AND (NOT EXISTS (SELECT 1 FROM taxonomia_pregunta_tipos_oficina x WHERE x.tipo_oficina_id = o.tipo_oficina_id)
            OR EXISTS (SELECT 1 FROM evaluaciones_taxonomicas e WHERE e.organismo_id = o.id)))
     FROM organismos o ORDER BY o.id`).split('\n').map((l) => l.split('|') as [string, string])
  const esperado = new Map(filas)
  const idsUi = new Set(enUi.map(([id]) => id))
  const idsSql = new Set(esperado.keys())
  const soloEnUi = [...idsUi].filter((i) => !idsSql.has(i))
  const soloEnSql = [...idsSql].filter((i) => !idsUi.has(i))
  let discrepancias = 0
  for (const [id, est] of enUi) if ((est === 'completo') !== (esperado.get(id) === 'true')) discrepancias++
  const completosUi = enUi.filter(([, e]) => e === 'completo').length
  const completosSql = filas.filter(([, v]) => v === 'true').length
  const incompletos = enUi.filter(([, e]) => e === 'incompleto').map(([id]) => id)
  const resumen = (await page.getByTestId('resumen-completitud').textContent())?.trim()
  const r = { organismosEnBase: universo, deFixtures, filasEnUi: enUi.length, soloEnUi, soloEnSql, completosUi, completosSql, discrepancias, resumen, incompletos }
  writeFileSync(process.env.REALES_EVIDENCIA ?? 'test-results/reales.json', JSON.stringify(r, null, 2))
  expect(deFixtures).toBe(0)
  expect(enUi.length).toBe(universo)
  expect(soloEnUi).toEqual([])
  expect(soloEnSql).toEqual([])
  expect(discrepancias).toBe(0)
  expect(completosUi).toBe(completosSql)
})
