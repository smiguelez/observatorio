import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { authClient } from '@/api/auth-client'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MENSAJE_ENLACE_ENVIADO, MENSAJE_ENLACE_FALLIDO } from './mensajes'

const Esquema = z.object({ email: z.string().min(1, 'Ingresá tu email').email('Ingresá un email válido') })
type Valores = z.infer<typeof Esquema>

export default function MagicLinkForm({ callbackURL }: { callbackURL: string }) {
  const [estado, setEstado] = useState<'inicial' | 'enviado' | 'fallo'>('inicial')
  const form = useForm<Valores>({ resolver: zodResolver(Esquema), defaultValues: { email: '' } })

  async function enviar(v: Valores) {
    setEstado('inicial')
    try {
      const { error } = await authClient.signIn.magicLink({
        email: v.email,
        callbackURL,
        errorCallbackURL: '/login',
      })
      setEstado(error ? 'fallo' : 'enviado')
    } catch {
      setEstado('fallo')
    }
  }

  return (
    <form onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-4" noValidate>
      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="enlace-email">Email</FieldLabel>
            <Input {...field} id="enlace-email" type="email" autoComplete="email" aria-invalid={fieldState.invalid} />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      {estado === 'enviado' && (
        <p role="status" data-testid="enlace-enviado" className="text-sm">
          {MENSAJE_ENLACE_ENVIADO}
        </p>
      )}
      {estado === 'fallo' && (
        <p role="alert" data-testid="enlace-error" className="text-sm text-destructive">
          {MENSAJE_ENLACE_FALLIDO}
        </p>
      )}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Enviando…' : 'Enviarme un enlace'}
      </Button>
    </form>
  )
}
