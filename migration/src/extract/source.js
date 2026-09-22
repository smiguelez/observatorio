import { loadSourceConfig } from '../../config/env.js';
import { readCollection, readCollectionGroup, countCollection } from './firestore-client.js';
import {
  readCollectionFromSnapshot,
  readCollectionGroupFromSnapshot,
  countCollectionFromSnapshot,
} from './snapshot-source.js';

// Punto único de extracción: decide entre Firestore en vivo y el respaldo JSON
// según la configuración de entorno (config/env.js#loadSourceConfig). El resto
// del pipeline no distingue el origen.
export async function extractCollection(name) {
  const cfg = loadSourceConfig();
  return cfg.kind === 'snapshot'
    ? readCollectionFromSnapshot(cfg.snapshotPath, name)
    : readCollection(name);
}

export async function extractCollectionGroup(name) {
  const cfg = loadSourceConfig();
  return cfg.kind === 'snapshot'
    ? readCollectionGroupFromSnapshot(cfg.snapshotPath, name)
    : readCollectionGroup(name);
}

export async function extractCount(name) {
  const cfg = loadSourceConfig();
  return cfg.kind === 'snapshot'
    ? countCollectionFromSnapshot(cfg.snapshotPath, name)
    : countCollection(name);
}
