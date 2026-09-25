import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { authClient } from '@/api/auth-client'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useMetodos } from '@/api/metodos'

const MIN = 8 // mínimo por defecto de Better Auth

const Esquema = z
  .object({
    actual: z.string().min(1, 'Ingresá tu contraseña actual'),
    nueva: z.string().min(MIN, `Usá al menos ${MIN} caracteres`),
    confirmacion: z.string().min(1, 'Repetí la contraseña nueva'),
  })
  .refine((v) => v.nueva === v.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden' })
type Valores = z.infer<typeof Esquema>

/**
 * Cambiar contraseña: SOLO si la cuenta ya tiene una (US6). Fijar una contraseña a quien no tiene ninguna
 * no se ofrece: el backend no lo expone al cliente (`setPassword` es de servidor) — diferido a `007`.
 */
export default function CambiarPassword() {
  const { data: metodos, isPending } = useMetodos()
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const form = useForm<Valores>({ resolver: zodResolver(Esquema), defaultValues: { actual: '', nueva: '', confirmacion: '' } })

  if (isPending) return null
  if (!metodos?.contrasena) {
    return (
      <p data-testid="sin-contrasena" className="rounded-md border p-3 text-sm">
        Tu cuenta no usa contraseña: ingresás con Google o con un enlace por email. Configurar una contraseña
        todavía no está disponible.
      </p>
    )
  }

  async function enviar(v: Valores) {
    setMensaje(null)
    try {
      const { error } = await authClient.changePassword({ currentPassword: v.actual, newPassword: v.nueva })
      if (error) {
        setMensaje({
          tipo: 'error',
          texto: error.code === 'INVALID_PASSWORD' ? 'La contraseña actual no es correcta.' : 'No se pudo cambiar la contraseña.',
        })
        return
      }
      form.reset()
      setMensaje({ tipo: 'ok', texto: 'Contraseña actualizada. La próxima vez ingresá con la nueva.' })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo cambiar la contraseña.' })
    }
  }

  const campo = (name: keyof Valores, etiqueta: string, auto: string) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`pw-${name}`}>{etiqueta}</FieldLabel>
          <Input {...field} id={`pw-${name}`} type="password" autoComplete={auto} aria-invalid={fieldState.invalid} />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )

  return (
    <form onSubmit={form.handleSubmit(enviar)} className="flex max-w-sm flex-col gap-4" noValidate aria-label="Cambiar contraseña">
      {campo('actual', 'Contraseña actual', 'current-password')}
      {campo('nueva', 'Contraseña nueva', 'new-password')}
      {campo('confirmacion', 'Repetir contraseña nueva', 'new-password')}
      {mensaje && (
        <div role={mensaje.tipo === 'error' ? 'alert' : 'status'} data-testid="mensaje-password" className="rounded-md border p-3 text-sm">
          {mensaje.texto}
        </div>
      )}
      <Button type="submit" className="self-start" disabled={form.formState.isSubmitting}>Cambiar contraseña</Button>
    </form>
  )
}
