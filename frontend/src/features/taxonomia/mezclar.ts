import type { PreguntaTaxonomia, RespuestaPut, RespuestaTaxonomia } from '@/api/taxonomia'
import type { ValoresTaxonomia } from './esquema'

/** Catálogo ⊕ respuestas existentes (por `codigo`) → valores iniciales del formulario. */
export function mezclar(catalogo: PreguntaTaxonomia[], respuestas: RespuestaTaxonomia[]): ValoresTaxonomia {
  const porCodigo = new Map(respuestas.map((r) => [r.preguntaCodigo, r]))
  const valores: ValoresTaxonomia = {}
  for (const p of catalogo) {
    const r = porCodigo.get(p.codigo)
    switch (p.tipoRespuesta) {
      case 'opcion_unica':
        valores[p.codigo] = r?.opcionesCodigos[0] ?? null
        break
      case 'opcion_multiple':
        valores[p.codigo] = r?.opcionesCodigos ?? []
        break
      case 'numerica':
        valores[p.codigo] = r?.valorNumero ?? null
        break
      case 'texto_libre':
        valores[p.codigo] = r?.valorTexto ?? ''
        break
    }
  }
  return valores
}

/**
 * Valores del formulario → cuerpo del PUT. El PUT REEMPLAZA el conjunto completo (omitir borra),
 * así que se envían TODAS las respuestas no vacías; una múltiple sin selección, un texto vacío o una
 * numérica sin valor se omiten (equivale a no responder — no es un error).
 */
export function armarPut(catalogo: PreguntaTaxonomia[], valores: ValoresTaxonomia): RespuestaPut[] {
  const salida: RespuestaPut[] = []
  for (const p of catalogo) {
    const v = valores[p.codigo]
    switch (p.tipoRespuesta) {
      case 'opcion_unica':
        if (typeof v === 'string') salida.push({ preguntaCodigo: p.codigo, opcionesCodigos: [v] })
        break
      case 'opcion_multiple':
        if (Array.isArray(v) && v.length > 0) salida.push({ preguntaCodigo: p.codigo, opcionesCodigos: v })
        break
      case 'numerica':
        if (typeof v === 'number' && Number.isFinite(v)) salida.push({ preguntaCodigo: p.codigo, valorNumero: v })
        break
      case 'texto_libre':
        if (typeof v === 'string' && v.trim() !== '') salida.push({ preguntaCodigo: p.codigo, valorTexto: v })
        break
    }
  }
  return salida
}

/**
 * Enunciado a mostrar. En la base real `taxonomia_preguntas.texto` es idéntico al `codigo`
 * (p. ej. "insercion_institucional"; verificado 2026-09-24) — el enunciado real no está cargado.
 * Mientras tanto, si el texto es el código, se muestra una versión legible (sin guiones bajos)
 * en vez del identificador crudo (FR-008).
 */
export function etiquetaPregunta(p: Pick<PreguntaTaxonomia, 'codigo' | 'texto'>): string {
  const base = p.texto && p.texto !== p.codigo ? p.texto : p.codigo.replaceAll('_', ' ')
  return base.charAt(0).toUpperCase() + base.slice(1)
}
export const etiquetaGrupo = (grupo: string) => etiquetaPregunta({ codigo: grupo, texto: grupo })

/**
 * Preguntas a resaltar ante un 400 del PUT. Los mensajes de los triggers identifican la pregunta por su
 * id interno numérico (no por `codigo`; ver backend/migrations/0001..0003), que el cliente no conoce:
 * solo el caso "Pregunta(s) inexistente(s): a, b" trae códigos. En los demás la UI muestra el mensaje
 * completo del servidor sin resaltar ninguna.
 */
export function preguntasDelError(mensaje: string, catalogo: PreguntaTaxonomia[]): string[] {
  return catalogo
    .filter((p) => new RegExp(`(^|[^\\p{L}\\p{N}_])${p.codigo}($|[^\\p{L}\\p{N}_])`, 'u').test(mensaje))
    .map((p) => p.codigo)
}
