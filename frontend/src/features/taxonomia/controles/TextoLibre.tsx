import type { PreguntaTaxonomia } from '@/api/taxonomia'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  pregunta: PreguntaTaxonomia
  valor: string
  alCambiar: (v: string) => void
  idLeyenda: string
}

/** Texto libre: campo de texto. Vacío = no responder. */
export default function TextoLibre({ pregunta, valor, alCambiar, idLeyenda }: Props) {
  return <Textarea id={`${pregunta.codigo}-valor`} aria-labelledby={idLeyenda} value={valor} onChange={(e) => alCambiar(e.target.value)} />
}
