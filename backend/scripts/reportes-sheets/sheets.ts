// Único módulo que sabe hablar con la API de Google Sheets — un `fetch` directo a la API v4 (igual
// criterio que `src/email/resend.ts`: sin el SDK `googleapis` completo para esto, que es un puñado
// de llamadas HTTP simples). La autenticación de cuenta de servicio sí usa `google-auth-library`
// (no se reimplementa la firma JWT a mano).
import { GoogleAuth } from 'google-auth-library'
import type { VistaLeida } from './postgres.js'

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

export async function obtenerTokenSheets(keyFile: string): Promise<string> {
  const auth = new GoogleAuth({ keyFile, scopes: [SCOPE] })
  const cliente = await auth.getClient()
  const { token } = await cliente.getAccessToken()
  if (!token) throw new Error('Google no devolvió un token de acceso')
  return token
}

function base(spreadsheetId: string) {
  return `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`
}

/** Crea la pestaña si todavía no existe. Nunca falla por "ya existe" (de eso se trata). */
export async function asegurarHoja(token: string, spreadsheetId: string, hoja: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` }
  const meta = await fetch(`${base(spreadsheetId)}?fields=sheets.properties.title`, { headers })
  if (!meta.ok) throw new Error(`No se pudo leer la planilla (¿spreadsheetId correcto? ¿la cuenta de servicio tiene acceso?): ${meta.status} ${await meta.text()}`)

  const json = (await meta.json()) as { sheets?: { properties: { title: string } }[] }
  const yaExiste = (json.sheets ?? []).some((s) => s.properties.title === hoja)
  if (yaExiste) return

  const crear = await fetch(`${base(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: hoja } } }] }),
  })
  if (!crear.ok) throw new Error(`No se pudo crear la pestaña "${hoja}": ${crear.status} ${await crear.text()}`)
}

/**
 * Reemplaza TODO el contenido de la pestaña (borra lo que haya con `values:clear` y escribe desde
 * A1) — nunca acumula filas entre corridas. Correcto para vistas de catálogo/KPI (el estado actual
 * completo en cada corrida), no para un historial que deba crecer con el tiempo.
 */
export async function sobrescribirHoja(token: string, spreadsheetId: string, hoja: string, datos: VistaLeida): Promise<void> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const limpiar = await fetch(`${base(spreadsheetId)}/values/${encodeURIComponent(hoja)}:clear`, { method: 'POST', headers })
  if (!limpiar.ok) throw new Error(`No se pudo limpiar la pestaña "${hoja}" antes de escribir: ${limpiar.status} ${await limpiar.text()}`)

  const valores = [datos.headers, ...datos.filas]
  const escribir = await fetch(`${base(spreadsheetId)}/values/${encodeURIComponent(hoja)}!A1?valueInputOption=RAW`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ range: `${hoja}!A1`, majorDimension: 'ROWS', values: valores }),
  })
  if (!escribir.ok) {
    throw new Error(`Se limpió "${hoja}" pero falló la escritura (queda en blanco hasta la próxima corrida): ${escribir.status} ${await escribir.text()}`)
  }
}
