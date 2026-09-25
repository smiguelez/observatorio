import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { authClient } from '@/api/auth-client'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AYUDA_OTROS_METODOS, MENSAJE_LOGIN_FALLIDO } from './mensajes'

const Esquema = z.object({
  email: z.string().min(1, 'Ingresá tu email').email('Ingresá un email válido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})
type Valores = z.infer<typeof Esquema>

interface Props {
  /**
   * Con `callbackURL`, Better Auth hace que el cliente NAVEGUE (recarga completa) a esa URL tras el login. En el
   * re-ingreso por sesión vencida se omite a propósito: la pantalla no debe recargarse.
   */
  callbackURL?: string
  alExito: () => void
  alElegirOtroMetodo: () => void
}

export default function PasswordForm({ callbackURL, alExito, alElegirOtroMetodo }: Props) {
  const [fallo, setFallo] = useState(false)
  const form = useForm<Valores>({ resolver: zodResolver(Esquema), defaultValues: { email: '', password: '' } })

  async function enviar(v: Valores) {
    setFallo(false)
    try {
      const { error } = await authClient.signIn.email({ email: v.email, password: v.password, ...(callbackURL ? { callbackURL } : {}) })
      // Cualquier error (credencial errónea, cuenta inexistente, invalidada, red, 5xx):
      // el MISMO mensaje. Ni el `code` ni el `message` del servidor se muestran ni se usan.
      if (error) setFallo(true)
      else alExito()
    } catch {
      setFallo(true)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-4" noValidate>
      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="login-email">Email</FieldLabel>
            <Input {...field} id="login-email" type="email" autoComplete="username" aria-invalid={fieldState.invalid} />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="password"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="login-password">Contraseña</FieldLabel>
            <Input {...field} id="login-password" type="password" autoComplete="current-password" aria-invalid={fieldState.invalid} />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      {fallo && (
        <div role="alert" data-testid="login-error" className="rounded-md border border-destructive/50 p-3 text-sm">
          <p>{MENSAJE_LOGIN_FALLIDO}</p>
          <p className="mt-1 text-muted-foreground">
            {AYUDA_OTROS_METODOS}{' '}
            <button type="button" className="underline" onClick={alElegirOtroMetodo}>
              Recibir un enlace por email
            </button>
          </p>
        </div>
      )}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Ingresando…' : 'Ingresar'}
      </Button>
    </form>
  )
}
