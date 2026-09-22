import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadFirestoreConfig } from '../../config/env.js';

let app;

// Conexión de solo-lectura a Firestore (respaldo — FR-033). La herramienta de
// migración nunca escribe en el origen.
export function getFirestoreClient() {
  if (!app) {
    const { credentialsPath, projectId } = loadFirestoreConfig();
    app = initializeApp({
      credential: credentialsPath ? cert(credentialsPath) : applicationDefault(),
      projectId,
    });
  }
  return getFirestore(app);
}

// Lee todos los documentos de una colección (o subcolección via collectionGroup)
// y los devuelve como { firestoreId, data }.
export async function readCollection(collectionPath) {
  const db = getFirestoreClient();
  const snapshot = await db.collection(collectionPath).get();
  return snapshot.docs.map((doc) => ({ firestoreId: doc.id, data: doc.data() }));
}

// Lee una colección agrupada por nombre (para subcolecciones como
// organismos/*/unidades_funcionales u organismos/*/taxonomia).
export async function readCollectionGroup(collectionId) {
  const db = getFirestoreClient();
  const snapshot = await db.collectionGroup(collectionId).get();
  return snapshot.docs.map((doc) => ({
    firestoreId: doc.id,
    parentId: doc.ref.parent.parent?.id ?? null,
    data: doc.data(),
  }));
}

// Conteo de una colección para la reconciliación (FR-031).
export async function countCollection(collectionPath) {
  const db = getFirestoreClient();
  const snapshot = await db.collection(collectionPath).count().get();
  return snapshot.data().count;
}
