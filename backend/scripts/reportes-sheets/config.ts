// Mapeo "vista SQL" -> "pestaña de Sheets". Agregar un reporte nuevo es agregar una línea acá, no
// escribir código nuevo — ver docs/runbook-reportes-sheets.md para el patrón completo (de punta a
// punta: crear la vista, agregar la línea, correr el script).
export interface ReporteConfig {
  /** Vista de Postgres a leer (ya debe existir — ver backend/migrations/). */
  vista: string
  /** Nombre EXACTO de la pestaña en la planilla (se crea sola si no existe todavía). */
  hoja: string
}

// Fase D, dashboard 1 — "Datos Generales del Observatorio" (docs/inventario-tableros-actuales.md).
// Vistas: backend/migrations/0005_vistas_reporting_dashboard1.ts.
export const REPORTES: ReporteConfig[] = [
  { vista: 'vista_kpis_generales', hoja: 'KPIs generales' },
  { vista: 'vista_organismos_por_tipo', hoja: 'Organismos por tipo' },
  { vista: 'vista_organismos_por_fuero', hoja: 'Organismos por fuero' },
  { vista: 'vista_organismos_por_provincia', hoja: 'Organismos por provincia' },
]
