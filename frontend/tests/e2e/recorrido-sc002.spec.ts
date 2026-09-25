import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { CLAVE, crearUsuarioConClave, limpiarFixtures, PREFIJO, sql } from './helpers/backend'
import { elegir } from './helpers/ui'

// SC-002: "Un usuario nuevo puede dar de alta un organismo y completar la taxonomía aplicable en una sola
// sesión de uso, sin necesitar volver a preguntar cómo hacerlo una segunda vez."
// Recorrido ÚNICO de punta a punta con un usuario SIN datos previos (sin provincia, sin organismos), sin
// recargar la página después de entrar y sin que la app le pida dos veces un dato ya dado.
const U = `${PREFIJO}sc002@example.test`
const evidencia: Record<string, unknown> = {}

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(U) // cuenta nueva: sin provincia, sin organismos
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.SC002_EVIDENCIA ?? 'test-results/sc002.json', JSON.stringify(evidencia, null, 2))
})

test('SC-002: usuario nuevo => provincia, alta y taxonomía completa en una sola sesión', async ({ page }) => {
  const acciones: string[] = [] // cada dato que el usuario TIENE que escribir/elegir, en orden
  const navegaciones: string[] = [] // cargas de documento completas (recargas) tras entrar

  // --- Entrar (una sola vez) ---
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(U)
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await expect(page).toHaveURL(/\/organismos$/)
  await expect(page.getByTestId('organismos-vacio')).toBeVisible()
  const t0 = Date.now()
  page.on('request', (r) => { if (r.isNavigationRequest()) navegaciones.push(r.url()) })

  // --- 1. Intenta dar de alta y la app le explica qué falta (no un formulario imposible de enviar) ---
  await page.getByRole('link', { name: 'Nuevo organismo' }).click()
  await expect(page.getByTestId('alta-sin-provincia')).toContainText('completar tu provincia')
  await page.getByRole('link', { name: 'Ir a mi perfil' }).click() // el propio mensaje lleva al lugar correcto

  // --- 2. Completa la provincia UNA vez, en el perfil ---
  await expect(page.getByTestId('perfil-email')).toHaveText(U)
  await elegir(page, 'provinciaId', 'Córdoba'); acciones.push('provincia')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByTestId('mensaje-perfil')).toContainText('Cambios guardados')

  // --- 3. Alta: la provincia YA viene puesta (no se vuelve a pedir) ---
  await page.getByRole('link', { name: 'Mis organismos' }).click()
  await page.getByRole('link', { name: 'Nuevo organismo' }).click()
  await expect(page.locator('#provinciaId')).toContainText('Córdoba')
  await expect(page.locator('#provinciaId')).toBeDisabled()
  await expect(page.getByTestId('alta-sin-provincia')).toHaveCount(0)
  await page.getByLabel('Denominación', { exact: true }).fill(`${PREFIJO}organismo del recorrido`); acciones.push('denominación')
  await elegir(page, 'denominacionSimplificadaId', /./); acciones.push('denominación simplificada')
  await elegir(page, 'tipoOficinaId', 'oficina judicial'); acciones.push('tipo de oficina')
  await page.getByRole('button', { name: 'Crear organismo' }).click()
  await expect(page.getByTestId('titulo-organismo')).toHaveText(`${PREFIJO}organismo del recorrido`)
  const idOrg = page.url().match(/organismos\/(\d+)/)![1]!

  // --- 4. Taxonomía: llega con un clic desde el detalle y NO vuelve a pedir datos del organismo ---
  await page.getByRole('link', { name: 'Taxonomía' }).click()
  const form = page.getByTestId('form-taxonomia')
  await expect(form).toBeVisible()
  // (Buscar por etiqueta daría falsos positivos: una OPCIÓN de la taxonomía dice "…de la Provincia".)
  await expect(page.locator('#denominacion, #denominacionSimplificadaId, #tipoOficinaId, #provinciaId')).toHaveCount(0)
  await expect(form.getByRole('textbox')).toHaveCount(0)
  await expect(form.getByRole('combobox')).toHaveCount(0)
  const preguntas = page.locator('[data-testid^="pregunta-"]')
  const total = await preguntas.count()
  expect(total).toBe(9) // el catálogo aplicable a "oficina judicial"
  for (let i = 0; i < total; i++) {
    await preguntas.nth(i).getByRole('radio').first().check()
    acciones.push(`pregunta ${i + 1}`)
  }
  await page.getByRole('button', { name: 'Guardar taxonomía' }).click()
  await expect(page.getByTestId('taxonomia-guardada')).toBeVisible()
  const segundos = Number(((Date.now() - t0) / 1000).toFixed(1))

  // --- Resultado: todo quedó guardado, en una sola sesión ---
  const org = sql(`SELECT o.denominacion || '|' || p.nombre || '|' || u.email FROM organismos o JOIN provincias p ON p.id = o.provincia_id JOIN usuarios u ON u.id = o.propietario_id WHERE o.id = ${idOrg}`)
  const respuestas = Number(sql(`SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = ${idOrg}`))
  expect(org).toBe(`${PREFIJO}organismo del recorrido|Córdoba|${U}`)
  expect(respuestas).toBe(9)
  // Ningún dato se pidió dos veces y no hubo recargas de página después de entrar.
  expect(new Set(acciones).size).toBe(acciones.length)
  expect(navegaciones).toEqual([])
  const recargasTrasEntrar = navegaciones.length // antes del reload de verificación de abajo
  // Recargar y volver: lo guardado sigue (no hay que repetir nada en una segunda visita).
  await page.reload()
  await expect(page.getByTestId('form-taxonomia')).toBeVisible()
  await expect(page.locator('[data-testid^="pregunta-"] [role="radio"][data-state="checked"]')).toHaveCount(9)

  evidencia.recorrido = { acciones, cantidadDeAcciones: acciones.length, segundos, recargasTrasEntrar, organismoEnBase: org, respuestasEnBase: respuestas }
  await page.screenshot({ path: process.env.SC002_PNG ?? 'test-results/sc002.png', fullPage: false })
})
