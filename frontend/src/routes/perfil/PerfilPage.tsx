import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useProvincias } from '@/api/catalogos.hooks'
import { useActualizarUsuario, useUsuario } from '@/api/usuarios'
import { useSesion } from '@/auth/useSesion'
import SelectCatalogo from '@/components/forms/SelectCatalogo'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import CambiarPassword from './CambiarPassword'
import MetodosAcceso from './MetodosAcceso'

const Esquema = z.object({
  nombreDisplay: z.string().trim(),
  provinciaId: z.number().nullable(),
  fotoUrl: z.string().refine((v) => v === '' || z.string().url().safeParse(v).success, 'Ingresá una URL válida'),
})
type Valores = z.infer<typeof Esquema>

export default function PerfilPage() {
  const { sesion } = useSesion()
  const usuario = useUsuario(sesion?.usuarioId)
  const provincias = useProvincias()
  const actualizar = useActualizarUsuario(sesion!.usuarioId)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const form = useForm<Valores>({
    resolver: zodResolver(Esquema),
    defaultValues: { nombreDisplay: '', provinciaId: null, fotoUrl: '' },
    values: usuario.data && { nombreDisplay: usuario.data.nombreDisplay ?? '', provinciaId: usuario.data.provinciaId, fotoUrl: usuario.data.fotoUrl ?? '' },
  })

  async function guardar(v: Valores) {
    setMensaje(null)
    try {
      // PATCH con COALESCE: solo se envía lo que tiene valor (la provincia no se puede vaciar una vez cargada).
      await actualizar.mutateAsync({
        nombreDisplay: v.nombreDisplay,
        ...(v.provinciaId !== null ? { provinciaId: v.provinciaId } : {}),
        fotoUrl: v.fotoUrl,
      })
      setMensaje({ tipo: 'ok', texto: 'Cambios guardados.' })
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudieron guardar los cambios' })
    }
  }

  if (usuario.isPending) return <Skeleton className="h-40 w-full" />
  if (usuario.isError || !usuario.data) {
    return <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">No pudimos cargar tu perfil.</div>
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <section>
        <h1 className="text-xl font-semibold">Perfil</h1>
        <p data-testid="perfil-email" className="text-sm text-muted-foreground">{usuario.data.email}</p>
        <form onSubmit={form.handleSubmit(guardar)} className="mt-4 flex flex-col gap-4" noValidate aria-label="Datos personales">
          <Controller
            name="nombreDisplay"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="nombreDisplay">Nombre</FieldLabel>
                <Input {...field} id="nombreDisplay" aria-invalid={fieldState.invalid} />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="provinciaId"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="provinciaId">Provincia</FieldLabel>
                <SelectCatalogo id="provinciaId" valor={field.value ?? null} opciones={provincias.data ?? []} alCambiar={field.onChange} placeholder="Sin provincia cargada" />
              </Field>
            )}
          />
          <Controller
            name="fotoUrl"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="fotoUrl">Foto (URL, opcional)</FieldLabel>
                <Input {...field} id="fotoUrl" aria-invalid={fieldState.invalid} />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          {mensaje && (
            <div role={mensaje.tipo === 'error' ? 'alert' : 'status'} data-testid="mensaje-perfil" className="rounded-md border p-3 text-sm">{mensaje.texto}</div>
          )}
          <Button type="submit" className="self-start" disabled={actualizar.isPending}>Guardar cambios</Button>
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold">Métodos de acceso</h2>
        <div className="mt-2"><MetodosAcceso /></div>
      </section>

      <section>
        <h2 className="text-base font-semibold">Contraseña</h2>
        <div className="mt-2"><CambiarPassword /></div>
      </section>
    </div>
  )
}
