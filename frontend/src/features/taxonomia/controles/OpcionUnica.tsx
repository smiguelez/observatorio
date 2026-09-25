import type { PreguntaTaxonomia } from '@/api/taxonomia'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface Props {
  pregunta: PreguntaTaxonomia
  valor: string | null
  alCambiar: (v: string | null) => void
  idLeyenda: string
}

/** Opción única: selección simple (radio); se puede volver a "sin responder". */
export default function OpcionUnica({ pregunta, valor, alCambiar, idLeyenda }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <RadioGroup value={valor ?? ''} onValueChange={alCambiar} aria-labelledby={idLeyenda}>
        {pregunta.opciones.map((o) => {
          const id = `${pregunta.codigo}-${o.codigo}`
          return (
            <div key={o.codigo} className="flex items-start gap-2">
              <RadioGroupItem id={id} value={o.codigo} />
              <Label htmlFor={id} className="font-normal">
                {o.etiqueta}
              </Label>
            </div>
          )
        })}
      </RadioGroup>
      {valor !== null && (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => alCambiar(null)}>
          Quitar respuesta
        </Button>
      )}
    </div>
  )
}
