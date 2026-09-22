import { normalizeEmail, toTimestamptz } from './canonicalize.js';

// FR-004/005/006: email normalizado a minúscula; perfiles mínimos (solo
// {email, rol, provincia}) migran el resto de columnas como NULL.
export function transformUsuario({ firestoreId, data }) {
  return {
    firestore_id: firestoreId,
    email: normalizeEmail(data.email ?? firestoreId),
    nombre_display: data.displayName ?? null,
    email_verificado: Boolean(data.emailVerified),
    foto_url: data.photoURL ?? null,
    provincia_nombre: data.provincia ?? null,
    creado_a: toTimestamptz(data.createdAt),
    ultimo_ingreso_a: toTimestamptz(data.lastSignInTime),
    creado_a_google: toTimestamptz(data.createdAtGoogle),
    roles: Array.isArray(data.rol) ? data.rol : [],
  };
}
