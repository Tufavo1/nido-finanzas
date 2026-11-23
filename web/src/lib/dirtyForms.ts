// Copyright (c) 2026 Dinovance
// Formularios con cambios sin guardar: el botón atrás de Android pide confirmar antes de perderlos (RF-11).

const dirty = new Set<symbol>()

/** Marca un formulario como «con cambios»; devuelve la función que lo marca como limpio. */
export function markDirty(name: string): () => void {
  const token = Symbol(name)
  dirty.add(token)
  return () => void dirty.delete(token)
}

export const isDirty = (): boolean => dirty.size > 0
