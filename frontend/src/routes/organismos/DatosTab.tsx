import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useParams } from 'react-router'
import { z } from 'zod'
import { useFuero } from '@/api/fuero'
import { preguntasPorPerder, useActualizarOrganismo, useOrganismo, type PreguntaPorPerder } from '@/api/organismos'
import { useDenominacionesSimplificadas, useProvincias, useTiposOficina } from '@/api/catalogos.hooks'
import { useSesion } from '@/auth/useSesion'
import SelectCatalogo from '@/components/forms/SelectCatalogo'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const Esquema = z.object({
  denominacion: z.string().trim().min(1, 'Ingresá la denominación'),
  denominacionSimplificadaId: z.number().positive(),
  tipoOficinaId: z.number().positive(),
  provinciaId: z.number().positive(),
})
type Valores = z.infer<typeof Esquema>

// Sin contexto de outlet: la pestaña vuelve a leer el organismo (ya cacheado por el layout).
export default function DatosTab() {
  const { id } = useParams()
  const orgId = Number(id)
  const { data: organismo } = useOrganismo(orgId)
  const { sesion } = useSesion()
  const fuero = useFuero(orgId)
  const provincias = useProvincias()
  const denominaciones = useDenominacionesSimplificadas()
  const tipos = useTiposOficina()
  const actualizar = useActualizarOrganismo(orgId)
  const [pendiente, setPendiente] = useState<{ datos: Valores; preguntas: PreguntaPorPerder[] } | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const esAdmin = sesion?.rol === 'admin'
  const form = useForm<Valores>({
    resolver: zodResolver(Esquema),
    // Sin `defaultValues`, el campo de texto arranca `undefined` (no controlado) y pasa a controlado al cargar.
    defaultValues: { denominacion: '' } as Valores,
    values: organismo && {
      denominacion: organismo.denominacion,
      denominacionSimplificadaId: organismo.denominacionSimplificadaId,
      tipoOficinaId: organismo.tipoOficinaId,
      provinciaId: organismo.provinciaId,
    },
  })

  async function guardar(datos: Valores, confirmar = false) {
    setMensaje(null)
    try {
      // La provincia solo se envía si el usuario es admin (decisión 6); si no, se omite.
      const { provinciaId, ...resto } = datos
      await actualizar.mutateAsync({
        ...resto,
        ...(esAdmin ? { provinciaId } : {}),
        ...(confirmar ? { confirmarPerdidaTaxonomia: true } : {}),
      })
      setPendiente(null)
      setMensaje({ tipo: 'ok', texto: 'Cambios guardados.' })
    } catch (e) {
      const preguntas = preguntasPorPerder(e)
      if (preguntas) {
        // Protección B: nunca se envía confirmarPerdidaTaxonomia de entrada; se pide confirmación.
        setPendiente({ datos, preguntas })
      } else {
        setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudieron guardar los cambios' })
      }
    }
  }

  if (!organismo) return null
  return (
    <div className="max-w-xl">
      <form onSubmit={form.handleSubmit((v) => guardar(v))} className="flex flex-col gap-4" noValidate>
        <Controller
          name="denominacion"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="denominacion">Denominación</FieldLabel>
              <Input {...field} id="denominacion" aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="denominacionSimplificadaId"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="denominacionSimplificadaId">Denominación simplificada</FieldLabel>
              <SelectCatalogo id="denominacionSimplificadaId" valor={field.value ?? null} opciones={denominaciones.data ?? []} alCambiar={field.onChange} />
            </Field>
          )}
        />
        <Controller
          name="tipoOficinaId"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="tipoOficinaId">Tipo de oficina</FieldLabel>
              <SelectCatalogo id="tipoOficinaId" valor={field.value ?? null} opciones={tipos.data ?? []} alCambiar={field.onChange} />
            </Field>
          )}
        />
        <Controller
          name="provinciaId"
          control={form.control}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="provinciaId">Provincia</FieldLabel>
              <SelectCatalogo id="provinciaId" valor={field.value ?? null} opciones={provincias.data ?? []} alCambiar={field.onChange} deshabilitado={!esAdmin} />
              {!esAdmin && <p className="text-xs text-muted-foreground">Solo un administrador puede cambiar la provincia.</p>}
            </Field>
          )}
        />
        <Field>
          <FieldLabel>Fuero</FieldLabel>
          <p data-testid="fuero-solo-lectura" className="text-sm text-muted-foreground">
            {fuero.data
              ? fuero.data.fueros.length === 0
                ? 'Sin fuero asignado'
                : `${fuero.data.fueros.map((f) => f.nombre).join(', ')}${fuero.data.fueroSimplificado ? ` (${fuero.data.fueroSimplificado})` : ''}`
              : 'Cargando…'}
          </p>
        </Field>
        {mensaje && (
          <div role={mensaje.tipo === 'error' ? 'alert' : 'status'} data-testid="mensaje-datos" className="rounded-md border p-3 text-sm">
            {mensaje.texto}
          </div>
        )}
        <Button type="submit" className="self-start" disabled={actualizar.isPending}>
          Guardar cambios
        </Button>
      </form>

      <AlertDialog open={pendiente !== null} onOpenChange={(abierto) => !abierto && setPendiente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar el tipo elimina respuestas de taxonomía</AlertDialogTitle>
            <AlertDialogDescription>
              Al cambiar el tipo, estas respuestas dejan de aplicar y se van a eliminar. No hay forma de recuperarlas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul data-testid="preguntas-por-perder" className="list-disc pl-5 text-sm">
            {pendiente?.preguntas.map((p) => (
              <li key={p.codigo}>{p.texto}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendiente && guardar(pendiente.datos, true)}>Cambiar el tipo y eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
