import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { crearUsuarioConClave, limpiarFixtures, PREFIJO, sql } from './helpers/backend'
import { elegir, entrarUI } from './helpers/ui'

// 008 — US3: rol y provincia desde la lista de usuarios (quickstart 8–10), contra el backend REAL de 007.
const ADM = `${PREFIJO}rp-admin@example.test`
const ADM2 = `${PREFIJO}rp-admin2@example.test`
const NORMAL = `${PREFIJO}rp-normal@example.test`
const OTRO = `${PREFIJO}rp-otro@example.test`
const evidencia: Record<string, unknown> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(ADM, { rol: 'admin' })
  await crearUsuarioConClave(ADM2, { rol: 'admin' })
  await crearUsuarioConClave(NORMAL, { provinciaId: 1 })
  await crearUsuarioConClave(OTRO, { provinciaId: 1 })
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.RP_EVIDENCIA ?? 'test-results/rol-provincia-evidencia.json', JSON.stringify(evidencia, null, 2))
})

const roles = (email: string) => sql(`SELECT coalesce(string_agg(r.nombre, ',' ORDER BY r.nombre), '') FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id JOIN usuarios u ON u.id = ur.usuario_id WHERE u.email = '${email}'`)
const fila = (page: import('@playwright/test').Page, email: string) => page.locator('[data-testid="fila-usuario"]', { hasText: email })
async function editar(page: import('@playwright/test').Page, email: string) {
  await page.getByLabel('Buscar por nombre o email').fill(email)
  await fila(page, email).getByTestId('editar-usuario').click()
  return page.getByTestId('editar-usuario-dialog')
}

test('8. promover y degradar; la lista refleja cada cambio; quitar admin pide confirmación', async ({ page }) => {
  await entrarUI(page, ADM)
  await page.goto('/admin/usuarios')
  let d = await editar(page, NORMAL)
  await d.getByTestId('boton-cambiar-rol').click()
  await expect(d.getByTestId('rol-actual')).toHaveText('Administrador')
  expect(roles(NORMAL)).toBe('admin,usuario_normal')
  await d.getByRole('button', { name: 'Cerrar', exact: true }).first().click()
  await expect(fila(page, NORMAL).locator('[data-slot="badge"]', { hasText: 'admin' })).toBeVisible() // la lista lo refleja sin recargar

  d = await editar(page, NORMAL)
  await d.getByTestId('boton-cambiar-rol').click()
  await expect(page.getByTestId('confirmar-quitar-admin')).toContainText('perder de inmediato')
  expect(roles(NORMAL)).toBe('admin,usuario_normal') // todavía no se envió
  await page.getByTestId('confirmar-quitar').click()
  await expect(d.getByTestId('rol-actual')).toHaveText('Usuario normal')
  expect(roles(NORMAL)).toBe('usuario_normal')
  evidencia.promoverDegradar = { promovido: 'admin,usuario_normal', degradado: roles(NORMAL) }
})

test('8b. ÚLTIMO administrador (page.route): el 400 literal de 007 se muestra y la fila queda en su estado REAL', async ({ page }) => {
  // No se puede provocar el rechazo real sin quitarle el rol a los administradores REALES de la base; la regla real (con la
  // carrera de dos degradaciones) la prueba backend/tests/integration/ultimo-admin.test.ts en un esquema aislado. Acá se
  // verifica el CLIENTE con el cuerpo literal que responde el servidor (contracts/consumed-api.md).
  const CUERPO = { error: 'El sistema no puede quedarse sin administradores.' }
  let interceptados = 0
  await page.route('**/api/usuarios/*/rol', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    interceptados++
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(CUERPO) })
  })
  await entrarUI(page, ADM)
  await page.goto('/admin/usuarios')
  const antes = roles(ADM2)
  const d = await editar(page, ADM2)
  await expect(d.getByTestId('rol-actual')).toHaveText('Administrador')
  await d.getByTestId('boton-cambiar-rol').click()
  await page.getByTestId('confirmar-quitar').click()
  await expect(d.getByTestId('error-rol')).toHaveText(CUERPO.error)
  await expect(d.getByTestId('rol-actual')).toHaveText('Administrador') // el estado REAL, no el intentado
  expect(roles(ADM2)).toBe(antes)
  expect(interceptados).toBe(1)
  evidencia.ultimoAdmin = { mensaje: CUERPO.error, rolMostrado: 'Administrador', rolEnBase: roles(ADM2), interceptados }
})

test('9. autodescenso: un admin que se quita el rol habiendo otro pasa a /organismos y ya no ve pantallas de admin', async ({ page }) => {
  await entrarUI(page, ADM2)
  await page.goto('/admin/usuarios')
  const d = await editar(page, ADM2)
  await expect(page.getByTestId('confirmar-quitar-admin')).toHaveCount(0)
  await d.getByTestId('boton-cambiar-rol').click()
  await expect(page.getByTestId('confirmar-quitar-admin')).toContainText('Sos vos')
  await page.getByTestId('confirmar-quitar').click()
  await expect(page).toHaveURL(/\/organismos$/)
  expect(roles(ADM2)).toBe('usuario_normal')
  await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0) // el menú de admin desapareció
  await page.goto('/admin/usuarios')
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
  evidencia.autodescenso = { urlFinal: '/organismos', rolEnBase: roles(ADM2) }
})

test('10. el admin cambia la provincia MIENTRAS la persona tiene la app abierta: rige en su siguiente pantalla, sin re-login', async ({ browser }) => {
  const ctxAdmin = await browser.newContext()
  const ctxPersona = await browser.newContext()
  const admin = await ctxAdmin.newPage()
  const persona = await ctxPersona.newPage()
  await entrarUI(persona, OTRO)
  await persona.goto('/organismos/nuevo')
  await expect(persona.locator('#provinciaId')).toContainText('Buenos Aires') // provincia 1 (fija para un normal)
  const sesionAntes = await persona.evaluate(async () => (await (await fetch('/api/auth/session')).json()).provinciaId)

  await entrarUI(admin, ADM)
  await admin.goto('/admin/usuarios')
  const d = await editar(admin, OTRO)
  await elegir(admin, 'editar-provincia', 'Mendoza')
  await d.getByTestId('provincia-guardar').click()
  await expect(d.getByTestId('provincia-ok')).toBeVisible()
  expect(sql(`SELECT p.nombre FROM usuarios u JOIN provincias p ON p.id = u.provincia_id WHERE u.email = '${OTRO}'`)).toBe('Mendoza')

  // La persona NO recarga ni vuelve a entrar: navega dentro de la app (misma pestaña) y ve la provincia vigente.
  await persona.locator('[data-slot="sidebar-content"]').getByRole('link', { name: 'Mis organismos' }).click()
  await persona.getByRole('link', { name: 'Nuevo organismo' }).click()
  await expect(persona.locator('#provinciaId')).toContainText('Mendoza')
  const sesionDespues = await persona.evaluate(async () => (await (await fetch('/api/auth/session')).json()).provinciaId)
  expect(sesionDespues).not.toBe(sesionAntes)
  evidencia.provinciaSinRelogin = { sesionAntes, sesionDespues, prellenado: 'Mendoza' }
  await ctxAdmin.close()
  await ctxPersona.close()
})

test('10b. provincia inexistente (mock 400): el mensaje del servidor y sin cambios en la base', async ({ page }) => {
  await page.route('**/api/usuarios/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'La provincia indicada no existe.' }) })
  })
  await entrarUI(page, ADM)
  await page.goto('/admin/usuarios')
  const antes = sql(`SELECT provincia_id FROM usuarios WHERE email = '${NORMAL}'`)
  const d = await editar(page, NORMAL)
  await elegir(page, 'editar-provincia', 'Córdoba')
  await d.getByTestId('provincia-guardar').click()
  await expect(d.getByTestId('error-provincia')).toHaveText('La provincia indicada no existe.')
  expect(sql(`SELECT provincia_id FROM usuarios WHERE email = '${NORMAL}'`)).toBe(antes)
})
