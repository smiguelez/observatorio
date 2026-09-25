import { useState } from 'react'
import { useParams } from 'react-router'
import { useAgregarEditor, useEditores, useQuitarEditor, type Editor } from '@/api/editores'
import { useOrganismo } from '@/api/organismos'
import { useUsuarios } from '@/api/usuarios'
import { useSesion } from '@/auth/useSesion'
import SelectCatalogo from '@/components/forms/SelectCatalogo'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const etiquetaUsuario = (u: { nombreDisplay?: string | null; nombre?: string | null; email: string }) => {
  const nombre = u.nombreDisplay ?? u.nombre
  return nombre ? `${nombre} — ${u.email}` : u.email
}

/**
 * Editores de un organismo. Ver: cualquiera con acceso al organismo. Agregar/quitar: solo propietario o
 * admin — un editor NO puede gestionar editores (el backend responde 403; acá además se ocultan los controles).
 */
export default function EditoresTab() {
  const orgId = Number(useParams().id)
  const { sesion } = useSesion()
  const { data: organismo } = useOrganismo(orgId)
  const editores = useEditores(orgId)
  const usuarios = useUsuarios()
  const agregar = useAgregarEditor(orgId)
  const quitar = useQuitarEditor(orgId)
  const [elegido, setElegido] = useState<number | null>(null)
  const [aQuitar, setAQuitar] = useState<Editor | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const puedeGestionar = !!sesion && !!organismo && (sesion.rol === 'admin' || organismo.propietarioId === sesion.usuarioId)
  const yaEditores = new Set((editores.data ?? []).map((e) => e.usuarioId))
  // Candidatos: todos los usuarios menos el propietario y los editores actuales.
  const candidatos = (usuarios.data ?? [])
    .filter((u) => u.id !== organismo?.propietarioId && !yaEditores.has(u.id))
    .map((u) => ({ id: u.id, nombre: etiquetaUsuario(u) }))

  async function alAgregar(e: React.FormEvent) {
    e.preventDefault()
    if (elegido === null) return
    setMensaje(null)
    try {
      await agregar.mutateAsync(elegido)
      setElegido(null)
      setMensaje({ tipo: 'ok', texto: 'Editor agregado.' })
    } catch (err) {
      // 400: "Ese usuario ya es editor…" / "El usuario indicado no existe."; 403: no es propietario ni admin.
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo agregar el editor' })
    }
  }

  async function confirmarQuitar() {
    if (!aQuitar) return
    const e = aQuitar
    setAQuitar(null)
    setMensaje(null)
    try {
      await quitar.mutateAsync(e.usuarioId)
      setMensaje({ tipo: 'ok', texto: 'Editor quitado. Ya no tiene acceso a este organismo.' })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'No se pudo quitar el editor' })
    }
  }

  if (editores.isPending) return <Skeleton className="h-24 w-full" />
  if (editores.isError) return <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">No pudimos cargar los editores.</div>

  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <h2 className="text-base font-semibold">Editores</h2>
      {!puedeGestionar && (
        <p data-testid="editores-solo-lectura" className="text-sm text-muted-foreground">
          Solo el propietario o un administrador puede agregar o quitar editores.
        </p>
      )}
      {mensaje && (
        <div role={mensaje.tipo === 'error' ? 'alert' : 'status'} data-testid="mensaje-editores" className="rounded-md border p-3 text-sm">{mensaje.texto}</div>
      )}
      {editores.data.length === 0 ? (
        <p data-testid="sin-editores" className="text-muted-foreground">Este organismo no tiene editores.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Editor</TableHead>
              <TableHead>Email</TableHead>
              {puedeGestionar && <TableHead className="w-28" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {editores.data.map((e) => (
              <TableRow key={e.usuarioId} data-testid="fila-editor">
                <TableCell>{e.nombre ?? '—'}</TableCell>
                <TableCell>{e.email}</TableCell>
                {puedeGestionar && (
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setAQuitar(e)} aria-label={`Quitar a ${e.email}`}>Quitar</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {puedeGestionar && (
        <form onSubmit={alAgregar} className="flex flex-wrap items-end gap-2 border-t pt-4" aria-label="Agregar editor">
          <div className="flex min-w-64 flex-1 flex-col gap-1">
            <Label htmlFor="editor-nuevo">Agregar un editor</Label>
            <SelectCatalogo id="editor-nuevo" valor={elegido} opciones={candidatos} alCambiar={setElegido} placeholder="Elegí un usuario" />
          </div>
          <Button type="submit" disabled={elegido === null || agregar.isPending}>Agregar editor</Button>
        </form>
      )}

      <AlertDialog open={aQuitar !== null} onOpenChange={(a) => !a && setAQuitar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar al editor?</AlertDialogTitle>
            <AlertDialogDescription>{aQuitar?.email} deja de tener acceso a este organismo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarQuitar}>Quitar editor</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
