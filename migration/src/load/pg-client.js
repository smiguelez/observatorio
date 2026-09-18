import pg from 'pg';
import { loadPgConfig } from '../../config/env.js';

let pool;

export function getPgPool() {
  if (!pool) {
    pool = new pg.Pool(loadPgConfig());
  }
  return pool;
}

export async function closePgPool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

// Resuelve firestore_id -> id subrogado para una tabla ya cargada (FK entre
// entidades migradas en distintos pasos del pipeline, p. ej. usuarios.id desde
// organismos.usuario_google).
export async function resolveIdByFirestoreId(client, table, firestoreId) {
  const { rows } = await client.query(
    `SELECT id FROM ${table} WHERE firestore_id = $1`,
    [firestoreId],
  );
  if (rows.length === 0) {
    throw new Error(`No se encontró ${table} con firestore_id=${firestoreId}`);
  }
  return rows[0].id;
}

// Construye un mapa completo firestore_id -> id subrogado para una tabla, para
// resolver FKs en lote sin una consulta por fila.
export async function buildFirestoreIdMap(client, table) {
  const { rows } = await client.query(
    `SELECT id, firestore_id FROM ${table} WHERE firestore_id IS NOT NULL`,
  );
  return new Map(rows.map((row) => [row.firestore_id, row.id]));
}

// Cuenta las filas de una tabla en el destino, para la reconciliación (FR-031).
export async function countTable(client, table) {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n;
}

// Mapa nombre -> id para un catálogo (provincias, roles, fueros, etc.), para
// resolver FKs de vocabularios controlados sin una consulta por fila.
export async function buildNameIdMap(client, table) {
  const { rows } = await client.query(`SELECT id, nombre FROM ${table}`);
  return new Map(rows.map((row) => [row.nombre, row.id]));
}
