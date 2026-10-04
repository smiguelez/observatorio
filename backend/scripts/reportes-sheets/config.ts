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
// Vistas: backend/migrations/0005_vistas_reporting_dashboard1.ts (KPIs, agregado genuino) y
// backend/migrations/0007_vistas_detalle_dashboard1.ts (detalle — una fila por organismo/asignación,
// sin agrupar en SQL, para que Looker Studio pueda filtrar cruzado; ver docs/runbook-reportes-sheets.md).
//
// Las tres "por_tipo/por_fuero/por_provincia" son las vistas AGREGADAS viejas
// (restauradas por 0008 después de que 0007 las había borrado) — siguen acá a propósito:
// alimentan el reporte de Looker Studio ACTUAL, todavía en uso. Conviven con las de detalle
// hasta que el dashboard nuevo (con filtros cruzados) lo reemplace por completo; recién ahí se
// borran las vistas en una migración nueva (una migración aplicada no se edita) y se sacan
// estas tres líneas de acá.
export const REPORTES: ReporteConfig[] = [
  { vista: 'vista_kpis_generales', hoja: 'KPIs generales' },
  { vista: 'vista_organismos_por_tipo', hoja: 'Organismos por tipo' },
  { vista: 'vista_organismos_por_fuero', hoja: 'Organismos por fuero' },
  { vista: 'vista_organismos_por_provincia', hoja: 'Organismos por provincia' },
  { vista: 'vista_organismos_detalle', hoja: 'Organismos detalle' },
  { vista: 'vista_jueces_por_grupo', hoja: 'Jueces por grupo' },
]
