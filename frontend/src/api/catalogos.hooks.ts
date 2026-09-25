import { useQuery } from '@tanstack/react-query'
import {
  obtenerDenominacionesSimplificadas,
  obtenerFueros,
  obtenerLocalidades,
  obtenerProvincias,
  obtenerTiposOficina,
  obtenerTiposUf,
} from './catalogos'

// Catálogos de referencia: cambian raramente, se piden una vez por sesión.
const opciones = { staleTime: Infinity, gcTime: Infinity } as const

export const useProvincias = () => useQuery({ queryKey: ['catalogo', 'provincias'], queryFn: obtenerProvincias, ...opciones })
export const useDenominacionesSimplificadas = () =>
  useQuery({ queryKey: ['catalogo', 'denominaciones-simplificadas'], queryFn: obtenerDenominacionesSimplificadas, ...opciones })
export const useTiposOficina = () => useQuery({ queryKey: ['catalogo', 'tipos-oficina'], queryFn: obtenerTiposOficina, ...opciones })
export const useTiposUf = () => useQuery({ queryKey: ['catalogo', 'tipos-uf'], queryFn: obtenerTiposUf, ...opciones })
export const useFueros = () => useQuery({ queryKey: ['catalogo', 'fueros'], queryFn: obtenerFueros, ...opciones })
export const useLocalidades = () => useQuery({ queryKey: ['catalogo', 'localidades'], queryFn: obtenerLocalidades, ...opciones })
