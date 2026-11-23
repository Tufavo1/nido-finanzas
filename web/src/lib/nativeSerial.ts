// Copyright (c) 2026 Dinovance
/**
 * Cola serial de las llamadas nativas que cambian de dueño (setActiveOwner, wipe*, setAutoProfile).
 * Cada una espera a que termine la anterior, y las que dependen de "quién es el dueño" revisan la generación:
 * si entre tanto hubo un borrado o cambio de cuenta (`invalidateOwner`), la llamada del dueño anterior se descarta.
 */
let chain: Promise<unknown> = Promise.resolve()
let generation = 0
let pending = 0

function track(p: Promise<unknown>): void {
  pending++
  const prev = chain
  chain = Promise.all([prev, p.catch(() => undefined)]).then(() => {
    pending--
  })
}

export const currentGeneration = (): number => generation

/** Marca que lo pendiente de un dueño anterior ya no vale (cambio de cuenta, cierre de sesión) */
export function invalidateOwner(): void {
  generation++
}

/** Encola `fn` tras lo anterior; un fallo previo no frena la cola */
export function enqueueNative<T>(fn: () => Promise<T>): Promise<T> {
  // Con la cola libre sale en el acto (mismo orden en que la WebView emite); si no, espera su turno
  const run = pending === 0 ? fn() : chain.then(fn, fn)
  track(run)
  return run
}

/** Llamada que debe salir de inmediato (borrados): se emite ya, y lo encolado después espera su respuesta */
export function emitNow<T>(p: Promise<T>): Promise<T> {
  track(p)
  return p
}
