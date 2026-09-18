// Canonicalización aplicada en tránsito (FR-027, D7/D-08, D-09, D-04).

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

export function toTimestamptz(value) {
  if (value === null || value === undefined || value === '') return null;
  // Firestore Timestamp ya serializado como { _seconds, _nanoseconds } (no
  // debería aparecer en el snapshot JSON, pero se contempla por si el origen
  // en vivo lo entrega así).
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString();
  }
  return new Date(value).toISOString();
}

// D7/D-08: extrae el primer año de 4 dígitos reconocible del texto libre.
// "1/7/2021" -> 2021; "2015. Refuncionalización 2024" -> 2015 (el PRIMERO,
// no el último); "año 2023" -> 2023; "9" / "" -> null (sin año identificable).
export function extractAnioImplementacion(value) {
  if (value === null || value === undefined) return null;
  const texto = String(value).trim();
  if (texto === '') return null;
  const match = texto.match(/\d{4}/);
  if (!match) return null;
  const anio = Number(match[0]);
  return anio >= 1900 && anio <= 2100 ? anio : null;
}

// legacy_id llega como string numérico o ausente/null.
export function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// jueces_asistidos llega como number, string numérica, o ausente/null.
export function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Texto vacío ("") se trata como ausente (NULL), no como valor real
// (campos "vacíos legítimos" de data-model.md §4).
export function emptyToNull(value) {
  if (value === null || value === undefined) return null;
  const texto = String(value);
  return texto.trim() === '' ? null : texto;
}
