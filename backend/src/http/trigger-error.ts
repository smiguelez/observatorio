// T008 (004-fix-taxonomia-endpoint, US3): distingue un rechazo de trigger
// (integridad de esquema, 001/003/004) de un error de servidor genuino.
// SQLSTATE P0001 ("raise_exception") es el código genérico que Postgres
// asigna a un RAISE EXCEPTION sin ERRCODE propio — verificado contra la
// base real (research.md, Decisión 4), no asumido de la documentación.
export function esRechazoDeTrigger(err: unknown): err is { code: 'P0001'; message: string } {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P0001'
}
