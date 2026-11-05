/**
 * Seguimiento de lo que la app está haciendo con el servidor, para mostrar un indicador de carga:
 * - escrituras (guardar, editar, eliminar): bloquean la pantalla con un cargador mientras dura;
 * - lecturas lentas: solo una barra delgada arriba;
 * - sin internet: una escritura espera a que vuelva la conexión antes de enviarse.
 * Aquí solo vive el estado; el cargador visual está en components/ActivityLoader.tsx.
 */

export interface Activity {
  /** Escrituras en curso */
  writes: number
  /** Método de la escritura más reciente (POST, PATCH, PUT o DELETE) */
  method: string
  /** Título propio de la escritura más reciente (por ejemplo «Iniciando sesión…»), si lo tiene */
  label: string
  /** Lecturas en curso */
  reads: number
  /** Escrituras esperando que vuelva el internet */
  waiting: number
}

let snap: Activity = { writes: 0, method: '', label: '', reads: 0, waiting: 0 }
const subs = new Set<() => void>()
const writes = new Map<number, { method: string; label: string }>()
let seq = 0
let reads = 0
let waiting = 0

function publish() {
  const last = [...writes.values()].pop()
  snap = { writes: writes.size, method: last?.method ?? '', label: last?.label ?? '', reads, waiting }
  subs.forEach((f) => f())
}

export function subscribeActivity(f: () => void) {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}
export const getActivity = () => snap

/** Anota una escritura en curso. Devuelve la función que la da por terminada (se puede llamar más de una vez). */
export function beginWrite(method: string, label = ''): () => void {
  const id = ++seq
  writes.set(id, { method: method.toUpperCase(), label })
  publish()
  return () => {
    if (writes.delete(id)) publish()
  }
}

export function beginRead(): () => void {
  reads++
  publish()
  let done = false
  return () => {
    if (done) return
    done = true
    reads--
    publish()
  }
}

export function beginWait(): () => void {
  waiting++
  publish()
  let done = false
  return () => {
    if (done) return
    done = true
    waiting--
    publish()
  }
}

/** Texto del cargador según qué se está haciendo y cómo va la conexión */
export function loaderText(method: string, slow: boolean, offline: boolean, label = ''): { title: string; detail: string } {
  const title = label || (method === 'DELETE' ? 'Eliminando…' : method === 'POST' ? 'Guardando…' : 'Guardando cambios…')
  if (offline) return { title: 'Sin conexión', detail: 'Esperamos a que vuelva el internet para terminar. No cierres la app.' }
  if (slow) return { title, detail: 'Está tardando más de lo normal. Sigue intentando, no cierres la app.' }
  return { title, detail: 'Un momento, por favor.' }
}

/**
 * Petición de sesión que debe mostrar cargador, con su título. Devuelve null si no lo merece:
 * lecturas y la renovación automática del token pasan sin bloquear la pantalla.
 */
export function authLabel(url: string, method: string): string | null {
  const m = method.toUpperCase()
  if (m === 'GET' || m === 'HEAD') return null
  if (url.includes('grant_type=refresh_token')) return null
  if (url.includes('/token')) return 'Iniciando sesión…'
  if (url.includes('/signup')) return 'Creando tu cuenta…'
  if (url.includes('/recover') || url.includes('/resend')) return 'Enviando el correo…'
  if (url.includes('/logout')) return 'Cerrando sesión…'
  if (url.includes('/otp')) return 'Enviando el código…'
  if (url.includes('/verify') || url.includes('/challenge')) return 'Verificando…'
  if (m === 'PUT' || m === 'PATCH') return 'Guardando cambios…'
  return 'Un momento…'
}
