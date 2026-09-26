import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { asignarProvincia, crearUsuarioConClave, hacerAdmin, limpiarFixtures, PREFIJO, sql } from './helpers/backend'
import { elegir, entrarUI } from './helpers/ui'

const ADM = `${PREFIJO}usr-admin@example.test`
const NORMAL = `${PREFIJO}usr-normal@example.test`
const evidencia: Record<string, unknown> = {}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(ADM)
  await crearUsuarioConClave(NORMAL)
  hacerAdmin(ADM)
  asignarProvincia(NORMAL, 3)
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.USR_EVIDENCIA ?? 'test-results/usuarios-evidencia.json', JSON.stringify(evidencia, null, 2))
})

test('21/22. admin: lista completa con email, roles y provincia; el cambio de rol y de provincia funciona de verdad (008)', async ({ page }) => {
  const escrituras: string[] = []
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname
    if (p.startsWith('/api/') && !p.startsWith('/api/auth/') && r.method() !== 'GET') escrituras.push(`${r.method()} ${p}`)
  })

  await entrarUI(page, ADM)
  await page.getByRole('link', { name: 'Usuarios' }).click()
  await expect(page).toHaveURL(/\/admin\/usuarios$/)
  const total = Number(sql('SELECT count(*) FROM usuarios'))
  await expect(page.getByTestId('fila-usuario')).toHaveCount(total)
  await expect(page.getByTestId('total-usuarios')).toHaveText(`${total} usuarios`)

  // Cada fila coincide con la base: email, provincia y roles (verdad independiente por SQL).
  const esperado = sql(`SELECT u.id || '|' || u.email || '|' || coalesce(p.nombre,'—') || '|' || coalesce((SELECT string_agg(r.nombre, ',' ORDER BY r.nombre) FROM usuario_roles ur JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=u.id),'') FROM usuarios u LEFT JOIN provincias p ON p.id=u.provincia_id ORDER BY u.id`)
    .split('\n').map((l) => l.split('|') as [string, string, string, string])
  const enUi = await page.getByTestId('fila-usuario').evaluateAll((filas) =>
    filas.map((f) => {
      const celdas = [...f.querySelectorAll('td')]
      return [f.getAttribute('data-usuario-id')!, celdas[0]!.textContent!, celdas[2]!.textContent!, [...celdas[3]!.querySelectorAll('[data-slot="badge"]')].map((b) => b.textContent).sort().join(',')] as const
    }),
  )
  const porId = new Map(enUi.map((f) => [f[0], f]))
  let discrepancias = 0
  for (const [id, email, provincia, roles] of esperado) {
    const ui = porId.get(id)
    if (!ui || ui[1] !== email || ui[2] !== provincia || ui[3] !== roles) discrepancias++
  }
  const admins = esperado.filter((e) => e[3].split(',').includes('admin')).length
  evidencia.lista = { usuariosEnBase: total, filasEnUi: enUi.length, discrepanciasUiVsSql: discrepancias, admins }
  expect(discrepancias).toBe(0)

  // Buscar por email.
  await page.getByLabel('Buscar por nombre o email').fill(NORMAL)
  await expect(page.getByTestId('fila-usuario')).toHaveCount(1)
  await expect(page.getByTestId('fila-usuario')).toContainText(NORMAL)
  await page.getByLabel('Buscar por nombre o email').fill('')
  await expect(page.getByTestId('fila-usuario')).toHaveCount(total)

  // 008: el control "No disponible" y el aviso de solo lectura de 005 YA NO EXISTEN; cada fila ofrece "Editar".
  await expect(page.getByTestId('aviso-rol')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'No disponible' })).toHaveCount(0)
  const editar = page.getByTestId('editar-usuario')
  await expect(editar).toHaveCount(total)
  expect(await editar.evaluateAll((bs) => bs.filter((b) => (b as HTMLButtonElement).disabled).length)).toBe(0)

  // Cambio REAL de rol y de provincia sobre un usuario de fixtures; la verdad es SQL, no la pantalla.
  const rolesDe = () => sql(`SELECT coalesce(string_agg(r.nombre, ',' ORDER BY r.nombre), '') FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id JOIN usuarios u ON u.id = ur.usuario_id WHERE u.email = '${NORMAL}'`)
  const provinciaDe = () => sql(`SELECT p.nombre FROM usuarios u JOIN provincias p ON p.id = u.provincia_id WHERE u.email = '${NORMAL}'`)
  await page.getByLabel('Buscar por nombre o email').fill(NORMAL)
  await page.getByTestId('fila-usuario').getByTestId('editar-usuario').click()
  const dialogo = page.getByTestId('editar-usuario-dialog')
  await expect(dialogo.getByTestId('rol-actual')).toHaveText('Usuario normal')
  const rolAntes = rolesDe()
  await dialogo.getByTestId('boton-cambiar-rol').click() // otorgar admin: sin confirmación
  await expect(dialogo.getByTestId('rol-actual')).toHaveText('Administrador')
  const rolPromovido = rolesDe()
  await dialogo.getByTestId('boton-cambiar-rol').click() // quitar admin: pide confirmación
  await page.getByTestId('confirmar-quitar').click()
  await expect(dialogo.getByTestId('rol-actual')).toHaveText('Usuario normal')
  const rolDegradado = rolesDe()
  await elegir(page, 'editar-provincia', 'Mendoza')
  await dialogo.getByTestId('provincia-guardar').click()
  await expect(dialogo.getByTestId('provincia-ok')).toBeVisible()
  const provinciaNueva = provinciaDe()
  await dialogo.getByRole('button', { name: 'Cerrar', exact: true }).first().click()
  evidencia.cambios = { rolAntes, rolPromovido, rolDegradado, provinciaNueva, escrituras }
  expect([rolAntes, rolPromovido, rolDegradado, provinciaNueva]).toEqual(['usuario_normal', 'admin,usuario_normal', 'usuario_normal', 'Mendoza'])
  expect(escrituras).toEqual(['PUT /api/usuarios/' + sql(`SELECT id FROM usuarios WHERE email = '${NORMAL}'`) + '/rol', 'PUT /api/usuarios/' + sql(`SELECT id FROM usuarios WHERE email = '${NORMAL}'`) + '/rol', 'PATCH /api/usuarios/' + sql(`SELECT id FROM usuarios WHERE email = '${NORMAL}'`)])
  // Sin captura acá: esta pantalla muestra datos reales; las imágenes salen de evidencia-visual.spec.ts (anonimizadas).
})

test('un usuario normal en /admin/usuarios ve lo mismo que una ruta inexistente y no se piden usuarios', async ({ page }) => {
  const pedidos: string[] = []
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p === '/api/usuarios') pedidos.push(p) })
  await entrarUI(page, NORMAL)
  await page.goto('/admin/usuarios')
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
  await expect(page.getByTestId('fila-usuario')).toHaveCount(0)
  evidencia.pedidosDeUsuariosSiendoNormal = pedidos
  expect(pedidos).toEqual([])
})
