import type { Catalogo } from '@/api/catalogos'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  id: string
  valor: number | null
  opciones: Catalogo[]
  alCambiar: (valor: number) => void
  placeholder?: string
  deshabilitado?: boolean
  invalido?: boolean
}

/** Combo de un catálogo `{id, nombre}`; el valor es el id numérico (Radix trabaja con strings). */
export default function SelectCatalogo({ id, valor, opciones, alCambiar, placeholder = 'Elegí una opción', deshabilitado, invalido }: Props) {
  // Radix llama a onValueChange('') al limpiar/sincronizar el valor: Number('') es 0, un id inexistente
  // (el backend respondería 500 por FK). Se ignora.
  return (
    <Select value={valor == null ? '' : String(valor)} onValueChange={(v) => { if (v !== '') alCambiar(Number(v)) }} disabled={deshabilitado}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalido}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.id} value={String(o.id)}>
            {o.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
