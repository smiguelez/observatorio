import type { PreguntaTaxonomia } from '@/api/taxonomia'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface Props {
  pregunta: PreguntaTaxonomia
  valor: string[]
  alCambiar: (v: string[]) => void
  idLeyenda: string
}

/** Opción múltiple: casillas. Ninguna marcada = no responder (no es un error). */
export default function OpcionMultiple({ pregunta, valor, alCambiar, idLeyenda }: Props) {
  return (
    <div role="group" aria-labelledby={idLeyenda} className="flex flex-col gap-2">
      {pregunta.opciones.map((o) => {
        const id = `${pregunta.codigo}-${o.codigo}`
        const marcada = valor.includes(o.codigo)
        return (
          <div key={o.codigo} className="flex items-start gap-2">
            <Checkbox
              id={id}
              checked={marcada}
              onCheckedChange={(c) => alCambiar(c === true ? [...valor, o.codigo] : valor.filter((x) => x !== o.codigo))}
            />
            <Label htmlFor={id} className="font-normal">
              {o.etiqueta}
            </Label>
          </div>
        )
      })}
    </div>
  )
}
