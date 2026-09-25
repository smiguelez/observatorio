import { describe, expect, it } from 'vitest'
import { ejecutarConConcurrencia } from '@/features/completitud/cola'

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('ejecutarConConcurrencia', () => {
  it('nunca hay más de `limite` tareas en vuelo', async () => {
    let enVuelo = 0
    let maximo = 0
    await ejecutarConConcurrencia(Array.from({ length: 30 }, (_, i) => i), 6, async () => {
      maximo = Math.max(maximo, ++enVuelo)
      await espera(2)
      enVuelo--
    })
    expect(maximo).toBe(6)
  })

  it('conserva el orden de los resultados aunque terminen desordenados', async () => {
    const r = await ejecutarConConcurrencia([30, 1, 15, 2], 4, async (ms) => {
      await espera(ms)
      return ms
    })
    expect(r.map((x) => (x?.ok ? x.valor : null))).toEqual([30, 1, 15, 2])
  })

  it('el error de un elemento no aborta a los demás', async () => {
    const r = await ejecutarConConcurrencia([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('falló')
      return n * 10
    })
    expect(r[0]).toEqual({ ok: true, valor: 10 })
    expect(r[1]).toMatchObject({ ok: false })
    expect(r[2]).toEqual({ ok: true, valor: 30 })
  })

  it('reporta el progreso hasta el total', async () => {
    const pasos: number[] = []
    await ejecutarConConcurrencia([1, 2, 3, 4], 2, async (n) => n, (h) => pasos.push(h))
    expect(pasos).toEqual([1, 2, 3, 4])
  })

  it('se puede cancelar: deja de tomar elementos nuevos', async () => {
    let hechos = 0
    const r = await ejecutarConConcurrencia([1, 2, 3, 4, 5, 6], 1, async () => { hechos++ }, undefined, () => hechos >= 2)
    expect(hechos).toBe(2)
    expect(r.filter(Boolean)).toHaveLength(2)
  })

  it('lista vacía => sin resultados', async () => {
    expect(await ejecutarConConcurrencia([], 6, async () => 1)).toEqual([])
  })
})
