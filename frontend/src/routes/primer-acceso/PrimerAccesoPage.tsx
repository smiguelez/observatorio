import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { canjearAccesoInicial } from '@/api/acceso-inicial'
import { ApiError } from '@/api/http'
import { useSesion } from '@/auth/useSesion'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { CONTRASENA_MAX, CONTRASENA_MIN } from '@/lib/contrasena'

// Pantalla PÚBLICA (única, además del login, que se abre sin sesión): tratada como cualquier endpoint público.
//  - El acceso llega en el FRAGMENTO (`#token=…`): el navegador no lo envía al servidor ni a `Referer`. Se lee UNA vez
//    (primer render) y se quita de la dirección con un reemplazo del historial (FR-013).
//  - Vive solo en el estado de este componente: ni almacenamiento del navegador ni caché de TanStack Query. Por eso el
//    canje es una llamada directa (no `useMutation`, que retiene variables durante `gcTime`).
//  - Un único texto para acceso usado, vencido, reemplazado, inventado o ausente; no se consulta la validez antes de enviar.
export const MENSAJE_ACCESO_NO_VALIDO = 'Este enlace no es válido o venció. Pedile a un administrador que te genere uno nuevo.'
const MENSAJE_ERROR_TRANSITORIO = 'No pudimos completar la operación. Probá de nuevo en unos minutos.'

function extraerToken(hash: string): string | null {
  const t = new URLSearchParams(hash.replace(/^#/, '')).get('token')
  return t && t.length > 0 ? t : null
}

const Esquema = z
  .object({
    password: z
      .string()
      .min(CONTRASENA_MIN, `Tiene que tener al menos ${CONTRASENA_MIN} caracteres`)
      .max(CONTRASENA_MAX, `No puede tener más de ${CONTRASENA_MAX} caracteres`),
    confirmacion: z.string(),
  })
  .refine((v) => v.password === v.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden' })
type Valores = z.infer<typeof Esquema>

export default function PrimerAccesoPage() {
  const ubicacion = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { sesion } = useSesion()
  const [token, setToken] = useState<string | null>(() => extraerToken(ubicacion.hash))
  const [errorTransitorio, setErrorTransitorio] = useState<string | null>(null)
  const form = useForm<Valores>({ resolver: zodResolver(Esquema), defaultValues: { password: '', confirmacion: '' } })

  // Quita el acceso de la dirección visible y del historial (reemplaza la entrada actual).
  useEffect(() => {
    if (ubicacion.hash) navigate({ hash: '' }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo en el montaje: el acceso ya quedó en el estado
  }, [])

  async function enviar(v: Valores) {
    if (!token) return
    setErrorTransitorio(null)
    try {
      await canjearAccesoInicial({ token, password: v.password })
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && (e.codigo === 'PASSWORD_TOO_SHORT' || e.codigo === 'PASSWORD_TOO_LONG')) {
        form.setError('password', { message: e.message }) // el servidor rechazó la política: es un error del campo
      } else if (e instanceof ApiError && e.status === 400 && e.codigo !== 'FST_ERR_VALIDATION') {
        // Usado, vencido, reemplazado o inventado: el servidor no distingue y el cliente tampoco.
        setToken(null)
        form.reset()
      } else {
        setErrorTransitorio(e instanceof ApiError && e.codigo === 'FST_ERR_VALIDATION' ? e.message : MENSAJE_ERROR_TRANSITORIO)
      }
      return
    }
    // Entró la persona invitada: se descarta TODO lo cacheado de una sesión anterior (otro usuario en el mismo navegador).
    form.reset()
    queryClient.clear()
    navigate('/organismos', { replace: true })
  }

  if (token === null) {
    return (
      <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-4">
        <div role="alert" data-testid="acceso-no-valido" className="rounded-md border border-destructive/50 p-4">
          <h1 className="text-lg font-semibold">Acceso no válido</h1>
          <p className="mt-2 text-sm">{MENSAJE_ACCESO_NO_VALIDO}</p>
        </div>
        <Link to="/login" className="text-sm underline">Ir a iniciar sesión</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Elegí tu contraseña</h1>
        <p className="mt-1 text-sm text-muted-foreground">Con ella vas a poder ingresar al Observatorio de Oficinas Judiciales.</p>
      </div>
      {sesion && (
        <p role="note" data-testid="aviso-sesion-existente" className="rounded-md border p-3 text-sm">
          Ya tenés una sesión iniciada en este navegador. Si continuás, se cierra y entrás como la persona invitada.
        </p>
      )}
      <form onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-4" noValidate data-testid="primer-acceso-form">
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="primer-password">Contraseña</FieldLabel>
              <Input {...field} id="primer-password" type="password" autoComplete="new-password" aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="confirmacion"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="primer-confirmacion">Repetir contraseña</FieldLabel>
              <Input {...field} id="primer-confirmacion" type="password" autoComplete="new-password" aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        {errorTransitorio && (
          <div role="alert" data-testid="primer-acceso-error" className="rounded-md border border-destructive/50 p-3 text-sm">
            {errorTransitorio}
          </div>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Guardando…' : 'Guardar contraseña y entrar'}
        </Button>
      </form>
    </main>
  )
}
