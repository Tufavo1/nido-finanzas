// Copyright (c) 2026 Dinovance
// Pila de ventanas abiertas (modales y hojas): el botón atrás cierra primero la de más arriba.

type Close = () => void
const stack: Close[] = []

/** Registra una ventana abierta; devuelve la función que la quita al cerrarse. */
export function registerOverlay(close: Close): () => void {
  stack.push(close)
  return () => {
    const i = stack.lastIndexOf(close)
    if (i >= 0) stack.splice(i, 1)
  }
}

export const hasOverlay = (): boolean => stack.length > 0

/** Cierra la ventana de más arriba. false si no había ninguna. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}
