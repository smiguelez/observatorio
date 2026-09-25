import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useOrganismos } from '@/api/organismos'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ejecutarConConcurrencia } from '@/features/completitud/cola'
import { crearCacheCatalogo, evaluarOrganismo, type FilaCompletitud } from '@/features/completitud/evaluar'
import { descargarPdf } from '@/features/completitud/exportarPdf'

// Con ~117 organismos son ~250–350 requests de solo lectura: se hacen con concurrencia limitada.
const CONCURRENCIA = 6

type Filtro = 'todos' | 'completos' | 'incompletos' | 'errores'
interface Entrada { id: number; denominacion: string; fila?: FilaCompletitud; error?: string }

const Estado = ({ ok }: { ok: boolean }) => (
  <Badge variant={ok ? 'secondary' : 'outline'} data-estado={ok ? 'completo' : 'incompleto'}>{ok ? 'Completo' : 'Incompleto'}</Badge>
)

/** Gestión de organismos (admin): completitud por organismo, calculada en el cliente, y exportación a PDF. */
export default function AdminOrganismosPage() {
  const lista = useOrganismos()
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0 })
  const [terminado, setTerminado] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const corrida = useRef(0)

  // La evaluación es un proceso asíncrono externo (cientos de requests) que arranca al llegar la lista: es
  // el caso legítimo de un efecto; el reinicio de estado al comenzar cada corrida es intencional.
  /* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!lista.data) return
    const organismos = lista.data
    const id = ++corrida.current
    const cancelado = () => corrida.current !== id
    setEntradas(organismos.map((o) => ({ id: o.id, denominacion: o.denominacion })))
    setProgreso({ hechos: 0, total: organismos.length })
    setTerminado(false)

    // Se difiere un tick: el doble montaje de StrictMode (solo en desarrollo) desmonta y vuelve a montar
    // de inmediato; sin esto arrancarían DOS colas y habría hasta 12 requests en vuelo en vez de 6.
    const arranque = setTimeout(() => {
      const catalogoDe = crearCacheCatalogo()
      ejecutarConConcurrencia(
        organismos, CONCURRENCIA,
        (o) => evaluarOrganismo(o, catalogoDe),
        (hechos, total) => !cancelado() && setProgreso({ hechos, total }),
        cancelado,
      ).then((resultados) => {
        if (cancelado()) return
        setEntradas(organismos.map((o, i) => {
          const r = resultados[i]
          return r?.ok
            ? { id: o.id, denominacion: o.denominacion, fila: r.valor }
            : { id: o.id, denominacion: o.denominacion, error: r && !r.ok && r.error instanceof Error ? r.error.message : 'No se pudo evaluar' }
        }))
        setTerminado(true)
      })
    }, 0)
    return () => {
      clearTimeout(arranque)
      corrida.current++
    }
  }, [lista.data])
  /* oxlint-enable react/set-state-in-effect, react-hooks/exhaustive-deps */

  const visibles = useMemo(
    () => entradas.filter((e) => {
      if (filtro === 'todos') return true
      if (filtro === 'errores') return e.error !== undefined
      if (!e.fila) return false
      return filtro === 'completos' ? e.fila.completo : !e.fila.completo
    }),
    [entradas, filtro],
  )
  const evaluadas = entradas.filter((e) => e.fila).map((e) => e.fila!)
  const completos = evaluadas.filter((f) => f.completo).length
  const porcentaje = progreso.total === 0 ? 0 : Math.round((progreso.hechos / progreso.total) * 100)

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Gestión de organismos</h1>
        <Button type="button" disabled={!terminado || evaluadas.length === 0} onClick={() => descargarPdf(evaluadas)}>
          Exportar PDF
        </Button>
      </div>

      {lista.isError && <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">No pudimos cargar los organismos.</div>}

      {!terminado && progreso.total > 0 && (
        <div data-testid="progreso" className="flex flex-col gap-1">
          <div role="progressbar" aria-label="Evaluando organismos" aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.hechos} className="h-2 w-full overflow-hidden rounded bg-muted">
            <div className="h-full bg-foreground transition-all" style={{ width: `${porcentaje}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">Evaluando organismos: {progreso.hechos} de {progreso.total}</p>
        </div>
      )}
      {terminado && (
        <p data-testid="resumen-completitud" className="text-sm">
          {completos} de {evaluadas.length} organismos completos{entradas.length !== evaluadas.length ? ` (${entradas.length - evaluadas.length} no se pudieron evaluar)` : ''}.
        </p>
      )}

      <div className="flex gap-2" role="group" aria-label="Filtrar por estado">
        {(['todos', 'completos', 'incompletos', 'errores'] as Filtro[]).map((f) => (
          <Button key={f} type="button" size="sm" variant={filtro === f ? 'default' : 'outline'} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
            {f[0]!.toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Organismo</TableHead>
            <TableHead>Datos básicos</TableHead>
            <TableHead>Unidades funcionales</TableHead>
            <TableHead>Taxonomía</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibles.map((e) => (
            <TableRow key={e.id} data-testid="fila-completitud" data-org-id={e.id} data-estado={e.error ? 'error' : e.fila ? (e.fila.completo ? 'completo' : 'incompleto') : 'pendiente'}>
              <TableCell><Link className="underline" to={`/organismos/${e.id}`}>{e.denominacion}</Link></TableCell>
              {e.fila ? (
                <>
                  <TableCell data-col="datos"><Estado ok={e.fila.datosBasicos} /></TableCell>
                  <TableCell data-col="unidades"><Estado ok={e.fila.unidades} /></TableCell>
                  <TableCell data-col="taxonomia">
                    <Estado ok={e.fila.taxonomia} />
                    {e.fila.catalogoVacio && <span className="ml-2 text-xs text-muted-foreground">sin preguntas aplicables</span>}
                  </TableCell>
                  <TableCell data-col="estado"><Estado ok={e.fila.completo} /></TableCell>
                </>
              ) : (
                <TableCell colSpan={4} className="text-sm text-muted-foreground">{e.error ?? 'Evaluando…'}</TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
