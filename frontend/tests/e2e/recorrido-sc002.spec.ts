import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { CLAVE, crearUsuarioConClave, limpiarFixtures, PREFIJO, sql } from './helpers/backend'
import { elegir, entrarUI } from './helpers/ui'

// SC-002 REDEFINIDO por 008 (reemplaza al de 005): "Una persona dada de alta por un administrador CON PROVINCIA ASIGNADA puede, en
// una sola sesión desde que abre su enlace, fijar su contraseña, dar de alta un organismo y completar la taxonomía aplicable, con
// 0 pasos de elección de provincia, 0 recargas de página y sin reingresar ningún dato ya dado."
// El punto de partida ya NO es "usuario nuevo sin datos": 007 impide que alguien se cree solo y que complete su propia provincia,
// así que el recorrido empieza después de que un admin dio de alta a la persona y le asignó la provincia. Todo va por la UI real
// y contra el backend real: el enlace es el que emite el servidor, no un token simulado.
const ADM = `${PREFIJO}sc002-admin@example.test`
const U = `${PREFIJO}sc002@example.test`
const evidencia: Record<string, unknown> = {}
const NUEVA_CLAVE = `${CLAVE}-sc002`

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(ADM, { rol: 'admin' })
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.SC002_EVIDENCIA ?? 'test-results/sc002.json', JSON.stringify(evidencia, null, 2))
})

test('SC-002 (008): persona dada de alta con provincia => canje, alta de organismo y taxonomía completa en una sola sesión', async ({ browser }) => {
  // --- Previo (NO cuenta como recorrido de la persona): un admin la da de alta CON provincia y obtiene su enlace ---
  const ctxAdmin = await browser.newContext()
  const admin = await ctxAdmin.newPage()
  await entrarUI(admin, ADM)
  await admin.goto('/admin/usuarios')
  await admin.getByTestId('alta-usuario').click()
  await admin.getByTestId('alta-usuario-dialog').getByLabel('Email').fill(U)
  await elegir(admin, 'alta-provincia', 'Córdoba')
  await admin.getByTestId('alta-usuario-dialog').getByRole('button', { name: 'Dar de alta' }).click()
  const enlace = await admin.getByTestId('enlace-acceso').inputValue()
  await ctxAdmin.close()
  expect(sql(`SELECT p.nombre FROM usuarios u JOIN provincias p ON p.id = u.provincia_id WHERE u.email = '${U}'`)).toBe('Córdoba')

  // --- Recorrido de la persona: contexto SIN sesión, abre el enlace que le pasaron ---
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const acciones: string[] = [] // cada dato que la persona TIENE que escribir/elegir, en orden
  const navegaciones: string[] = [] // cargas de documento completas (recargas) tras entrar
  const patchesDeUsuario: string[] = []
  page.on('request', (r) => { if (r.method() === 'PATCH' && new URL(r.url()).pathname.startsWith('/api/usuarios/')) patchesDeUsuario.push(r.url()) })

  await page.goto(enlace)
  await expect(page.getByTestId('primer-acceso-form')).toBeVisible()
  await page.getByLabel('Contraseña', { exact: true }).fill(NUEVA_CLAVE); acciones.push('contraseña')
  await page.getByLabel('Repetir contraseña').fill(NUEVA_CLAVE); acciones.push('confirmación de contraseña')
  await page.getByRole('button', { name: 'Guardar contraseña y entrar' }).click()
  await expect(page).toHaveURL(/\/organismos$/)
  await expect(page.getByTestId('organismos-vacio')).toBeVisible()
  const t0 = Date.now()
  page.on('request', (r) => { if (r.isNavigationRequest()) navegaciones.push(r.url()) })

  // --- 1. Alta de organismo: la provincia YA viene asignada (Córdoba), fija, y no hay nada que completar ---
  await page.getByRole('link', { name: 'Nuevo organismo' }).click()
  await expect(page.getByTestId('alta-sin-provincia')).toHaveCount(0)
  await expect(page.locator('#provinciaId')).toContainText('Córdoba')
  await expect(page.locator('#provinciaId')).toBeDisabled()
  await page.getByLabel('Denominación', { exact: true }).fill(`${PREFIJO}organismo del recorrido`); acciones.push('denominación')
  await elegir(page, 'denominacionSimplificadaId', /./); acciones.push('denominación simplificada')
  await elegir(page, 'tipoOficinaId', 'oficina judicial'); acciones.push('tipo de oficina')
  await page.getByRole('button', { name: 'Crear organismo' }).click()
  await expect(page.getByTestId('titulo-organismo')).toHaveText(`${PREFIJO}organismo del recorrido`)
  const idOrg = page.url().match(/organismos\/(\d+)/)![1]!

  // --- 2. Taxonomía: llega con un clic desde el detalle y NO vuelve a pedir datos del organismo ---
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

  // --- Resultado: todo quedó guardado, en una sola sesión, con la provincia que asignó el admin ---
  const org = sql(`SELECT o.denominacion || '|' || p.nombre || '|' || u.email FROM organismos o JOIN provincias p ON p.id = o.provincia_id JOIN usuarios u ON u.id = o.propietario_id WHERE o.id = ${idOrg}`)
  const respuestas = Number(sql(`SELECT count(*) FROM evaluaciones_taxonomicas WHERE organismo_id = ${idOrg}`))
  expect(org).toBe(`${PREFIJO}organismo del recorrido|Córdoba|${U}`)
  expect(respuestas).toBe(9)
  // 0 pasos de elección de provincia (ninguna acción ni pedido de escritura sobre el usuario), 0 recargas, ningún dato dos veces.
  expect(acciones.filter((a) => /provincia$/.test(a) && a !== 'denominación simplificada')).toEqual([])
  expect(patchesDeUsuario).toEqual([])
  expect(new Set(acciones).size).toBe(acciones.length)
  expect(navegaciones).toEqual([])
  const recargasTrasEntrar = navegaciones.length
  // Recargar y volver: lo guardado sigue (no hay que repetir nada en una segunda visita).
  await page.reload()
  await expect(page.getByTestId('form-taxonomia')).toBeVisible()
  await expect(page.locator('[data-testid^="pregunta-"] [role="radio"][data-state="checked"]')).toHaveCount(9)

  evidencia.recorrido = {
    puntoDePartida: 'un admin ya asignó la provincia en el alta (Córdoba)',
    acciones, cantidadDeAcciones: acciones.length, segundos, recargasTrasEntrar, pasosDeEleccionDeProvincia: 0,
    organismoEnBase: org, respuestasEnBase: respuestas,
  }
  await page.screenshot({ path: process.env.SC002_PNG ?? 'test-results/sc002.png', fullPage: false })
  await ctx.close()
})
