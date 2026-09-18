import { readFileSync } from 'node:fs';

// Adaptador de solo-lectura sobre un respaldo de Firestore ya exportado a JSON
// (FR-033). Expone la misma forma que firestore-client.js (`{firestoreId,
// data}` / `{firestoreId, parentId, data}`) para que los módulos de extracción
// no necesiten saber si el origen es Firestore en vivo o su respaldo.

let cache;

function loadSnapshot(path) {
  if (!cache) {
    cache = JSON.parse(readFileSync(path, 'utf8'));
  }
  return cache;
}

export function readCollectionFromSnapshot(path, collectionName) {
  const data = loadSnapshot(path);
  const items = data[collectionName] || [];
  return items.map((item) => {
    const { _id, ...rest } = item;
    delete rest.unidades_funcionales;
    delete rest.taxonomia;
    return { firestoreId: _id, data: rest };
  });
}

// Subcolecciones embebidas bajo cada organismo en el snapshot: unidades_funcionales
// (array) y taxonomia (mapa doc-id -> contenido, en la práctica solo 'v1').
export function readCollectionGroupFromSnapshot(path, groupName) {
  const data = loadSnapshot(path);
  const results = [];
  for (const org of data.organismos || []) {
    if (groupName === 'unidades_funcionales') {
      for (const { _id, ...rest } of org.unidades_funcionales || []) {
        results.push({ firestoreId: _id, parentId: org._id, data: rest });
      }
    } else if (groupName === 'taxonomia' && org.taxonomia) {
      for (const [docId, docData] of Object.entries(org.taxonomia)) {
        results.push({ firestoreId: docId, parentId: org._id, data: docData });
      }
    }
  }
  return results;
}

export function countCollectionFromSnapshot(path, collectionName) {
  return readCollectionFromSnapshot(path, collectionName).length;
}
