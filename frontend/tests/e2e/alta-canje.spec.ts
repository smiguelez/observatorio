import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { BACKEND, CLAVE, crearUsuarioConClave, crearUsuarioSinClave, limpiarFixtures, PREFIJO, sesionApi, sql } from './helpers/backend'
import { elegir, entrarUI } from './helpers/ui'

// 008 — US1 (alta administrada + acceso inicial) y US2 (canje público). Todo contra el backend REAL de 007:
// los tokens son los que emite el servidor, no simulados.
const ADM = `${PREFIJO}alta-admin@example.test`
const NORMAL = `${PREFIJO}alta-normal@example.test`
const NUEVO = `${PREFIJO}alta-nuevo@example.test`
const SEGUNDO = `${PREFIJO}alta-segundo@example.test`
const evidencia: Record<string, unknown> = {}
const RE_ENLACE = /\/primer-acceso#token=[A-Za-z0-9_-]{20,}$/

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  limpiarFixtures()
  await crearUsuarioConClave(ADM, { rol: 'admin' })
  await crearUsuarioConClave(NORMAL, { provinciaId: 1 })
})
test.afterAll(() => {
  limpiarFixtures()
  evidencia.fixturesRestantes = sql(`SELECT count(*) FROM usuarios WHERE email LIKE '${PREFIJO}%'`)
  writeFileSync(process.env.ALTA_EVIDENCIA ?? 'test-results/alta-canje-evidencia.json', JSON.stringify(evidencia, null, 2))
})

async function abrirAlta(page: import('@playwright/test').Page, email: string, provincia: string) {
  await page.getByTestId('alta-usuario').click()
  const dialogo = page.getByTestId('alta-usuario-dialog')
  await dialogo.getByLabel('Email').fill(email)
  await elegir(page, 'alta-provincia', provincia)
  await dialogo.getByRole('button', { name: 'Dar de alta' }).click()
}

test.describe('US1 — alta administrada', () => {
  let enlaceNuevo = ''

  test('1. el admin da de alta con provincia: enlace + vencimiento + aviso; la persona aparece con esa provincia y rol', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await entrarUI(page, ADM)
    await page.goto('/admin/usuarios')
    await abrirAlta(page, NUEVO, 'Córdoba')

    const enlace = page.getByTestId('enlace-acceso')
    await expect(enlace).toBeVisible()
    enlaceNuevo = await enlace.inputValue()
    expect(enlaceNuevo).toMatch(new RegExp(RE_ENLACE.source)) // acceso en el FRAGMENTO
    await expect(page.getByTestId('vence-acceso')).toContainText('Vence el')
    await expect(page.getByTestId('aviso-un-solo-uso')).toContainText('no volverá a mostrarse')

    // Verdad independiente por SQL: provincia y rol asignados.
    const fila = sql(`SELECT p.nombre || '|' || coalesce((SELECT string_agg(r.nombre, ',' ORDER BY r.nombre) FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = u.id), '') FROM usuarios u JOIN provincias p ON p.id = u.provincia_id WHERE u.email = '${NUEVO}'`)
    expect(fila).toBe('Córdoba|usuario_normal')

    // Copiar deja el enlace completo en el portapapeles y evita la confirmación al cerrar.
    await page.getByTestId('copiar-enlace').click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(enlaceNuevo)
    await page.getByTestId('cerrar-acceso').click()
    await expect(page.getByTestId('enlace-acceso')).toHaveCount(0)
    await expect(page.getByTestId('confirmar-cierre-acceso')).toHaveCount(0)

    // La persona figura en la lista, y el enlace no queda en el navegador (FR-003).
    await expect(page.locator('[data-testid="fila-usuario"]', { hasText: NUEVO })).toBeVisible()
    const rastros = await page.evaluate((token) => ({
      enDom: document.documentElement.outerHTML.includes(token),
      local: JSON.stringify({ ...localStorage }).includes(token),
      sesion: JSON.stringify({ ...sessionStorage }).includes(token),
      cookie: document.cookie.includes(token),
    }), enlaceNuevo.split('#token=')[1]!)
    expect(rastros).toEqual({ enDom: false, local: false, sesion: false, cookie: false })
    evidencia.altaOk = { fila, formatoEnlace: 'origen + /primer-acceso#token=…', rastrosTrasCerrar: rastros }
  })

  test('2. email ya dado de alta (otro casing): mensaje del servidor y el existente NO se modifica', async ({ page }) => {
    await entrarUI(page, ADM)
    await page.goto('/admin/usuarios')
    const antes = sql(`SELECT provincia_id FROM usuarios WHERE email = '${NUEVO}'`)
    await abrirAlta(page, NUEVO.toUpperCase(), 'Buenos Aires')
    await expect(page.getByTestId('alta-error')).toContainText('Ese email ya está dado de alta.')
    await expect(page.getByTestId('enlace-acceso')).toHaveCount(0)
    expect(sql(`SELECT provincia_id FROM usuarios WHERE email = '${NUEVO}'`)).toBe(antes)
    evidencia.duplicado = { provinciaAntes: antes, provinciaDespues: sql(`SELECT provincia_id FROM usuarios WHERE email = '${NUEVO}'`) }
  })

  test('2b. validación del cliente: usuario normal sin provincia => mensaje y 0 solicitudes de alta', async ({ page }) => {
    await entrarUI(page, ADM)
    await page.goto('/admin/usuarios')
    const altas: string[] = []
    page.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/usuarios') altas.push(r.url()) })
    await page.getByTestId('alta-usuario').click()
    await page.getByTestId('alta-usuario-dialog').getByLabel('Email').fill(`${PREFIJO}alta-sinprov@example.test`)
    await page.getByTestId('alta-usuario-dialog').getByRole('button', { name: 'Dar de alta' }).click()
    await expect(page.getByText('La provincia es obligatoria para un usuario normal')).toBeVisible()
    expect(altas).toEqual([])
    expect(sql(`SELECT count(*) FROM usuarios WHERE email = '${PREFIJO}alta-sinprov@example.test'`)).toBe('0')
  })

  test('3. cerrar sin copiar pide confirmación ("Volver" no cierra; "Cerrar igual" sí) y el enlace no vuelve', async ({ page }) => {
    await entrarUI(page, ADM)
    await page.goto('/admin/usuarios')
    await abrirAlta(page, SEGUNDO, 'Buenos Aires')
    await expect(page.getByTestId('enlace-acceso')).toBeVisible()
    await page.getByTestId('cerrar-acceso').click()
    const conf = page.getByTestId('confirmar-cierre-acceso')
    await expect(conf).toContainText('No vas a poder verlo de nuevo')
    await conf.getByRole('button', { name: 'Volver' }).click()
    await expect(page.getByTestId('enlace-acceso')).toBeVisible()
    await page.getByTestId('cerrar-acceso').click()
    await page.getByTestId('confirmar-cierre-acceso').getByRole('button', { name: 'Cerrar igual' }).click()
    await expect(page.getByTestId('enlace-acceso')).toHaveCount(0)
  })

  test('4. reemitir: enlace distinto, el anterior deja de servir (verificado contra el canje real)', async ({ page }) => {
    await entrarUI(page, ADM)
    await page.goto('/admin/usuarios')
    await page.locator('[data-testid="fila-usuario"]', { hasText: NUEVO }).getByTestId('emitir-acceso').click()
    await expect(page.getByTestId('confirmar-reemision')).toContainText('dejará de servir')
    await page.getByTestId('confirmar-reemitir').click()
    const nuevo = await page.getByTestId('enlace-acceso').inputValue()
    expect(nuevo).toMatch(new RegExp(RE_ENLACE.source))
    expect(nuevo).not.toBe(enlaceNuevo)

    const canjear = (token: string) => fetch(`${BACKEND}/api/acceso-inicial/canjear`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: CLAVE }),
    })
    const viejo = await canjear(enlaceNuevo.split('#token=')[1]!)
    expect(viejo.status).toBe(400) // reemplazado: no sirve
    evidencia.reemision = { viejoStatus: viejo.status, enlaceCambio: nuevo !== enlaceNuevo }
  })

  test('5. un usuario NO admin recibe la pantalla de "no encontrado" y no se piden usuarios (FR-007)', async ({ page }) => {
    const pedidos: string[] = []
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/usuarios') pedidos.push(r.method()) })
    await entrarUI(page, NORMAL)
    await page.goto('/admin/usuarios')
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
    await expect(page.getByTestId('alta-usuario')).toHaveCount(0)
    expect(pedidos).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------
// US2 — canje del acceso inicial. Los accesos son los REALES que emite el backend (`crearUsuarioSinClave` da de alta por
// POST /api/usuarios y devuelve el token de la respuesta); ningún token está simulado.
// ---------------------------------------------------------------------------------------------------------------
test.describe('US2 — canje del acceso inicial', () => {
  const persona = (n: string) => `${PREFIJO}canje-${n}@example.test`
  const NUEVA_CLAVE = 'mi-clave-de-canje-2026'
  const textoNoValido = async (page: import('@playwright/test').Page) => (await page.getByTestId('acceso-no-valido').innerText()).trim()
  const rellenar = async (page: import('@playwright/test').Page, pass: string, conf = pass) => {
    await page.getByLabel('Contraseña', { exact: true }).fill(pass)
    await page.getByLabel('Repetir contraseña').fill(conf)
    await page.getByRole('button', { name: 'Guardar contraseña y entrar' }).click()
  }
  const sesionActual = (page: import('@playwright/test').Page) => page.evaluate(async () => {
    const r = await fetch('/api/auth/session')
    return { status: r.status, cuerpo: r.ok ? await r.json() : null }
  })

  test('6. acceso REAL: el fragmento se quita, la contraseña no queda en ningún lado, entra a /organismos con su provincia y rol', async ({ browser }) => {
    const { token } = await crearUsuarioSinClave(persona('ok'), 5)
    const contexto = await browser.newContext() // SIN sesión
    const page = await contexto.newPage()
    const solicitudes: { url: string; referer?: string }[] = []
    page.on('request', (r) => solicitudes.push({ url: r.url(), referer: r.headers()['referer'] }))

    await page.goto(`/primer-acceso#token=${token}`)
    await expect(page.getByTestId('primer-acceso-form')).toBeVisible()
    await expect.poll(() => page.url()).not.toContain(token) // fragmento quitado de la dirección
    expect(page.url()).toMatch(/\/primer-acceso$/)
    expect(await page.evaluate(() => location.hash)).toBe('')

    await rellenar(page, NUEVA_CLAVE)
    await expect(page).toHaveURL(/\/organismos$/)
    const sesion = await sesionActual(page)
    expect(sesion).toEqual({ status: 200, cuerpo: expect.objectContaining({ rol: 'usuario_normal', provinciaId: 5 }) })

    // ni el acceso ni la contraseña viajaron en una URL ni en un Referer; tampoco quedaron en el almacenamiento
    expect(solicitudes.filter((x) => x.url.includes(token) || (x.referer ?? '').includes(token) || x.url.includes(NUEVA_CLAVE))).toEqual([])
    const almacenado = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie)
    expect(almacenado).not.toContain(token)
    expect(almacenado).not.toContain(NUEVA_CLAVE)

    // "atrás" no recupera el formulario ni el acceso (la entrada del historial fue REEMPLAZADA)
    await page.goBack().catch(() => undefined)
    expect(page.url()).not.toContain('primer-acceso')
    expect(page.url()).not.toContain(token)

    // y la contraseña quedó fijada: se puede ingresar por /login
    await contexto.clearCookies()
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(persona('ok'))
    await page.getByLabel('Contraseña', { exact: true }).fill(NUEVA_CLAVE)
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page).toHaveURL(/\/organismos$/)
    expect(sql(`SELECT count(*) FROM auth.verification WHERE identifier = 'reset-password:${token}'`)).toBe('0') // consumido
    evidencia.canjeReal = { urlTrasLeer: '/primer-acceso (sin fragmento)', sesion: sesion.cuerpo, solicitudesConElAcceso: 0, almacenamientoConSecretos: false }
    await contexto.close()
  })

  test('7. usado, vencido, reemplazado, inventado y SIN fragmento: la MISMA pantalla y el mismo texto, y 0 sesiones', async ({ browser }) => {
    const usado = await crearUsuarioSinClave(persona('usado'), 5)
    const vencido = await crearUsuarioSinClave(persona('vencido'), 5)
    const reemplazado = await crearUsuarioSinClave(persona('reemp'), 5)
    sql(`UPDATE auth.verification SET "expiresAt" = now() - interval '1 minute' WHERE identifier = 'reset-password:${vencido.token}'`)
    const admin = await sesionApi(ADM)
    expect((await admin.post(`/api/usuarios/${reemplazado.id}/acceso-inicial`, undefined as never)).status).toBe(201) // reemplaza al anterior

    // gastar el "usado" con un canje real
    const primero = await fetch(`${BACKEND}/api/acceso-inicial/canjear`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: usado.token, password: NUEVA_CLAVE }) })
    expect(primero.status).toBe(200)

    const casos: [string, string][] = [
      ['usado', `/primer-acceso#token=${usado.token}`],
      ['vencido', `/primer-acceso#token=${vencido.token}`],
      ['reemplazado', `/primer-acceso#token=${reemplazado.token}`],
      ['inventado', '/primer-acceso#token=este-acceso-no-existe-0123456789'],
    ]
    const textos: Record<string, string> = {}
    for (const [nombre, ruta] of casos) {
      const contexto = await browser.newContext()
      const page = await contexto.newPage()
      await page.goto(ruta)
      await rellenar(page, NUEVA_CLAVE)
      await expect(page.getByTestId('acceso-no-valido')).toBeVisible()
      textos[nombre] = await textoNoValido(page)
      expect((await sesionActual(page)).status).toBe(401) // 0 sesiones
      await contexto.close()
    }
    // sin fragmento: ni formulario ni solicitud de canje
    const contexto = await browser.newContext()
    const page = await contexto.newPage()
    const canjes: string[] = []
    page.on('request', (r) => { if (r.url().includes('/api/acceso-inicial/canjear')) canjes.push(r.url()) })
    await page.goto('/primer-acceso')
    await expect(page.getByTestId('acceso-no-valido')).toBeVisible()
    await expect(page.getByTestId('primer-acceso-form')).toHaveCount(0)
    textos.sinFragmento = await textoNoValido(page)
    expect(canjes).toEqual([])
    await contexto.close()

    expect(new Set(Object.values(textos)).size).toBe(1) // idénticos
    evidencia.accesoNoValido = { textos, casosDistintos: Object.keys(textos).length, textosUnicos: new Set(Object.values(textos)).size }
  })

  test('8. contraseñas inválidas: el mensaje aparece ANTES de enviar (0 solicitudes de canje) y el acceso sigue sirviendo', async ({ browser }) => {
    const { token } = await crearUsuarioSinClave(persona('pol'), 5)
    const contexto = await browser.newContext()
    const page = await contexto.newPage()
    const canjes: string[] = []
    page.on('request', (r) => { if (r.url().includes('/api/acceso-inicial/canjear')) canjes.push(r.method()) })
    await page.goto(`/primer-acceso#token=${token}`)
    await rellenar(page, 'corta')
    await expect(page.getByText('Tiene que tener al menos 8 caracteres')).toBeVisible()
    await rellenar(page, NUEVA_CLAVE, 'otra-distinta-123456')
    await expect(page.getByText('Las contraseñas no coinciden')).toBeVisible()
    expect(canjes).toEqual([])
    expect(sql(`SELECT count(*) FROM auth.verification WHERE identifier = 'reset-password:${token}'`)).toBe('1') // no se consumió
    await contexto.close()
  })

  test('9. con OTRA sesión abierta avisa antes de enviar y, al continuar, entra la persona invitada', async ({ browser }) => {
    const { token } = await crearUsuarioSinClave(persona('sesion'), 6)
    const contexto = await browser.newContext()
    const page = await contexto.newPage()
    await entrarUI(page, ADM)
    const antes = await sesionActual(page)
    await page.goto(`/primer-acceso#token=${token}`)
    await expect(page.getByTestId('aviso-sesion-existente')).toContainText('se cierra y entrás como la persona invitada')
    await rellenar(page, NUEVA_CLAVE)
    await expect(page).toHaveURL(/\/organismos$/)
    const despues = await sesionActual(page)
    expect(despues.cuerpo.usuarioId).not.toBe(antes.cuerpo.usuarioId)
    expect(despues.cuerpo).toMatchObject({ rol: 'usuario_normal', provinciaId: 6 })
    await contexto.close()
  })

  test('10. dos pestañas canjeando el MISMO acceso a la vez: solo una entra', async ({ browser }) => {
    const { token } = await crearUsuarioSinClave(persona('carrera'), 5)
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()
    const a = await ctxA.newPage()
    const b = await ctxB.newPage()
    await Promise.all([a.goto(`/primer-acceso#token=${token}`), b.goto(`/primer-acceso#token=${token}`)])
    await expect(a.getByTestId('primer-acceso-form')).toBeVisible()
    await expect(b.getByTestId('primer-acceso-form')).toBeVisible()
    await Promise.all([rellenar(a, 'clave-de-la-pestana-a-1'), rellenar(b, 'clave-de-la-pestana-b-2')])
    await expect.poll(async () => {
      const [sa, sb] = [(await sesionActual(a)).status, (await sesionActual(b)).status]
      return [sa, sb].sort().join(',')
    }, { timeout: 15000 }).toBe('200,401')
    // la que perdió muestra el mensaje único
    const perdedora = (await sesionActual(a)).status === 401 ? a : b
    await expect(perdedora.getByTestId('acceso-no-valido')).toBeVisible()
    evidencia.carrera = { sesiones: 'exactamente una' }
    await ctxA.close()
    await ctxB.close()
  })
})
