import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useProvincias } from '@/api/catalogos.hooks'
import { useCrearUsuario } from '@/api/usuarios'
import SelectCatalogo from '@/components/forms/SelectCatalogo'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

/** Enlace que el administrador le entrega a la persona. El acceso va en el FRAGMENTO: el navegador no lo envía al servidor. */
export function construirEnlace(token: string): string {
  return `${window.location.origin}/primer-acceso#token=${token}`
}

export interface AccesoParaMostrar {
  enlace: string
  vence: Date
  /** A quién corresponde (para el título); no es un dato sensible. */
  email?: string
}

/**
 * Paso "enlace": se muestra UNA sola vez (FR-002). Vive en estado local del componente que lo abre: nunca en el caché de
 * TanStack Query (FR-003). Cerrarlo sin haber copiado pide confirmación.
 */
export function AccesoInicialDialog({ acceso, alCerrar }: { acceso: AccesoParaMostrar | null; alCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const [noPudoCopiar, setNoPudoCopiar] = useState(false)
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function cerrar() {
    setCopiado(false)
    setNoPudoCopiar(false)
    setConfirmarCierre(false)
    alCerrar()
  }
  function pedirCierre() {
    if (copiado) cerrar()
    else setConfirmarCierre(true)
  }
  async function copiar() {
    if (!acceso) return
    try {
      await navigator.clipboard.writeText(acceso.enlace)
      setCopiado(true)
      setNoPudoCopiar(false)
    } catch {
      // Sin portapapeles (contexto no seguro o permiso denegado): se deja el campo seleccionado para copiar a mano.
      setNoPudoCopiar(true)
      inputRef.current?.select()
    }
  }

  return (
    <>
      <Dialog open={acceso !== null} onOpenChange={(abierto) => { if (!abierto) pedirCierre() }}>
        <DialogContent data-testid="acceso-inicial-dialog" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Acceso inicial{acceso?.email ? ` para ${acceso.email}` : ''}</DialogTitle>
            <DialogDescription>
              Hacele llegar este enlace a la persona. Sirve <strong>una sola vez</strong> y vence en poco tiempo.
            </DialogDescription>
          </DialogHeader>
          {acceso && (
            <div className="flex flex-col gap-3">
              <Field>
                <FieldLabel htmlFor="enlace-acceso">Enlace de acceso</FieldLabel>
                <Input ref={inputRef} id="enlace-acceso" data-testid="enlace-acceso" readOnly value={acceso.enlace} onFocus={(e) => e.currentTarget.select()} />
              </Field>
              <p data-testid="vence-acceso" className="text-sm">
                Vence el <strong>{acceso.vence.toLocaleString('es-AR')}</strong>.
              </p>
              <p role="note" data-testid="aviso-un-solo-uso" className="rounded-md border p-3 text-sm">
                Este enlace <strong>no volverá a mostrarse</strong>. Si se pierde, tenés que emitir uno nuevo (el anterior deja de servir).
              </p>
              {noPudoCopiar && (
                <p role="status" className="text-sm text-muted-foreground">
                  No pudimos copiarlo automáticamente: el enlace quedó seleccionado, copialo a mano.
                </p>
              )}
              {copiado && <p role="status" className="text-sm">Enlace copiado.</p>}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" data-testid="copiar-enlace" onClick={() => void copiar()}>
              Copiar enlace
            </Button>
            <Button type="button" data-testid="cerrar-acceso" onClick={pedirCierre}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmarCierre} onOpenChange={setConfirmarCierre}>
        <AlertDialogContent data-testid="confirmar-cierre-acceso">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar sin copiar el enlace?</AlertDialogTitle>
            <AlertDialogDescription>
              No vas a poder verlo de nuevo. Si lo perdés, vas a tener que emitir un acceso nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={cerrar}>Cerrar igual</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const Esquema = z
  .object({
    email: z.string().trim().min(1, 'Ingresá un email').email('Ingresá un email válido'),
    rol: z.enum(['usuario_normal', 'admin']),
    provinciaId: z.number().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.rol === 'usuario_normal' && v.provinciaId === null) {
      ctx.addIssue({ code: 'custom', path: ['provinciaId'], message: 'La provincia es obligatoria para un usuario normal' })
    }
  })
type Valores = z.infer<typeof Esquema>

const VALORES_INICIALES: Valores = { email: '', rol: 'usuario_normal', provinciaId: null }

/** Alta administrada (US1): formulario → enlace de acceso inicial. El servidor decide; acá solo se valida lo evidente. */
export default function AltaUsuarioDialog({ abierto, alCambiar }: { abierto: boolean; alCambiar: (abierto: boolean) => void }) {
  const provincias = useProvincias()
  const crear = useCrearUsuario()
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  const [acceso, setAcceso] = useState<AccesoParaMostrar | null>(null)
  const form = useForm<Valores>({ resolver: zodResolver(Esquema), defaultValues: VALORES_INICIALES })
  const rol = form.watch('rol')

  async function enviar(v: Valores) {
    setErrorServidor(null)
    try {
      const alta = await crear.mutateAsync({ email: v.email, rol: v.rol, provinciaId: v.provinciaId })
      // El acceso se copia a estado LOCAL y la mutación se descarta: no debe quedar en el caché (FR-003).
      setAcceso({ enlace: construirEnlace(alta.accesoInicial.token), vence: alta.accesoInicial.vence, email: alta.email })
      crear.reset()
      form.reset(VALORES_INICIALES)
      alCambiar(false)
    } catch (e) {
      setErrorServidor(e instanceof Error ? e.message : 'No se pudo dar de alta al usuario')
    }
  }

  return (
    <>
      <Dialog open={abierto} onOpenChange={(a) => { if (!a) { setErrorServidor(null); form.reset(VALORES_INICIALES) } alCambiar(a) }}>
        <DialogContent data-testid="alta-usuario-dialog">
          <DialogHeader>
            <DialogTitle>Dar de alta un usuario</DialogTitle>
            <DialogDescription>Después vas a recibir un enlace de acceso inicial para hacérselo llegar a la persona.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-4" noValidate>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="alta-email">Email</FieldLabel>
                  <Input {...field} id="alta-email" type="email" autoComplete="off" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="rol"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel id="alta-rol-etiqueta">Rol inicial</FieldLabel>
                  <RadioGroup value={field.value} onValueChange={(v) => field.onChange(v)} aria-labelledby="alta-rol-etiqueta">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="usuario_normal" id="alta-rol-normal" />
                      <label htmlFor="alta-rol-normal">Usuario normal</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="admin" id="alta-rol-admin" />
                      <label htmlFor="alta-rol-admin">Administrador</label>
                    </div>
                  </RadioGroup>
                </Field>
              )}
            />
            <Controller
              name="provinciaId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="alta-provincia">Provincia{rol === 'admin' ? ' (opcional)' : ''}</FieldLabel>
                  <SelectCatalogo
                    id="alta-provincia"
                    valor={field.value}
                    opciones={provincias.data ?? []}
                    alCambiar={field.onChange}
                    placeholder="Elegí una provincia"
                    invalido={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {errorServidor && (
              <div role="alert" data-testid="alta-error" className="rounded-md border border-destructive/50 p-3 text-sm">
                {errorServidor}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => alCambiar(false)}>Cancelar</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Dando de alta…' : 'Dar de alta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AccesoInicialDialog acceso={acceso} alCerrar={() => setAcceso(null)} />
    </>
  )
}
