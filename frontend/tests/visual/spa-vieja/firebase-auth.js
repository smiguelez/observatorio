// Stub de `firebase/auth`: siempre hay un usuario SINTÉTICO logueado.
export const USUARIO_FICTICIO = {
  email: 'usuario@ejemplo.test', displayName: 'Usuario de Ejemplo', emailVerified: true, photoURL: null,
  metadata: { lastSignInTime: '2026-01-01', creationTime: '2026-01-01' },
}
const auth = { currentUser: USUARIO_FICTICIO }
export const getAuth = () => auth
export class GoogleAuthProvider {}
export const signInWithPopup = async () => ({ user: USUARIO_FICTICIO })
export const signOut = async () => {}
export const onAuthStateChanged = (_auth, cb) => { cb(USUARIO_FICTICIO); return () => {} }
