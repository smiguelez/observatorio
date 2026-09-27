import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminOrganismosPage from '@/routes/admin/AdminOrganismosPage'
import muestra from '../api/fixtures/real/completitud.json'

afterEach(() => vi.unstubAllGlobals())

// 118 organismos (el universo real): las filas de la muestra REAL repetidas con ids distintos.
const TOTAL = 118
const filas = Array.from({ length: TOTAL }, (_, i) => ({ ...muestra[i % muestra.length]!, organismoId: String(1000 + i), denominacion: `Organismo ${i + 1}` }))
const completosEsperados = filas.filter((f) => f.completo).length

function stub(respuesta: { status: number; cuerpo: unknown } = { status: 200, cuerpo: filas }) {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify(respuesta.cuerpo), { status: respuesta.status })
    }),
  )
  return urls
}
function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminOrganismosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('gestión de organismos: la completitud llega en UNA solicitud (009)', () => {
  it('con 118 organismos dispara EXACTAMENTE una solicitud a la API: nada por fila (ni detalle, ni unidades, ni taxonomía, ni catálogo)', async () => {
    const urls = stub()
    montar()
    expect(await screen.findAllByTestId('fila-completitud')).toHaveLength(TOTAL)
    expect(urls).toEqual(['/api/organismos/completitud'])
    // antes: /api/organismos/:id, /unidades-funcionales, /taxonomia por organismo y /api/taxonomia/preguntas por tipo (~341 llamadas)
    expect(urls.filter((u) => /\/api\/organismos\/\d+/.test(u) || u.includes('unidades-funcionales') || u.includes('/taxonomia') || u.includes('taxonomia/preguntas'))).toEqual([])
  })

  it('el resumen y las columnas salen tal cual los devuelve el backend (la regla no se recalcula en el cliente)', async () => {
    stub()
    montar()
    expect(await screen.findByTestId('resumen-completitud')).toHaveTextContent(`${completosEsperados} de ${TOTAL} organismos completos.`)
    const fila = screen.getAllByTestId('fila-completitud')[0]!
    expect(fila).toHaveAttribute('data-estado', filas[0]!.completo ? 'completo' : 'incompleto')
    expect(fila).toHaveAttribute('data-org-id', '1000')
  })

  it('mientras carga muestra el indicador de progreso; el botón de PDF está deshabilitado hasta tener los datos', async () => {
    stub()
    montar()
    expect(screen.getByTestId('progreso')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeDisabled()
    await screen.findByTestId('resumen-completitud')
    expect(screen.queryByTestId('progreso')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeEnabled()
  })

  it('los filtros trabajan sobre lo ya cargado: cambiar de filtro NO dispara ninguna solicitud nueva', async () => {
    const urls = stub()
    const u = montar()
    await screen.findByTestId('resumen-completitud')
    await u.click(screen.getByRole('button', { name: 'Completos' }))
    await waitFor(() => expect(screen.getAllByTestId('fila-completitud')).toHaveLength(completosEsperados))
    await u.click(screen.getByRole('button', { name: 'Incompletos' }))
    await waitFor(() => expect(screen.getAllByTestId('fila-completitud')).toHaveLength(TOTAL - completosEsperados))
    await u.click(screen.getByRole('button', { name: 'Todos' }))
    await waitFor(() => expect(screen.getAllByTestId('fila-completitud')).toHaveLength(TOTAL))
    expect(urls).toHaveLength(1)
  })

  it('un tipo sin preguntas aplicables muestra la nota "sin preguntas aplicables" y cuenta la taxonomía como completa', async () => {
    stub()
    montar()
    await screen.findByTestId('resumen-completitud')
    const filaCoordinacion = screen.getAllByTestId('fila-completitud').find((f) => f.textContent?.includes('sin preguntas aplicables'))!
    expect(filaCoordinacion.querySelector('[data-col="taxonomia"] [data-estado]')).toHaveAttribute('data-estado', 'completo')
  })

  it('si la solicitud falla: mensaje claro y "Reintentar" vuelve a pedir (una vez más)', async () => {
    const urls = stub({ status: 500, cuerpo: { error: 'Error interno del servidor' } })
    const u = montar()
    expect(await screen.findByTestId('completitud-error')).toHaveTextContent('No pudimos cargar la completitud de los organismos.')
    expect(screen.queryByTestId('resumen-completitud')).not.toBeInTheDocument()
    stub()
    await u.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByTestId('resumen-completitud')).toBeInTheDocument()
    expect(urls).toHaveLength(1)
  })
})
