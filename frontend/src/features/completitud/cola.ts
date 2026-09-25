export type Resultado<R> = { ok: true; valor: R } | { ok: false; error: unknown }

/**
 * Ejecuta `tarea` sobre cada elemento con como máximo `limite` en vuelo a la vez. Devuelve los
 * resultados en el MISMO orden que `items`; el error de un elemento no aborta a los demás.
 * `alProgresar(hechos, total)` se llama tras cada elemento terminado.
 */
export async function ejecutarConConcurrencia<T, R>(
  items: readonly T[],
  limite: number,
  tarea: (item: T, indice: number) => Promise<R>,
  alProgresar?: (hechos: number, total: number) => void,
  cancelado: () => boolean = () => false,
): Promise<(Resultado<R> | undefined)[]> {
  const resultados: (Resultado<R> | undefined)[] = new Array(items.length)
  let siguiente = 0
  let hechos = 0

  async function trabajador() {
    while (siguiente < items.length && !cancelado()) {
      const i = siguiente++
      try {
        resultados[i] = { ok: true, valor: await tarea(items[i]!, i) }
      } catch (error) {
        resultados[i] = { ok: false, error }
      }
      alProgresar?.(++hechos, items.length)
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, items.length)) }, trabajador))
  return resultados
}
