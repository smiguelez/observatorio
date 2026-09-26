import { useMemo, useState } from 'react'
import { useProvincias } from '@/api/catalogos.hooks'
import { useEmitirAccesoInicial, useUsuarios, type Usuario } from '@/api/usuarios'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import EditarUsuarioDialog from './EditarUsuarioDialog'
import AltaUsuarioDialog, { AccesoInicialDialog, construirEnlace, type AccesoParaMostrar } from './AltaUsuarioDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/**
 * Usuarios (admin): lista + alta administrada + reemisión del acceso inicial + edición de rol y provincia (008, sobre 007).
 * El servidor decide cada operación; los controles son UX (Principio II).
 */
export default function AdminUsuariosPage() {
  const usuarios = useUsuarios()
  const provincias = useProvincias()
  const [busqueda, setBusqueda] = useState('')
  // 008 US1: alta administrada y reemisión del acceso inicial. El acceso se muestra UNA vez y vive solo en este estado.
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [aReemitir, setAReemitir] = useState<Usuario | null>(null)
  const [acceso, setAcceso] = useState<AccesoParaMostrar | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [errorAcceso, setErrorAcceso] = useState<string | null>(null)
  const emitir = useEmitirAccesoInicial()

  async function reemitir() {
    if (!aReemitir) return
    const u = aReemitir
    setAReemitir(null)
    setErrorAcceso(null)
    try {
      const nuevo = await emitir.mutateAsync(u.id)
      setAcceso({ enlace: construirEnlace(nuevo.token), vence: nuevo.vence, email: u.email })
      emitir.reset()
    } catch (e) {
      setErrorAcceso(e instanceof Error ? e.message : 'No se pudo emitir el acceso')
    }
  }

  const nombreProvincia = (id: number | null) => (id === null ? '—' : (provincias.data?.find((p) => p.id === id)?.nombre ?? `#${id}`))
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (usuarios.data ?? []).filter((u) => q === '' || u.email.toLowerCase().includes(q) || (u.nombreDisplay ?? '').toLowerCase().includes(q))
  }, [usuarios.data, busqueda])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <Button type="button" data-testid="alta-usuario" onClick={() => setAltaAbierta(true)}>
          Dar de alta un usuario
        </Button>
      </div>
      {errorAcceso && (
        <div role="alert" data-testid="error-acceso" className="rounded-md border border-destructive/50 p-3 text-sm">{errorAcceso}</div>
      )}
      <div className="flex max-w-sm flex-col gap-1">
        <Label htmlFor="buscar-usuario">Buscar por nombre o email</Label>
        <Input id="buscar-usuario" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      {usuarios.isPending && <Skeleton className="h-32 w-full" />}
      {usuarios.isError && <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">No pudimos cargar los usuarios.</div>}
      {usuarios.data && (
        <>
          <p data-testid="total-usuarios" className="text-sm text-muted-foreground">
            {visibles.length === usuarios.data.length ? `${usuarios.data.length} usuarios` : `${visibles.length} de ${usuarios.data.length} usuarios`}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Provincia</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="w-28">Editar</TableHead>
                <TableHead className="w-44">Acceso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((u) => (
                <TableRow key={u.id} data-testid="fila-usuario" data-usuario-id={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.nombreDisplay ?? '—'}</TableCell>
                  <TableCell>{nombreProvincia(u.provinciaId)}</TableCell>
                  <TableCell data-col="roles">
                    {u.roles.length === 0 ? '—' : u.roles.map((r) => <Badge key={r} variant={r === 'admin' ? 'default' : 'secondary'} className="mr-1">{r}</Badge>)}
                  </TableCell>
                  <TableCell>
                    <Button type="button" size="sm" variant="outline" data-testid="editar-usuario" aria-label={`Editar rol y provincia de ${u.email}`} onClick={() => setEditandoId(u.id)}>
                      Editar
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button type="button" size="sm" variant="outline" data-testid="emitir-acceso" aria-label={`Emitir acceso nuevo a ${u.email}`} onClick={() => setAReemitir(u)}>
                      Emitir acceso nuevo
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <EditarUsuarioDialog usuarioId={editandoId} alCerrar={() => setEditandoId(null)} />
      <AltaUsuarioDialog abierto={altaAbierta} alCambiar={setAltaAbierta} />
      <AccesoInicialDialog acceso={acceso} alCerrar={() => setAcceso(null)} />
      <AlertDialog open={aReemitir !== null} onOpenChange={(a) => { if (!a) setAReemitir(null) }}>
        <AlertDialogContent data-testid="confirmar-reemision">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Emitir un acceso nuevo?</AlertDialogTitle>
            <AlertDialogDescription>
              Para {aReemitir?.email}. El acceso anterior <strong>dejará de servir</strong> y el nuevo se muestra una sola vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction data-testid="confirmar-reemitir" onClick={() => void reemitir()}>Emitir acceso nuevo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
