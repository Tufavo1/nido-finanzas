/** La llamada tardó más del tiempo permitido */
export class DeadlineError extends Error {
  constructor() {
    super('deadline')
    this.name = 'DeadlineError'
  }
}

/** Espera `p` como máximo `ms`: si se cuelga, falla en vez de dejar la pantalla cargando para siempre */
export function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError()), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    )
  })
}

/** Tope para leer los avisos que el teléfono no pudo entender */
export const DIAGNOSTICS_DEADLINE_MS = 8000
