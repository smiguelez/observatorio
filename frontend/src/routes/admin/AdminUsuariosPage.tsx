import { useMemo, useState } from 'react'
import { useProvincias } from '@/api/catalogos.hooks'
import { useUsuarios } from '@/api/usuarios'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/**
 * Usuarios (admin) — SOLO LECTURA (decisión 1, FR-019). Cambiar el rol o crear usuarios requiere backend
 * nuevo (`007`): el control de rol se muestra deshabilitado y explicado; ninguna acción dispara un pedido.
 */
export default function AdminUsuariosPage() {
  const usuarios = useUsuarios()
  const provincias = useProvincias()
  const [busqueda, setBusqueda] = useState('')

  const nombreProvincia = (id: number | null) => (id === null ? '—' : (provincias.data?.find((p) => p.id === id)?.nombre ?? `#${id}`))
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (usuarios.data ?? []).filter((u) => q === '' || u.email.toLowerCase().includes(q) || (u.nombreDisplay ?? '').toLowerCase().includes(q))
  }, [usuarios.data, busqueda])

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Usuarios</h1>
      <p id="rol-no-disponible" data-testid="aviso-rol" className="rounded-md border p-3 text-sm">
        Cambiar el rol de un usuario todavía no está disponible: requiere una función nueva del servidor. Por ahora esta
        pantalla es solo de consulta.
      </p>

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
                <TableHead className="w-36">Cambiar rol</TableHead>
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
                    <Button type="button" size="sm" variant="outline" disabled aria-describedby="rol-no-disponible" aria-label={`Cambiar rol de ${u.email}`}>
                      No disponible
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </section>
  )
}
