import { USUARIO_FICTICIO } from './firebase-auth.js'
const resultado = [USUARIO_FICTICIO, false, undefined] // referencia estable: el efecto de App depende de `user`
export const useAuthState = () => resultado
