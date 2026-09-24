import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

// T010 — spike de cookies (quickstart escenario 0). Requiere el usuario
// test-frontend-spike@example.test (ver docs/resultado-verificacion-frontend-cookies-*.md).
test('login por contraseña vía proxy de Vite: cookie same-origin y sesión 200', async ({ page, context }) => {
  const red: { method: string; url: string; status: number }[] = []
  const consola: string[] = []
  page.on('response', (r) => {
    if (r.url().includes('/api/')) red.push({ method: r.request().method(), url: r.url(), status: r.status() })
  })
  page.on('console', (m) => {
    if (m.type() === 'error') consola.push(m.text())
  })

  await page.goto('/')
  await page.getByLabel('email').fill('test-frontend-spike@example.test')
  await page.getByLabel('password').fill('contrasena-test-12345')
  await page.getByRole('button', { name: 'entrar' }).click()
  await expect(page.getByTestId('salida')).toContainText('sessionStatus')

  const cookies = (await context.cookies()).map((c) => ({
    name: c.name, domain: c.domain, path: c.path, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite,
  }))
  const salida = JSON.parse((await page.getByTestId('salida').textContent()) ?? '{}')
  const evidencia = { origen: page.url(), red, consola, cookies, salida }
  writeFileSync(process.env.SPIKE_OUT ?? 'test-results/spike-cookies.json', JSON.stringify(evidencia, null, 2))
  await page.screenshot({ path: process.env.SPIKE_PNG ?? 'test-results/spike-cookies.png' })

  expect(salida.sessionStatus).toBe(200)
  expect(consola.filter((l) => /CORS|INVALID_ORIGIN/i.test(l))).toEqual([])
  expect(cookies.some((c) => c.name.includes('session_token') && c.domain === 'localhost')).toBe(true)
})
