import { toIntOrNull, toTimestamptz, normalizeEmail } from './canonicalize.js';

const FUEROS_CONCRETOS = new Set(['penal', 'civil', 'familia', 'laboral']);

// D3/D-06: estado_fueros se deriva de fuero_simplificado (FR-013/014).
// 'multifuero' -> multifuero_sin_detalle (fueros concretos desconocidos);
// un fuero concreto -> cargado (además, 1 fila en organismo_fueros);
// ausente -> sin_fueros_asignados (no observado en los datos actuales).
export function deriveEstadoFueros(fueroSimplificado) {
  if (!fueroSimplificado) return 'sin_fueros_asignados';
  if (fueroSimplificado === 'multifuero') return 'multifuero_sin_detalle';
  if (FUEROS_CONCRETOS.has(fueroSimplificado)) return 'cargado';
  throw new Error(`organismos: fuero_simplificado desconocido "${fueroSimplificado}"`);
}

export function transformOrganismo({ firestoreId, data }) {
  return {
    firestore_id: firestoreId,
    denominacion: data.denominacion,
    denominacion_simplificada_nombre: data.denominacion_simplificada,
    tipo_oficina_nombre: data.tipo_oficina,
    provincia_nombre: data.provincia,
    propietario_email: normalizeEmail(data.usuario_google),
    estado_fueros: deriveEstadoFueros(data.fuero_simplificado),
    fuero_simplificado: data.fuero_simplificado ?? null,
    legacy_id: toIntOrNull(data.legacy_id),
    actualizado_a: toTimestamptz(data.actualizado_a),
    editores: Array.isArray(data.editores) ? data.editores.map(normalizeEmail) : [],
  };
}
