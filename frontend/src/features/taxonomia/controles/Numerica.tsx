import type { PreguntaTaxonomia } from '@/api/taxonomia'
import { Input } from '@/components/ui/input'

interface Props {
  pregunta: PreguntaTaxonomia
  valor: number | null
  alCambiar: (v: number | null) => void
  idLeyenda: string
  invalido?: boolean
}

/** Numérica: campo numérico. Vacío = no responder; el 0 es una respuesta válida. */
export default function Numerica({ pregunta, valor, alCambiar, idLeyenda, invalido }: Props) {
  return (
    <Input
      id={`${pregunta.codigo}-valor`}
      type="number"
      inputMode="decimal"
      aria-labelledby={idLeyenda}
      aria-invalid={invalido}
      value={valor ?? ''}
      onChange={(e) => alCambiar(e.target.value === '' ? null : Number(e.target.value))}
    />
  )
}
