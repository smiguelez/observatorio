import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { FilaCompletitud } from './evaluar'

export const CABECERA_PDF = ['Organismo', 'Datos básicos', 'Unidades funcionales', 'Taxonomía', 'Estado']

const marca = (ok: boolean) => (ok ? 'Completo' : 'Incompleto')

/** Filas del PDF: exactamente las que muestra la tabla en pantalla (misma fuente). */
export function filasParaPdf(filas: FilaCompletitud[]): string[][] {
  return filas.map((f) => [
    f.denominacion,
    marca(f.datosBasicos),
    marca(f.unidades),
    f.catalogoVacio && f.taxonomia ? 'Completo (sin preguntas aplicables)' : marca(f.taxonomia),
    f.completo ? 'Completo' : 'Incompleto',
  ])
}

/** Genera el PDF en el navegador (sin servicio de backend). Devuelve los bytes. */
export function generarPdf(filas: FilaCompletitud[], fecha = new Date()): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'landscape' })
  const completos = filas.filter((f) => f.completo).length
  doc.setFontSize(14)
  doc.text('Estado de completitud de los organismos', 14, 14)
  doc.setFontSize(10)
  doc.text(`${completos} de ${filas.length} organismos completos — ${fecha.toISOString().slice(0, 10)}`, 14, 21)
  autoTable(doc, { head: [CABECERA_PDF], body: filasParaPdf(filas), startY: 26, styles: { fontSize: 8 } })
  return doc.output('arraybuffer')
}

export function descargarPdf(filas: FilaCompletitud[]): void {
  const bytes = generarPdf(filas)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `completitud-organismos-${new Date().toISOString().slice(0, 10)}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
