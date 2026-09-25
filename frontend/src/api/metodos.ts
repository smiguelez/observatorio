import { useQuery } from '@tanstack/react-query'
import { authClient } from './auth-client'

export interface Metodos {
  contrasena: boolean
  google: boolean
}

/** Cuentas vinculadas (`providerId`): `credential` = contraseña, `google` = Google. */
export async function obtenerMetodos(): Promise<Metodos> {
  const { data, error } = await authClient.listAccounts()
  if (error) throw new Error(error.message ?? 'No se pudieron consultar los métodos de acceso')
  const ids = new Set((data ?? []).map((a: { providerId?: string }) => a.providerId))
  return { contrasena: ids.has('credential'), google: ids.has('google') }
}

export const useMetodos = () => useQuery({ queryKey: ['metodos-acceso'], queryFn: obtenerMetodos, retry: false })
