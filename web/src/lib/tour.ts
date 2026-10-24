const key = (userId: string) => `nido-tour-v1:${userId}`
/** Evento que usa Ajustes para volver a abrir la guía */
export const TOUR_EVENT = 'nido:tour'

// El almacenamiento puede estar bloqueado (ventana privada): sin él, la guía simplemente se muestra una vez por sesión
const seenInSession = new Set<string>()

export function tourSeen(userId: string): boolean {
  if (seenInSession.has(userId)) return true
  try {
    return localStorage.getItem(key(userId)) !== null
  } catch {
    return false
  }
}

export function markTourSeen(userId: string): void {
  seenInSession.add(userId)
  try {
    localStorage.setItem(key(userId), '1')
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}
