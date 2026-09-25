import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { ApiError } from '@/api/http'
import { useOrganismo } from '@/api/organismos'
import { useLocalidades, useTiposUf } from '@/api/catalogos.hooks'
import { useActualizarUnidad, useCrearUnidad, useUnidad, type DatosUnidad, type UnidadFuncional } from '@/api/unidades'
import SelectCatalogo from '@/components/forms/SelectCatalogo'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import AsignacionesDialog from '@/features/asignaciones/AsignacionesDialog'
import NoEncontrado from '@/routes/errores/NoEncontrado'

const Esquema = z.object({
  denominacionUnidad: z.string().trim().min(1, 'Ingresá la denominación'),
  localidadId: z.number({ error: 'Elegí la localidad' }),
  tipoUfId: z.number({ error: 'Elegí el tipo de unidad funcional' }),
  anioImplementacion: z.number().int('Ingresá un año').min(1900, 'Ingresá un año de 4 dígitos').max(2100, 'Ingresá un año de 4 dígitos').nullable(),
  domicilio: z.string(),
  telefono: z.string(),
  mail: z.string().refine((v) => v === '' || z.string().email().safeParse(v).success, 'Ingresá un email válido'),
  responsable: z.string(),
  codigoPostal: z.string(),
})
type Valores = z.infer<typeof Esquema>

const VACIOS: Valores = {
  denominacionUnidad: '', localidadId: undefined as never, tipoUfId: undefined as never, anioImplementacion: null,
  domicilio: '', telefono: '', mail: '', responsable: '', codigoPostal: '',
}

function desdeUnidad(u: UnidadFuncional): Valores {
  return {
    denominacionUnidad: u.denominacionUnidad, localidadId: u.localidadId, tipoUfId: u.tipoUfId,
    anioImplementacion: u.anioImplementacion, domicilio: u.domicilio ?? '', telefono: u.telefono ?? '',
    mail: u.mail ?? '', responsable: u.responsable ?? '', codigoPostal: u.codigoPostal ?? '',
  }
}

/** Alta (`/nueva`) y edición (`/:ufId`) de una unidad funcional; desde la edición se abre la asignación de jueces. */
export default function UnidadFormPage() {
  const { id, ufId } = useParams()
  const orgId = Number(id)
  const editando = ufId !== undefined
  const navigate = useNavigate()
  const { data: organismo } = useOrganismo(orgId)
  const unidad = useUnidad(orgId, editando ? Number(ufId) : undefined)
  const localidades = useLocalidades()
  const tipos = useTiposUf()
  const crear = useCrearUnidad(orgId)
  const actualizar = useActualizarUnidad(orgId, Number(ufId))
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [dialogo, setDialogo] = useState(false)

  const form = useForm<Valores>({ resolver: zodResolver(Esquema), defaultValues: VACIOS, values: editando ? (unidad.data && desdeUnidad(unidad.data)) : undefined })

  // La localidad se elige entre las de la provincia del organismo (el backend devuelve todas).
  const deLaProvincia = (localidades.data ?? []).filter((l) => l.provinciaId === organismo?.provinciaId)

  async function guardar(v: Valores) {
    setMensaje(null)
    // Opcionales de texto: '' se envía tal cual (COALESCE lo guarda como vacío); el año, si está vacío, se omite.
    const datos: DatosUnidad = {
      denominacionUnidad: v.denominacionUnidad, localidadId: v.localidadId, tipoUfId: v.tipoUfId,
      ...(v.anioImplementacion !== null ? { anioImplementacion: v.anioImplementacion } : {}),
      domicilio: v.domicilio, telefono: v.telefono, mail: v.mail, responsable: v.responsable, codigoPostal: v.codigoPostal,
    }
    try {
      if (editando) {
        // El backend no permite quitar un año ya cargado (PATCH con COALESCE): se avisa en vez de ignorarlo en silencio.
        if (unidad.data?.anioImplementacion != null && v.anioImplementacion === null) {
          form.setError('anioImplementacion', { message: 'El año no se puede quitar una vez cargado; podés cambiarlo por otro.' })
          return
        }
        await actualizar.mutateAsync(datos)
        setMensaje({ tipo: 'ok', texto: 'Cambios guardados.' })
      } else {
        const creada = await crear.mutateAsync(datos)
        navigate(`/organismos/${orgId}/unidades-funcionales/${creada.id}`, { replace: true })
      }
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar la unidad funcional' })
    }
  }

  if (editando && unidad.error instanceof ApiError && unidad.error.status === 404) return <NoEncontrado />
  if (editando && unidad.isPending) return <Skeleton className="h-40 w-full" />

  const texto = (name: 'denominacionUnidad' | 'domicilio' | 'telefono' | 'mail' | 'responsable' | 'codigoPostal', etiqueta: string) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{etiqueta}</FieldLabel>
          <Input {...field} id={name} aria-invalid={fieldState.invalid} />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )

  return (
    <section className="max-w-xl">
      <h2 className="text-base font-semibold">{editando ? 'Unidad funcional' : 'Nueva unidad funcional'}</h2>
      <form onSubmit={form.handleSubmit(guardar)} className="mt-4 flex flex-col gap-4" noValidate>
        {texto('denominacionUnidad', 'Denominación de la unidad')}
        <Controller
          name="localidadId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="localidadId">Localidad</FieldLabel>
              <SelectCatalogo id="localidadId" valor={field.value ?? null} opciones={deLaProvincia} alCambiar={field.onChange} invalido={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="tipoUfId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="tipoUfId">Tipo de unidad funcional</FieldLabel>
              <SelectCatalogo id="tipoUfId" valor={field.value ?? null} opciones={tipos.data ?? []} alCambiar={field.onChange} invalido={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="anioImplementacion"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="anioImplementacion">Año de implementación (opcional)</FieldLabel>
              <Input
                id="anioImplementacion" type="number" inputMode="numeric" aria-invalid={fieldState.invalid}
                value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        {texto('domicilio', 'Domicilio')}
        {texto('telefono', 'Teléfono')}
        {texto('mail', 'Email')}
        {texto('responsable', 'Responsable')}
        {texto('codigoPostal', 'Código postal')}
        {mensaje && (
          <div role={mensaje.tipo === 'error' ? 'alert' : 'status'} data-testid="mensaje-uf" className="rounded-md border p-3 text-sm">
            {mensaje.texto}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={crear.isPending || actualizar.isPending}>
            {editando ? 'Guardar cambios' : 'Crear unidad funcional'}
          </Button>
          {editando && unidad.data && (
            <Button type="button" variant="secondary" onClick={() => setDialogo(true)}>
              Asignación de jueces
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to={`/organismos/${orgId}/unidades-funcionales`}>Volver</Link>
          </Button>
        </div>
      </form>
      {editando && unidad.data && organismo && (
        <AsignacionesDialog open={dialogo} onOpenChange={setDialogo} orgId={orgId} unidad={unidad.data} provinciaId={organismo.provinciaId} />
      )}
    </section>
  )
}
