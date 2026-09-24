// T008 (004-fix-taxonomia-endpoint, US3): distingue un rechazo de trigger
// (integridad de esquema, 001/003/004) de un error de servidor genuino.
// SQLSTATE P0001 ("raise_exception") es el código genérico que Postgres
// asigna a un RAISE EXCEPTION sin ERRCODE propio — verificado contra la
// base real (research.md, Decisión 4), no asumido de la documentación.
export function esRechazoDeTrigger(err: unknown): err is { code: 'P0001'; message: string } {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P0001'
}

// T007 (006-backend-endpoints-faltantes, US3): generaliza lo de arriba —
// las reglas de integridad de unidad_funcional_grupo_jueces/organismo_editores
// no se apoyan en triggers con RAISE EXCEPTION (P0001) sino en constraints
// declarativos simples (UNIQUE/CHECK/FK), que producen sus propios SQLSTATE
// estándar de Postgres — verificado empíricamente contra la base real
// (research.md, Decisión 2):
//   UNIQUE  -> 23505 (unique_violation)
//   CHECK   -> 23514 (check_violation)
//   FK      -> 23503 (foreign_key_violation)
// Sin esto, ninguno de esos 3 rechazos se detectaría como error de
// cliente — exactamente el mismo problema que motivó esta función en 004
// (D11), esta vez para un mecanismo de integridad distinto. No se
// duplica esRechazoDeTrigger: se generaliza, para no mantener dos
// helpers casi idénticos por separado.
const CODIGOS_INTEGRIDAD = new Set(['P0001', '23505', '23514', '23503'])

export function esRechazoDeIntegridad(
  err: unknown,
): err is { code: string; message: string; constraint?: string } {
  return typeof err === 'object' && err !== null && CODIGOS_INTEGRIDAD.has((err as { code?: unknown }).code as string)
}

// Decisión 3 (research.md): a diferencia de los mensajes de 001/003/004
// (RAISE EXCEPTION escritos a mano, ya en español, ya pensados para el
// cliente), el mensaje por default de una violación de UNIQUE/CHECK/FK es
// técnico ("duplicate key value violates unique constraint ..."). Se
// traduce por nombre de constraint (pg lo expone en err.constraint); un
// constraint no reconocido cae al mensaje crudo de Postgres como
// respaldo — sigue siendo 400, nunca bloquea por un caso no anticipado.
const MENSAJES_POR_CONSTRAINT: Record<string, string> = {
  unidad_funcional_grupo_jueces_unidad_funcional_id_grupo_jue_key:
    'Ya existe una asignación de esta unidad funcional a ese pool.',
  unidad_funcional_grupo_jueces_cantidad_asignada_check: 'La cantidad asignada debe ser mayor a 0.',
  unidad_funcional_grupo_jueces_grupo_jueces_id_fkey: 'El pool de jueces indicado no existe.',
  organismo_editores_pkey: 'Ese usuario ya es editor de este organismo.',
  organismo_editores_usuario_id_fkey: 'El usuario indicado no existe.',
}

export function mensajeDeIntegridad(err: { message: string; constraint?: string }): string {
  if (err.constraint && err.constraint in MENSAJES_POR_CONSTRAINT) {
    return MENSAJES_POR_CONSTRAINT[err.constraint]!
  }
  return err.message
}
