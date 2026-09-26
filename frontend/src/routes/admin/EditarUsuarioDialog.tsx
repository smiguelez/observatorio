import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useProvincias } from '@/api/catalogos.hooks'
import { useActualizarUsuario, useCambiarRol, useUsuarios } from '@/api/usuarios'
import { useSesion } from '@/auth/useSesion'
import SelectCatalogo from '@/components/forms/SelectCatalogo'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'

const mensaje = (e: unknown, porDefecto: string) => (e instanceof Error ? e.message : porDefecto)

/**
 * Edición de rol y provincia de un usuario (admin, US3). Son DOS acciones independientes con una solicitud cada una: no hay
 * guardado parcial. Nada es optimista: lo que se muestra sale de la lista consultada (que se re-consulta tras cada éxito).
 * El servidor decide (último administrador, provincia inexistente, permisos); acá solo se muestra su mensaje tal cual.
 */
export default function EditarUsuarioDialog({ usuarioId, alCerrar }: { usuarioId: number | null; alCerrar: () => void }) {
  return (
    <Dialog open={usuarioId !== null} onOpenChange={(a) => { if (!a) alCerrar() }}>
      <DialogContent data-testid="editar-usuario-dialog">
        {usuarioId !== null && <Contenido usuarioId={usuarioId} alCerrar={alCerrar} />}
      </DialogContent>
    </Dialog>
  )
}

function Contenido({ usuarioId, alCerrar }: { usuarioId: number; alCerrar: () => void }) {
  const navigate = useNavigate()
  const { sesion } = useSesion()
  const usuarios = useUsuarios()
  const provincias = useProvincias()
  const cambiarRol = useCambiarRol()
  const actualizar = useActualizarUsuario(usuarioId)
  const usuario = usuarios.data?.find((u) => u.id === usuarioId)

  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [errorRol, setErrorRol] = useState<string | null>(null)
  const [errorProvincia, setErrorProvincia] = useState<string | null>(null)
  const [okProvincia, setOkProvincia] = useState(false)
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)

  if (!usuario) {
    return <p role="status">Cargando usuario…</p>
  }
  const esAdmin = usuario.roles.includes('admin')
  const provinciaElegida = seleccion ?? usuario.provinciaId

  async function ponerRol(rol: 'admin' | 'usuario_normal') {
    setErrorRol(null)
    setConfirmarQuitar(false)
    try {
      await cambiarRol.mutateAsync({ id: usuarioId, rol })
    } catch (e) {
      setErrorRol(mensaje(e, 'No se pudo cambiar el rol'))
      return
    }
    // Un administrador que se quita el rol a sí mismo deja de tener acceso a esta pantalla (FR-020).
    if (rol === 'usuario_normal' && sesion?.usuarioId === usuarioId) {
      alCerrar()
      navigate('/organismos', { replace: true })
    }
  }
  async function guardarProvincia() {
    if (provinciaElegida === null) return
    setErrorProvincia(null)
    setOkProvincia(false)
    try {
      await actualizar.mutateAsync({ provinciaId: provinciaElegida })
      setSeleccion(null)
      setOkProvincia(true)
    } catch (e) {
      setErrorProvincia(mensaje(e, 'No se pudo guardar la provincia'))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar usuario</DialogTitle>
        <DialogDescription>{usuario.email}</DialogDescription>
      </DialogHeader>

      <section aria-labelledby="editar-rol-titulo" className="flex flex-col gap-2" data-testid="seccion-rol">
        <h2 id="editar-rol-titulo" className="text-sm font-semibold">Rol</h2>
        <p className="text-sm">
          Rol actual:{' '}
          <Badge data-testid="rol-actual" variant={esAdmin ? 'default' : 'secondary'}>{esAdmin ? 'Administrador' : 'Usuario normal'}</Badge>
        </p>
        {esAdmin ? (
          <Button type="button" variant="outline" data-testid="boton-cambiar-rol" disabled={cambiarRol.isPending} onClick={() => setConfirmarQuitar(true)}>
            Quitar rol de administrador
          </Button>
        ) : (
          <Button type="button" variant="outline" data-testid="boton-cambiar-rol" disabled={cambiarRol.isPending} onClick={() => void ponerRol('admin')}>
            Hacer administrador
          </Button>
        )}
        {errorRol && <div role="alert" data-testid="error-rol" className="rounded-md border border-destructive/50 p-3 text-sm">{errorRol}</div>}
      </section>

      <section aria-labelledby="editar-provincia-titulo" className="flex flex-col gap-2" data-testid="seccion-provincia">
        <h2 id="editar-provincia-titulo" className="text-sm font-semibold">Provincia</h2>
        <Field>
          <FieldLabel htmlFor="editar-provincia">Provincia del usuario</FieldLabel>
          {/* Sin opción "sin provincia": el servidor no permite quitarla, solo cambiarla (FR-022). */}
          <SelectCatalogo id="editar-provincia" valor={provinciaElegida} opciones={provincias.data ?? []} alCambiar={(v) => { setSeleccion(v); setOkProvincia(false) }} placeholder="Sin provincia asignada" />
        </Field>
        <Button
          type="button"
          data-testid="provincia-guardar"
          disabled={actualizar.isPending || provinciaElegida === null || provinciaElegida === usuario.provinciaId}
          onClick={() => void guardarProvincia()}
        >
          Guardar provincia
        </Button>
        {okProvincia && <p role="status" data-testid="provincia-ok" className="text-sm">Provincia guardada.</p>}
        {errorProvincia && <div role="alert" data-testid="error-provincia" className="rounded-md border border-destructive/50 p-3 text-sm">{errorProvincia}</div>}
      </section>

      <DialogFooter>
        <Button type="button" onClick={alCerrar}>Cerrar</Button>
      </DialogFooter>

      <AlertDialog open={confirmarQuitar} onOpenChange={setConfirmarQuitar}>
        <AlertDialogContent data-testid="confirmar-quitar-admin">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar el rol de administrador?</AlertDialogTitle>
            <AlertDialogDescription>
              {usuario.email} va a perder de inmediato el acceso a las pantallas de administración.
              {sesion?.usuarioId === usuarioId ? ' Sos vos: vas a dejar de ser administrador.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction data-testid="confirmar-quitar" onClick={() => void ponerRol('usuario_normal')}>Quitar rol</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
