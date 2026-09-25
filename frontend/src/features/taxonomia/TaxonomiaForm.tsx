import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { ApiError } from '@/api/http'
import { useGuardarTaxonomia, type PreguntaTaxonomia, type RespuestaTaxonomia } from '@/api/taxonomia'
import { Button } from '@/components/ui/button'
import { construirEsquema, type ValoresTaxonomia } from './esquema'
import { armarPut, etiquetaGrupo, etiquetaPregunta, mezclar, preguntasDelError } from './mezclar'
import Numerica from './controles/Numerica'
import OpcionMultiple from './controles/OpcionMultiple'
import OpcionUnica from './controles/OpcionUnica'
import TextoLibre from './controles/TextoLibre'

interface Props {
  orgId: number
  catalogo: PreguntaTaxonomia[]
  respuestas: RespuestaTaxonomia[]
}

export default function TaxonomiaForm({ orgId, catalogo, respuestas }: Props) {
  const guardar = useGuardarTaxonomia(orgId)
  const esquema = useMemo(() => construirEsquema(catalogo), [catalogo])
  const form = useForm<ValoresTaxonomia>({
    // El esquema se construye en runtime: no hay tipo estático de sus campos.
    resolver: zodResolver(esquema) as never,
    defaultValues: mezclar(catalogo, respuestas),
  })
  const [error, setError] = useState<{ mensaje: string; resaltadas: string[] } | null>(null)
  const [guardado, setGuardado] = useState(false)

  const grupos = useMemo(() => {
    const m = new Map<string, PreguntaTaxonomia[]>()
    for (const p of catalogo) m.set(p.grupo, [...(m.get(p.grupo) ?? []), p])
    return [...m.entries()]
  }, [catalogo])

  async function enviar(valores: ValoresTaxonomia) {
    setError(null)
    setGuardado(false)
    try {
      // Siempre el conjunto COMPLETO (el PUT reemplaza): lo precargado y lo nuevo.
      const nuevas = await guardar.mutateAsync(armarPut(catalogo, valores))
      form.reset(mezclar(catalogo, nuevas))
      setGuardado(true)
    } catch (e) {
      const mensaje = e instanceof ApiError || e instanceof Error ? e.message : 'No se pudo guardar la taxonomía'
      setError({ mensaje, resaltadas: e instanceof ApiError && e.status === 400 ? preguntasDelError(mensaje, catalogo) : [] })
    }
  }

  return (
    <form onSubmit={form.handleSubmit(enviar)} className="flex max-w-2xl flex-col gap-6" noValidate data-testid="form-taxonomia">
      {grupos.map(([grupo, preguntas]) => (
        <section key={grupo} className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">{etiquetaGrupo(grupo)}</h2>
          {preguntas.map((p) => {
            const idLeyenda = `leyenda-${p.codigo}`
            const marcada = error?.resaltadas.includes(p.codigo)
            return (
              <Controller
                key={p.codigo}
                name={p.codigo}
                control={form.control}
                render={({ field, fieldState }) => (
                  <fieldset
                    data-testid={`pregunta-${p.codigo}`}
                    data-tipo={p.tipoRespuesta}
                    data-invalid={fieldState.invalid || marcada ? 'true' : undefined}
                    className="flex flex-col gap-2 rounded-md border p-3 data-[invalid=true]:border-destructive"
                  >
                    <legend id={idLeyenda} className="px-1 text-sm font-medium">
                      {etiquetaPregunta(p)}
                    </legend>
                    {p.tipoRespuesta === 'opcion_unica' && (
                      <OpcionUnica pregunta={p} valor={field.value as string | null} alCambiar={field.onChange} idLeyenda={idLeyenda} />
                    )}
                    {p.tipoRespuesta === 'opcion_multiple' && (
                      <OpcionMultiple pregunta={p} valor={field.value as string[]} alCambiar={field.onChange} idLeyenda={idLeyenda} />
                    )}
                    {p.tipoRespuesta === 'numerica' && (
                      <Numerica pregunta={p} valor={field.value as number | null} alCambiar={field.onChange} idLeyenda={idLeyenda} invalido={fieldState.invalid} />
                    )}
                    {p.tipoRespuesta === 'texto_libre' && (
                      <TextoLibre pregunta={p} valor={field.value as string} alCambiar={field.onChange} idLeyenda={idLeyenda} />
                    )}
                    {fieldState.error && <p role="alert" className="text-sm text-destructive">{fieldState.error.message}</p>}
                    {marcada && <p className="text-sm text-destructive">El servidor rechazó esta pregunta.</p>}
                  </fieldset>
                )}
              />
            )
          })}
        </section>
      ))}
      {error && (
        <div role="alert" data-testid="taxonomia-error" className="rounded-md border border-destructive/50 p-3 text-sm">
          <p className="font-medium">No se pudo guardar la taxonomía.</p>
          <p>{error.mensaje}</p>
        </div>
      )}
      {guardado && (
        <p role="status" data-testid="taxonomia-guardada" className="text-sm">
          Respuestas guardadas.
        </p>
      )}
      <Button type="submit" className="self-start" disabled={guardar.isPending}>
        Guardar taxonomía
      </Button>
    </form>
  )
}
