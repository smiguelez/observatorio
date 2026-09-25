import { expect, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { asignarProvincia, crearUsuarioConClave, limpiarFixtures, PREFIJO, sesionApi, sql, type ApiSesion } from './helpers/backend'
import { elegir, entrarUI } from './helpers/ui'

const U = `${PREFIJO}uf@example.test`
const evidencia: Record<string, unknown> = {}
let api: ApiSesion
let orgId: string
let ufId: string

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(U)
  asignarProvincia(U, 1)
  api = await sesionApi(U)
  const org = await api.post('/api/organismos', { denominacion: `${PREFIJO}org uf`, denominacionSimplificadaId: 1, tipoOficinaId: 1, provinciaId: 1 })
  orgId = org.json.id
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = {
    usuarios: sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`),
    pools: sql(`SELECT count(*) FROM grupos_jueces WHERE descripcion LIKE '${PREFIJO}%' OR descripcion LIKE 'Grupo exclusivo de ${PREFIJO}%'`),
  }
  writeFileSync(process.env.UF_EVIDENCIA ?? 'test-results/uf-evidencia.json', JSON.stringify(evidencia, null, 2))
})

async function abrirDialogo(page: Page) {
  await entrarUI(page, U)
  await page.goto(`/organismos/${orgId}/unidades-funcionales/${ufId}`)
  await page.getByRole('button', { name: 'Asignación de jueces' }).click()
  await expect(page.getByTestId('dialogo-asignaciones')).toBeVisible()
}
const asignacionesEnBase = () =>
  sql(`SELECT coalesce(string_agg(g.descripcion || ':' || a.cantidad_asignada, ' | ' ORDER BY a.id), '') FROM unidad_funcional_grupo_jueces a JOIN grupos_jueces g ON g.id=a.grupo_jueces_id WHERE a.unidad_funcional_id = ${ufId}`)

test('UF: alta, listado y edición (US4-1)', async ({ page }) => {
  await entrarUI(page, U)
  await page.goto(`/organismos/${orgId}/unidades-funcionales`)
  await expect(page.getByTestId('uf-vacio')).toBeVisible()
  await page.getByRole('link', { name: 'Nueva unidad funcional' }).click()
  await page.getByLabel('Denominación de la unidad').fill(`${PREFIJO}uf 1`)
  await elegir(page, 'localidadId', /./)
  await elegir(page, 'tipoUfId', /./)
  await page.getByRole('button', { name: 'Crear unidad funcional' }).click()
  await expect(page).toHaveURL(/unidades-funcionales\/\d+$/)
  ufId = page.url().match(/unidades-funcionales\/(\d+)$/)![1]!
  expect(sql(`SELECT denominacion_unidad FROM unidades_funcionales WHERE id = ${ufId}`)).toBe(`${PREFIJO}uf 1`)
  // La localidad elegida pertenece a la provincia del organismo.
  expect(sql(`SELECT l.provincia_id FROM unidades_funcionales u JOIN localidades l ON l.id=u.localidad_id WHERE u.id = ${ufId}`)).toBe('1')

  await page.getByLabel('Domicilio').fill('Calle 123')
  await page.getByLabel('Responsable').fill('Ana')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByTestId('mensaje-uf')).toContainText('Cambios guardados')
  expect(sql(`SELECT domicilio || '/' || responsable FROM unidades_funcionales WHERE id = ${ufId}`)).toBe('Calle 123/Ana')

  await page.goto(`/organismos/${orgId}/unidades-funcionales`)
  await expect(page.getByTestId('fila-uf')).toHaveCount(1)
})

test('Diálogo: crear pools DENTRO del diálogo y verlos en la lista (FR-024)', async ({ page }) => {
  await abrirDialogo(page)
  await page.getByRole('tab', { name: 'Pools de la provincia' }).click()
  for (const [nombre, total] of [['pool A', '10'], ['pool B', '8']] as const) {
    await page.getByLabel('Descripción del pool nuevo').fill(`${PREFIJO}${nombre}`)
    await page.getByLabel('Total de jueces', { exact: true }).last().fill(total)
    await page.getByRole('button', { name: 'Crear pool' }).click()
    await expect(page.getByTestId('mensaje-pools')).toContainText('Pool creado')
    await expect(page.locator(`input[value="${PREFIJO}${nombre}"]`)).toHaveCount(1) // ya figura en la lista del panel
  }
  expect(sql(`SELECT string_agg(descripcion || ':' || total_jueces || ':' || provincia_id, ' | ' ORDER BY id) FROM grupos_jueces WHERE descripcion LIKE '${PREFIJO}pool %'`))
    .toBe(`${PREFIJO}pool A:10:1 | ${PREFIJO}pool B:8:1`)
  evidencia.poolsCreadosEnElDialogo = 2
})

test('Asignar: pool completo + subconjunto de otro pool coexisten (US4-2/3/4, D8)', async ({ page }) => {
  await abrirDialogo(page)
  await expect(page.getByTestId('sin-asignaciones')).toBeVisible()

  // Pool completo A: la cantidad se propone sola (= total) y no se edita.
  await elegir(page, 'asig-pool', new RegExp(`${PREFIJO}pool A`))
  await expect(page.getByLabel('Cantidad de jueces')).toHaveValue('10')
  await page.getByRole('button', { name: 'Agregar asignación' }).click()
  await expect(page.getByTestId('mensaje-asignaciones')).toContainText('Asignación guardada')

  // Subconjunto de B: 3 de 8, sin identificar cuáles jueces.
  await page.getByLabel('Subconjunto de un pool').click()
  await elegir(page, 'asig-pool', new RegExp(`${PREFIJO}pool B`))
  await page.getByLabel('Cantidad de jueces').fill('3')
  await page.getByRole('button', { name: 'Agregar asignación' }).click()
  await expect(page.getByTestId('fila-asignacion')).toHaveCount(2)
  const enBase = asignacionesEnBase()
  evidencia.asignaciones = enBase
  expect(enBase).toBe(`${PREFIJO}pool A:10 | ${PREFIJO}pool B:3`)
  // El "modo" (completo/subconjunto) es solo una etiqueta informativa: no existe en la base.
  await expect(page.getByTestId('fila-asignacion').nth(0)).toContainText('(completo)')
  await expect(page.getByTestId('fila-asignacion').nth(1)).toContainText('(subconjunto)')
})

test('Grupo exclusivo: se crea el pool y se asigna en un paso; cantidad > total advierte pero se guarda', async ({ page }) => {
  await api.post('/api/pools-jueces', { provinciaId: 1, descripcion: `${PREFIJO}pool C`, totalJueces: 2 })
  await abrirDialogo(page)

  await page.getByLabel('Grupo exclusivo de esta unidad').click()
  await page.getByLabel('Jueces del grupo').fill('4')
  await page.getByRole('button', { name: 'Agregar asignación' }).click()
  await expect(page.getByTestId('fila-asignacion')).toHaveCount(3)
  expect(sql(`SELECT descripcion || ':' || total_jueces FROM grupos_jueces WHERE descripcion = 'Grupo exclusivo de ${PREFIJO}uf 1'`)).toBe(`Grupo exclusivo de ${PREFIJO}uf 1:4`)

  await page.getByLabel('Subconjunto de un pool').click()
  await elegir(page, 'asig-pool', new RegExp(`${PREFIJO}pool C`))
  await page.getByLabel('Cantidad de jueces').fill('5')
  await expect(page.getByTestId('aviso-cantidad')).toContainText('supera el total')
  await page.getByRole('button', { name: 'Agregar asignación' }).click()
  await expect(page.getByTestId('fila-asignacion')).toHaveCount(4) // advierte, NO bloquea (D8)
  evidencia.asignacionesTrasExclusivo = asignacionesEnBase()
})

test('400 real del backend: pool ya asignado (carrera entre pestañas)', async ({ page }) => {
  const d = (await api.post('/api/pools-jueces', { provinciaId: 1, descripcion: `${PREFIJO}pool D`, totalJueces: 6 })).json
  await abrirDialogo(page) // el pool D aparece como disponible
  // Otra pestaña/usuario lo asigna mientras el diálogo sigue abierto (su caché no lo sabe).
  const otra = await api.post(`/api/organismos/${orgId}/unidades-funcionales/${ufId}/asignaciones-jueces`, { grupoJuecesId: Number(d.id), cantidadAsignada: 6 })
  expect(otra.status).toBe(201)

  const respuestas: number[] = []
  page.on('response', (r) => { if (r.request().method() === 'POST' && r.url().includes('asignaciones-jueces')) respuestas.push(r.status()) })
  await elegir(page, 'asig-pool', new RegExp(`${PREFIJO}pool D`))
  await page.getByRole('button', { name: 'Agregar asignación' }).click()
  const alerta = page.getByTestId('mensaje-asignaciones')
  await expect(alerta).toContainText('Ya existe una asignación de esta unidad funcional a ese pool.')
  evidencia.duplicado = { statusPost: respuestas, mensaje: (await alerta.textContent())?.trim() }
  expect(respuestas).toEqual([400])
})

test('Editar cantidad y quitar una asignación', async ({ page }) => {
  await abrirDialogo(page)
  const fila = page.getByTestId('fila-asignacion').filter({ hasText: `${PREFIJO}pool A` })
  await fila.getByLabel('Cantidad').fill('9')
  await fila.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByTestId('mensaje-asignaciones')).toContainText('Cantidad actualizada')
  expect(asignacionesEnBase()).toContain(`${PREFIJO}pool A:9`)
  await fila.getByRole('button', { name: /Quitar asignación/ }).click()
  await expect(page.getByTestId('fila-asignacion').filter({ hasText: `${PREFIJO}pool A` })).toHaveCount(0)
  expect(asignacionesEnBase()).not.toContain(`${PREFIJO}pool A`)
})

test('Pools: editar el total, eliminar uno libre, y el mensaje claro al eliminar uno EN USO (500 real del backend)', async ({ page }) => {
  await abrirDialogo(page)
  await page.getByRole('tab', { name: 'Pools de la provincia' }).click()

  // Editar el total del pool B (asignado, pero editar no rompe nada).
  const filaB = page.getByTestId('fila-pool').filter({ has: page.locator(`input[value="${PREFIJO}pool B"]`) })
  await filaB.getByLabel('Total de jueces').fill('12')
  await filaB.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByTestId('mensaje-pools')).toContainText('Pool actualizado')
  expect(sql(`SELECT total_jueces FROM grupos_jueces WHERE descripcion = '${PREFIJO}pool B'`)).toBe('12')

  // Pool A ya no está asignado (se quitó arriba): se elimina sin problema.
  const filaA = page.getByTestId('fila-pool').filter({ has: page.locator(`input[value="${PREFIJO}pool A"]`) })
  await filaA.getByRole('button', { name: /Eliminar pool/ }).click()
  await page.getByRole('button', { name: 'Eliminar pool', exact: true }).click()
  await expect(page.getByTestId('mensaje-pools')).toContainText('Pool eliminado')
  expect(sql(`SELECT count(*) FROM grupos_jueces WHERE descripcion = '${PREFIJO}pool A'`)).toBe('0')

  // Pool B SÍ está asignado a esta UF: el backend responde 500 (FK) y la UI lo traduce.
  const respuestas: { status: number; cuerpo: string }[] = []
  page.on('response', async (r) => {
    if (r.request().method() === 'DELETE' && r.url().includes('/api/pools-jueces/')) respuestas.push({ status: r.status(), cuerpo: (await r.text()).slice(0, 220) })
  })
  await filaB.getByRole('button', { name: /Eliminar pool/ }).click()
  await page.getByRole('button', { name: 'Eliminar pool', exact: true }).click()
  const alerta = page.getByTestId('mensaje-pools')
  await expect(alerta).toContainText('puede estar asignado a otras unidades funcionales')
  evidencia.borradoPoolEnUso = { respuestaDelBackend: respuestas, mensajeEnPantalla: (await alerta.textContent())?.trim() }
  expect(respuestas.map((x) => x.status)).toEqual([500])
  expect(respuestas[0]!.cuerpo).toContain('23503')
  expect(sql(`SELECT count(*) FROM grupos_jueces WHERE descripcion = '${PREFIJO}pool B'`)).toBe('1') // no se borró
  // Sin captura acá: esta pantalla muestra datos reales; las imágenes salen de evidencia-visual.spec.ts (anonimizadas).
})

test('Permisos de pools: un usuario de otra provincia no puede crear pools (mensaje, no error)', async ({ page }) => {
  const otro = `${PREFIJO}uf-otra@example.test`
  await crearUsuarioConClave(otro)
  asignarProvincia(otro, 2)
  // Este usuario NO es propietario ni editor: se le da acceso como editor para que pueda ver la UF.
  sql(`INSERT INTO organismo_editores (organismo_id, usuario_id) SELECT ${orgId}, id FROM usuarios WHERE email = '${otro}'`)
  await entrarUI(page, otro)
  await page.goto(`/organismos/${orgId}/unidades-funcionales/${ufId}`)
  await page.getByRole('button', { name: 'Asignación de jueces' }).click()
  await page.getByRole('tab', { name: 'Pools de la provincia' }).click()
  await expect(page.getByTestId('pools-sin-permiso')).toContainText('Solo podés gestionar pools de tu provincia')
  await expect(page.getByRole('button', { name: 'Crear pool' })).toHaveCount(0)
})
