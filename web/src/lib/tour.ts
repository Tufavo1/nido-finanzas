const key = (userId: string) => `nido-tour-v1:${userId}`
const newsKey = (userId: string) => `nido-news-${NEWS_VERSION}:${userId}`
/** Evento que usa Ajustes para volver a abrir la guía */
export const TOUR_EVENT = 'nido:tour'
/** Evento que usa Ajustes para abrir la guía de novedades */
export const NEWS_EVENT = 'nido:news'

/**
 * Guía de novedades: solo sale sola cuando tú lo decides.
 * Para anunciar una actualización: pon `ANNOUNCE_NEWS = true`, cambia `NEWS_VERSION` si ya hubo otra antes y despliega.
 * Cada persona la ve una sola vez; quien está entrando por primera vez ve la de bienvenida y no esta.
 * Con `ANNOUNCE_NEWS = false` nunca se abre sola, pero siempre se puede ver desde Ajustes.
 */
export const NEWS_VERSION = '2026-11'
export const ANNOUNCE_NEWS = false

// El almacenamiento puede estar bloqueado (ventana privada): sin él, la guía simplemente se muestra una vez por sesión
const seenInSession = new Set<string>()

function seen(k: string): boolean {
  if (seenInSession.has(k)) return true
  try {
    return localStorage.getItem(k) !== null
  } catch {
    return false
  }
}

function mark(k: string): void {
  seenInSession.add(k)
  try {
    localStorage.setItem(k, '1')
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export const tourSeen = (userId: string): boolean => seen(key(userId))
export const markTourSeen = (userId: string): void => mark(key(userId))
export const newsSeen = (userId: string): boolean => seen(newsKey(userId))
export const markNewsSeen = (userId: string): void => mark(newsKey(userId))
