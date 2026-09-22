// Carga de configuración desde variables de entorno (Principio XIII).
// Ninguna ruta ni credencial se hardcodea acá: todo viene de env/gestor de secretos.

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} (ver quickstart.md, Prerrequisitos)`);
  }
  return value;
}

export function loadPgConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: required('PGHOST'),
    port: Number(process.env.PGPORT || 5432),
    database: required('PGDATABASE'),
    user: required('PGUSER'),
    password: process.env.PGPASSWORD,
  };
}

export function loadFirestoreConfig() {
  return {
    credentialsPath: required('GOOGLE_APPLICATION_CREDENTIALS'),
    projectId: process.env.FIRESTORE_PROJECT_ID,
  };
}

// Fuente de extracción: Firestore en vivo (GOOGLE_APPLICATION_CREDENTIALS) o un
// respaldo ya exportado a JSON (FIRESTORE_SNAPSHOT_PATH) cuando no hay acceso
// en vivo disponible. Ambas son solo-lectura (FR-033); ninguna ruta hardcodeada.
export function loadSourceConfig() {
  if (process.env.FIRESTORE_SNAPSHOT_PATH) {
    return { kind: 'snapshot', snapshotPath: required('FIRESTORE_SNAPSHOT_PATH') };
  }
  return { kind: 'firestore', ...loadFirestoreConfig() };
}
