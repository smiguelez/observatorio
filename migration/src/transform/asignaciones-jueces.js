import { toNumberOrNull } from './canonicalize.js';

// D8/FR-017/FR-018: por UF, exactamente uno de los dos modos (o ninguno).
// 'pool' -> una asignación al grupo del pool con cantidad_asignada = su
// total_jueces. 'exclusivo' -> se deriva un grupos_jueces nuevo (un solo
// miembro) con total_jueces = jueces_asistidos. 'ninguno' -> cero asignaciones
// (sin jueces por diseño, no dato faltante).
//
// D-16 (decisión de esta corrida, confirmada por el usuario): jueces_asistidos
// = "0" explícito (9 UF, todas oficinas de Coordinación) se trata igual que
// ausente -> 'ninguno'. El esquema exige cantidad_asignada > 0 (FR-018), y
// FR-018c ya define "cero asignaciones = sin jueces por diseño"; un 0 explícito
// es exactamente ese caso, no una asignación de cantidad cero. Esto no estaba
// cubierto por V3.3 (que solo contaba UF con AMBOS campos ausentes = 2); sube
// el total de UF sin jueces de 2 a 11, y el total de asignaciones esperado de
// 275 (quickstart.md, referencia 2026-09-07) a 266.
export function resolverModoAsignacion(uf) {
  const jueces = toNumberOrNull(uf.jueces_asistidos);
  if (uf.pool_jueces_firestore_id) return { modo: 'pool', poolFirestoreId: uf.pool_jueces_firestore_id };
  if (jueces !== null && jueces > 0) return { modo: 'exclusivo', juecesAsistidos: jueces };
  return { modo: 'ninguno' };
}
