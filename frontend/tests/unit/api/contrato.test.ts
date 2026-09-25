import { afterEach, describe, expect, it, vi } from 'vitest'
import { listarAsignaciones } from '@/api/asignaciones'
import {
  obtenerDenominacionesSimplificadas, obtenerFueros, obtenerLocalidades, obtenerProvincias, obtenerTiposOficina, obtenerTiposUf,
} from '@/api/catalogos'
import { listarEditores } from '@/api/editores'
import { obtenerFuero } from '@/api/fuero'
import { listarOrganismos, obtenerOrganismo } from '@/api/organismos'
import { listarPools } from '@/api/pools'
import { obtenerSesion } from '@/api/sesion'
import { obtenerCatalogoTaxonomia, obtenerRespuestasTaxonomia } from '@/api/taxonomia'
import { listarUnidades, obtenerUnidad } from '@/api/unidades'
import { listarUsuarios, obtenerUsuario } from '@/api/usuarios'
import asignaciones from './fixtures/real/asignaciones.json'
import denominaciones from './fixtures/real/denominaciones-simplificadas.json'
import editores from './fixtures/real/editores.json'
import fuero from './fixtures/real/fuero.json'
import fueros from './fixtures/real/fueros.json'
import localidades from './fixtures/real/localidades.json'
import organismoDetalle from './fixtures/real/organismo-detalle.json'
import organismosLista from './fixtures/real/organismos-lista.json'
import poolsLista from './fixtures/real/pools-lista.json'
import provincias from './fixtures/real/provincias.json'
import sesion from './fixtures/real/sesion.json'
import taxCatalogo from './fixtures/real/taxonomia-catalogo.json'
import taxRespuestas from './fixtures/real/taxonomia-respuestas.json'
import tiposOficina from './fixtures/real/tipos-oficina.json'
import tiposUf from './fixtures/real/tipos-uf.json'
import unidadDetalle from './fixtures/real/unidad-detalle.json'
import unidadesLista from './fixtures/real/unidades-lista.json'
import usuarioDetalle from './fixtures/real/usuario-detalle.json'
import usuariosLista from './fixtures/real/usuarios-lista.json'

// Suite de contrato de la capa de mapeo (D13, escenario 26): respuestas REALES grabadas del backend
// (scripts/grabar-fixtures.mjs). Si el backend cambia una forma, el caso correspondiente falla.

afterEach(() => vi.unstubAllGlobals())
const servir = (cuerpo: unknown) =>
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(cuerpo), { status: 200 })))

interface Caso {
  nombre: string
  fixture: unknown
  llamar: () => Promise<unknown>
  /** Claves que el backend omite legítimamente (opcionales en el contrato). */
  opcionales?: string[]
}

const casos: Caso[] = [
  { nombre: 'sesión', fixture: sesion, llamar: obtenerSesion },
  { nombre: 'provincias', fixture: provincias, llamar: obtenerProvincias },
  { nombre: 'denominaciones simplificadas', fixture: denominaciones, llamar: obtenerDenominacionesSimplificadas },
  { nombre: 'tipos de oficina', fixture: tiposOficina, llamar: obtenerTiposOficina },
  { nombre: 'tipos de UF', fixture: tiposUf, llamar: obtenerTiposUf },
  { nombre: 'fueros', fixture: fueros, llamar: obtenerFueros },
  { nombre: 'localidades', fixture: localidades, llamar: obtenerLocalidades },
  { nombre: 'organismos (lista)', fixture: organismosLista, llamar: listarOrganismos },
  { nombre: 'organismo (detalle)', fixture: organismoDetalle, llamar: () => obtenerOrganismo(1) },
  { nombre: 'fuero de un organismo', fixture: fuero, llamar: () => obtenerFuero(1) },
  { nombre: 'unidades funcionales (lista)', fixture: unidadesLista, llamar: () => listarUnidades(1) },
  { nombre: 'unidad funcional (detalle)', fixture: unidadDetalle, llamar: () => obtenerUnidad(1, 1) },
  { nombre: 'asignaciones de jueces', fixture: asignaciones, llamar: () => listarAsignaciones(1, 1) },
  { nombre: 'pools de jueces', fixture: poolsLista, llamar: listarPools },
  { nombre: 'editores', fixture: editores, llamar: () => listarEditores(1) },
  { nombre: 'taxonomía (catálogo)', fixture: taxCatalogo, llamar: () => obtenerCatalogoTaxonomia(1), opcionales: [] },
  { nombre: 'taxonomía (respuestas)', fixture: taxRespuestas, llamar: () => obtenerRespuestasTaxonomia(1), opcionales: ['valorNumero', 'valorTexto'] /* no aplican a una respuesta de opción */ },
  { nombre: 'usuarios (lista)', fixture: usuariosLista, llamar: listarUsuarios },
  { nombre: 'usuario (detalle)', fixture: usuarioDetalle, llamar: () => obtenerUsuario(1) },
]

const primero = (x: unknown): Record<string, unknown> | null => {
  const o = Array.isArray(x) ? x[0] : x
  return o && typeof o === 'object' ? (o as Record<string, unknown>) : null
}

/** Recorre el resultado del mapeo: ninguna clave en snake_case, y todo id (`id`/`xxxId`) es number. */
function auditar(valor: unknown, ruta: string, problemas: string[]) {
  if (Array.isArray(valor)) valor.forEach((v, i) => auditar(v, `${ruta}[${i}]`, problemas))
  else if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) {
      if (k.includes('_')) problemas.push(`${ruta}.${k}: clave en snake_case`)
      if ((k === 'id' || /Id$/.test(k)) && v !== null && typeof v !== 'number') problemas.push(`${ruta}.${k}: id ${typeof v}, no number`)
      auditar(v, `${ruta}.${k}`, problemas)
    }
  }
}

describe.each(casos)('contrato real: $nombre', ({ fixture, llamar, opcionales = [] }) => {
  it('se mapea sin errores, con camelCase uniforme e ids number', async () => {
    servir(fixture)
    const r = await llamar()
    const problemas: string[] = []
    auditar(r, 'resultado', problemas)
    expect(problemas).toEqual([])
  })

  it('quitar una clave: o lanza ContratoInesperado, o es una clave que el mapeo ignora A PROPÓSITO', async () => {
    const molde = primero(fixture)
    if (!molde) return // lista vacía: sin claves que quitar
    const noRompen: string[] = []
    for (const clave of Object.keys(molde).filter((k) => !opcionales.includes(k))) {
      const roto = Array.isArray(fixture) ? [{ ...molde }, ...fixture.slice(1)] : { ...molde }
      delete (Array.isArray(roto) ? roto[0]! : roto)[clave as never]
      servir(roto)
      try {
        await llamar()
        noRompen.push(clave)
      } catch (e) {
        expect(e).toMatchObject({ name: 'ContratoInesperado' })
      }
    }
    // Únicas claves del wire que el cliente descarta sin mirarlas (columnas internas de la tabla).
    const IGNORADAS = ['firestore_id', 'legacy_id']
    expect(noRompen.filter((k) => !IGNORADAS.includes(k))).toEqual([])
  })
})

describe('contrato real: valores concretos', () => {
  it('ids bigint string => number en organismo, UF, asignación, editor y sesión', async () => {
    servir(organismoDetalle)
    const org = await obtenerOrganismo(1)
    expect(typeof org.id).toBe('number')
    expect(org.propietarioId).toBe(Number((organismoDetalle as { propietario_id: string }).propietario_id))
    servir(asignaciones)
    const [a] = await listarAsignaciones(1, 1)
    expect(a).toEqual({ id: Number(asignaciones[0]!.id), grupoJuecesId: Number(asignaciones[0]!.grupoJuecesId), cantidadAsignada: 3 })
    servir(editores)
    expect((await listarEditores(1))[0]!.usuarioId).toBe(Number(editores[0]!.usuarioId))
    servir(sesion)
    expect((await obtenerSesion())!.usuarioId).toBe(Number(sesion.usuarioId))
  })

  it('el usuario sin roles (`roles: null` real) se mapea a []', async () => {
    servir(usuarioDetalle)
    expect((await obtenerUsuario(1)).roles).toEqual([])
  })

  it('un id que no es entero (p. ej. "abc") lanza ContratoInesperado', async () => {
    servir({ ...organismoDetalle, propietario_id: 'abc' })
    await expect(obtenerOrganismo(1)).rejects.toMatchObject({ name: 'ContratoInesperado' })
    servir({ ...sesion, usuarioId: '12x' })
    await expect(obtenerSesion()).rejects.toMatchObject({ name: 'ContratoInesperado' })
  })

  it('un id fuera del rango seguro de number lanza ContratoInesperado', async () => {
    servir({ ...sesion, usuarioId: '9007199254740993' })
    await expect(obtenerSesion()).rejects.toMatchObject({ name: 'ContratoInesperado' })
  })

  it('taxonomía: en las respuestas `opciones` son solo las elegidas; en el catálogo, todas las posibles', async () => {
    servir(taxCatalogo)
    const catalogo = await obtenerCatalogoTaxonomia(1)
    servir(taxRespuestas)
    const respuestas = await obtenerRespuestasTaxonomia(1)
    const codigo = respuestas[0]!.preguntaCodigo
    expect(respuestas[0]!.opcionesCodigos).toHaveLength(1)
    expect(catalogo.find((p) => p.codigo === codigo)!.opciones.length).toBeGreaterThan(1)
  })
})
