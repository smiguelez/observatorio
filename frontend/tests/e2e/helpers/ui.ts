import { expect, type Page } from '@playwright/test'
import { CLAVE } from './backend'

export async function entrarUI(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/organismos$/)
}

/** Elige una opción de un combo shadcn (Radix Select) por su id de trigger y el texto de la opción. */
export async function elegir(page: Page, idTrigger: string, opcion: string | RegExp): Promise<void> {
  await page.locator(`#${idTrigger}`).click()
  const opciones = typeof opcion === 'string' ? page.getByRole('option', { name: opcion, exact: true }) : page.getByRole('option', { name: opcion }).first()
  await opciones.click()
}
