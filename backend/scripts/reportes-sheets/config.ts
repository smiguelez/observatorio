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
// Vistas de DETALLE (backend/migrations/0007_vistas_detalle_dashboard1.ts y siguientes) — una fila
// por entidad real, sin agrupar en SQL, para que Looker Studio pueda filtrar cruzado; ver
// docs/runbook-reportes-sheets.md, "Patrón: mandar detalle, no agregado".
//
// `vista_kpis_generales` y las tres "por_tipo/por_fuero/por_provincia" (las agregadas viejas que
// alimentaban el reporte de Looker Studio ACTUAL) se dieron de baja en
// backend/migrations/0013_baja_vistas_agregadas_dashboard1.ts, ahora que el dashboard nuevo (sobre
// estas vistas de detalle) lo reemplaza. Las vistas ya no existen en Postgres — por eso salieron
// de esta lista, no solo quedaron comentadas. Las pestañas correspondientes en la planilla NO se
// borraron solas (el script nunca borra una pestaña) — borrarlas en Sheets es un paso manual aparte.
export const REPORTES: ReporteConfig[] = [
  { vista: 'vista_organismos_detalle', hoja: 'Organismos detalle' },
  { vista: 'vista_jueces_por_grupo', hoja: 'Jueces por grupo' },
  { vista: 'vista_unidades_funcionales_detalle', hoja: 'UF detalle' },
  { vista: 'vista_usuarios_por_provincia', hoja: 'Usuarios por provincia' },
]
