import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PreguntaTaxonomia, RespuestaTaxonomia } from '@/api/taxonomia'
import TaxonomiaForm from '@/features/taxonomia/TaxonomiaForm'
import rechazoReal from '../../api/fixtures/real/error-taxonomia-pregunta.json'

const opc = (...cs: string[]) => cs.map((c) => ({ codigo: c, etiqueta: `Etiqueta ${c}` }))
// Catálogo SINTÉTICO con los 4 tipos (SC-003): la base real solo tiene 9 preguntas de opción única.
const catalogo: PreguntaTaxonomia[] = [
  { codigo: 'insercion_institucional', texto: 'insercion_institucional', grupo: 'institucional', tipoRespuesta: 'opcion_unica', opciones: opc('A', 'B') },
  { codigo: 'medios', texto: '¿Con qué medios cuenta?', grupo: 'gestion', tipoRespuesta: 'opcion_multiple', opciones: opc('X', 'Y', 'Z') },
  { codigo: 'agentes', texto: 'Cantidad de agentes', grupo: 'gestion', tipoRespuesta: 'numerica', opciones: [] },
  { codigo: 'observaciones', texto: 'Observaciones', grupo: 'gestion', tipoRespuesta: 'texto_libre', opciones: [] },
]
const respuestas: RespuestaTaxonomia[] = [
  { preguntaCodigo: 'insercion_institucional', opcionesCodigos: ['B'], valorNumero: null, valorTexto: null },
  { preguntaCodigo: 'agentes', opcionesCodigos: [], valorNumero: 7, valorTexto: null },
]

let cuerpoPut: unknown
function montar(respuestasIniciales = respuestas, estadoPut = 200, cuerpoRespuesta: unknown = []) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    cuerpoPut = init?.body ? JSON.parse(String(init.body)) : undefined
    return new Response(JSON.stringify(cuerpoRespuesta), { status: estadoPut })
  }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TaxonomiaForm orgId={5} catalogo={catalogo} respuestas={respuestasIniciales} />
    </QueryClientProvider>,
  )
}
afterEach(() => vi.unstubAllGlobals())

describe('TaxonomiaForm — control correcto por tipo de respuesta (FR-007, SC-003)', () => {
  it('opción única = radio; múltiple = casillas; numérica = campo numérico; texto libre = textarea', () => {
    montar()
    const unica = screen.getByTestId('pregunta-insercion_institucional')
    expect(within(unica).getAllByRole('radio')).toHaveLength(2)
    const multiple = screen.getByTestId('pregunta-medios')
    expect(within(multiple).getAllByRole('checkbox')).toHaveLength(3)
    expect(within(screen.getByTestId('pregunta-agentes')).getByRole('spinbutton')).toBeInTheDocument()
    expect(within(screen.getByTestId('pregunta-observaciones')).getByRole('textbox')).toBeInTheDocument()
  })

  it('muestra el enunciado, nunca el código interno crudo (FR-008)', () => {
    montar()
    expect(screen.getByText('¿Con qué medios cuenta?')).toBeInTheDocument()
    expect(screen.queryByText('insercion_institucional')).not.toBeInTheDocument() // texto === código => versión legible
    expect(screen.getByText('Insercion institucional')).toBeInTheDocument()
  })

  it('precarga las respuestas existentes', () => {
    montar()
    expect(screen.getByRole('radio', { name: 'Etiqueta B' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Etiqueta A' })).not.toBeChecked()
    expect(screen.getByRole('spinbutton')).toHaveValue(7)
  })
})

describe('TaxonomiaForm — guardado', () => {
  it('el PUT lleva TODAS las respuestas (precargadas + nuevas) y omite las vacías', async () => {
    const u = userEvent.setup()
    montar()
    await u.click(screen.getByRole('checkbox', { name: 'Etiqueta X' }))
    await u.click(screen.getByRole('checkbox', { name: 'Etiqueta Z' }))
    await u.click(screen.getByRole('button', { name: 'Guardar taxonomía' }))
    expect(await screen.findByTestId('taxonomia-guardada')).toBeInTheDocument()
    expect(cuerpoPut).toEqual({
      respuestas: [
        { preguntaCodigo: 'insercion_institucional', opcionesCodigos: ['B'] },
        { preguntaCodigo: 'medios', opcionesCodigos: ['X', 'Z'] },
        { preguntaCodigo: 'agentes', valorNumero: 7 },
      ], // observaciones (texto vacío) se omite
    })
  })

  it('cambiar la opción única actualiza la respuesta (US3-2)', async () => {
    const u = userEvent.setup()
    montar()
    await u.click(screen.getByRole('radio', { name: 'Etiqueta A' }))
    await u.click(screen.getByRole('button', { name: 'Guardar taxonomía' }))
    await screen.findByTestId('taxonomia-guardada')
    expect((cuerpoPut as { respuestas: { preguntaCodigo: string; opcionesCodigos?: string[] }[] }).respuestas[0]).toEqual({
      preguntaCodigo: 'insercion_institucional', opcionesCodigos: ['A'],
    })
  })

  it('una múltiple sin ninguna opción marcada NO es un error de validación', async () => {
    const u = userEvent.setup()
    montar([])
    await u.click(screen.getByRole('button', { name: 'Guardar taxonomía' }))
    expect(await screen.findByTestId('taxonomia-guardada')).toBeInTheDocument()
    expect(cuerpoPut).toEqual({ respuestas: [] })
  })

  // 008 (D18/007): el servidor indica la pregunta con un dato PROPIO (`preguntaCodigo`/`preguntaTexto`); el cliente ya no la
  // busca dentro del texto del mensaje.
  it('un 400 con preguntaCodigo: resalta ESA pregunta y muestra el mensaje completo del servidor', async () => {
    const u = userEvent.setup()
    montar(respuestas, 400, { ...rechazoReal, preguntaCodigo: 'medios', preguntaTexto: '¿Con qué medios cuenta?', error: 'La pregunta «medios» (¿Con qué medios cuenta?) no aplica al tipo de organismo actual.' })
    await u.click(screen.getByRole('button', { name: 'Guardar taxonomía' }))
    const alerta = await screen.findByTestId('taxonomia-error')
    expect(alerta).toHaveTextContent('La pregunta «medios» (¿Con qué medios cuenta?) no aplica al tipo de organismo actual.')
    expect(screen.getByTestId('pregunta-medios')).toHaveAttribute('data-invalid', 'true')
    expect(screen.getByTestId('pregunta-agentes')).not.toHaveAttribute('data-invalid')
  })

  it('con el rechazo REAL de 007 (fixture) resalta la pregunta que indica el servidor', async () => {
    const u = userEvent.setup()
    montar(respuestas, 400, rechazoReal)
    await u.click(screen.getByRole('button', { name: 'Guardar taxonomía' }))
    expect(await screen.findByTestId('taxonomia-error')).toHaveTextContent(rechazoReal.error)
    expect(screen.getByTestId(`pregunta-${rechazoReal.preguntaCodigo}`)).toHaveAttribute('data-invalid', 'true')
  })

  it('un 400 SIN preguntaCodigo (pregunta inexistente): solo el mensaje, ninguna pregunta resaltada', async () => {
    const u = userEvent.setup()
    montar(respuestas, 400, { error: 'Pregunta(s) inexistente(s): medios' }) // cita un código del formulario, pero NO trae el campo
    await u.click(screen.getByRole('button', { name: 'Guardar taxonomía' }))
    expect(await screen.findByTestId('taxonomia-error')).toHaveTextContent('Pregunta(s) inexistente(s): medios')
    for (const c of ['insercion_institucional', 'medios', 'agentes', 'observaciones']) {
      expect(screen.getByTestId(`pregunta-${c}`)).not.toHaveAttribute('data-invalid')
    }
  })

  it('un mensaje que CITA un código entre «» pero sin el campo estructurado NO resalta (se acabó la búsqueda en el texto)', async () => {
    const u = userEvent.setup()
    montar(respuestas, 400, { error: 'La pregunta «agentes» no aplica al tipo de organismo actual.' })
    await u.click(screen.getByRole('button', { name: 'Guardar taxonomía' }))
    expect(await screen.findByTestId('taxonomia-error')).toBeInTheDocument()
    expect(screen.getByTestId('pregunta-agentes')).not.toHaveAttribute('data-invalid')
  })

  it('preguntaCodigo que NO está en el formulario: se muestra el mensaje y no falla ni resalta nada', async () => {
    const u = userEvent.setup()
    montar(respuestas, 400, { error: 'La pregunta «otra» no aplica.', preguntaCodigo: 'otra', preguntaTexto: 'otra' })
    await u.click(screen.getByRole('button', { name: 'Guardar taxonomía' }))
    expect(await screen.findByTestId('taxonomia-error')).toHaveTextContent('La pregunta «otra» no aplica.')
    expect(screen.getByTestId('form-taxonomia').querySelectorAll('[data-invalid="true"]')).toHaveLength(0)
  })

  it('un cuerpo con preguntaCodigo de tipo inválido (deriva del contrato) no lanza: solo el mensaje', async () => {
    const u = userEvent.setup()
    montar(respuestas, 400, { error: 'x', preguntaCodigo: 42 })
    await u.click(screen.getByRole('button', { name: 'Guardar taxonomía' }))
    expect(await screen.findByTestId('taxonomia-error')).toHaveTextContent('x')
  })
})
