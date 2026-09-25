import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { useCrearOrganismo } from '@/api/organismos'
import { useDenominacionesSimplificadas, useProvincias, useTiposOficina } from '@/api/catalogos.hooks'
import { useSesion } from '@/auth/useSesion'
import SelectCatalogo from '@/components/forms/SelectCatalogo'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const Esquema = z.object({
  denominacion: z.string().trim().min(1, 'Ingresá la denominación'),
  denominacionSimplificadaId: z.number({ error: 'Elegí una denominación simplificada' }),
  tipoOficinaId: z.number({ error: 'Elegí el tipo de oficina' }),
  provinciaId: z.number({ error: 'Elegí la provincia' }),
})
type Valores = z.infer<typeof Esquema>

export default function OrganismoNuevoPage() {
  const navigate = useNavigate()
  const { sesion } = useSesion()
  const crear = useCrearOrganismo()
  const provincias = useProvincias()
  const denominaciones = useDenominacionesSimplificadas()
  const tipos = useTiposOficina()
  const [errorServidor, setErrorServidor] = useState<string | null>(null)

  const esAdmin = sesion?.rol === 'admin'
  // Provincia (decisión 6): fija = la del perfil para usuario_normal, editable para admin.
  // Es UX, no control de acceso: el backend no la compara con la del usuario.
  const provinciaPerfil = sesion?.provinciaId ?? null
  const sinProvincia = !esAdmin && provinciaPerfil === null

  const form = useForm<Valores>({
    resolver: zodResolver(Esquema),
    defaultValues: { denominacion: '', provinciaId: provinciaPerfil ?? undefined } as Partial<Valores> as Valores,
  })

  async function enviar(v: Valores) {
    setErrorServidor(null)
    try {
      const creado = await crear.mutateAsync(v)
      navigate(`/organismos/${creado.id}`)
    } catch (e) {
      setErrorServidor(e instanceof Error ? e.message : 'No se pudo crear el organismo')
    }
  }

  if (sinProvincia) {
    return (
      <section className="mx-auto max-w-xl" data-testid="alta-sin-provincia">
        <h1 className="text-xl font-semibold">Nuevo organismo</h1>
        <div role="alert" className="mt-4 rounded-md border p-4 text-sm">
          Para dar de alta un organismo primero tenés que completar tu provincia en tu perfil.{' '}
          <Link className="underline" to="/perfil">
            Ir a mi perfil
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold">Nuevo organismo</h1>
      <form onSubmit={form.handleSubmit(enviar)} className="mt-4 flex flex-col gap-4" noValidate>
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
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="denominacionSimplificadaId">Denominación simplificada</FieldLabel>
              <SelectCatalogo
                id="denominacionSimplificadaId"
                valor={field.value ?? null}
                opciones={denominaciones.data ?? []}
                alCambiar={field.onChange}
                invalido={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="tipoOficinaId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="tipoOficinaId">Tipo de oficina</FieldLabel>
              <SelectCatalogo
                id="tipoOficinaId"
                valor={field.value ?? null}
                opciones={tipos.data ?? []}
                alCambiar={field.onChange}
                invalido={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="provinciaId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="provinciaId">Provincia</FieldLabel>
              <SelectCatalogo
                id="provinciaId"
                valor={field.value ?? null}
                opciones={provincias.data ?? []}
                alCambiar={field.onChange}
                deshabilitado={!esAdmin}
                invalido={fieldState.invalid}
              />
              {!esAdmin && <p className="text-xs text-muted-foreground">Es la provincia de tu perfil y no se puede cambiar acá.</p>}
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Field>
          <FieldLabel>Fuero</FieldLabel>
          <p data-testid="fuero-solo-lectura" className="text-sm text-muted-foreground">
            Sin fuero asignado. El fuero se muestra solo como lectura y no se edita desde esta pantalla.
          </p>
        </Field>
        {errorServidor && (
          <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">
            {errorServidor}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Crear organismo
          </Button>
          <Button asChild variant="outline">
            <Link to="/organismos">Cancelar</Link>
          </Button>
        </div>
      </form>
    </section>
  )
}
