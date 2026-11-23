// Copyright (c) 2026 Dinovance
// Relectura de los avisos que ya estaban en la barra del teléfono: al abrir, al volver a la app, al iniciar sesión
// y al aceptar la conexión de bancos. Silenciosa, por la cola nativa y como máximo una vez cada 10 s.
import { enqueueNative } from './nativeSerial'
import { ContigoNative, isNativeApp, parseRescan } from './nativeBridge'
import type { RescanResult } from './nativeBridge'
import { logError } from './safeLog'

export const RESCAN_MIN_GAP_MS = 10_000

let lastAt = -Infinity
let inflight = false
const listeners = new Set<(processed: number) => void>()

/** Avisa cuando una relectura encontró avisos nuevos (processed > 0) */
export function onRescanned(cb: (processed: number) => void): () => void {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

/** Solo para pruebas */
export function resetRescan(): void {
  lastAt = -Infinity
  inflight = false
  listeners.clear()
}

/**
 * Pide la relectura. Fuera de la app nativa no hace nada. Nunca lanza ni muestra avisos.
 * `force` salta el límite de 10 s (solo al aceptar la conexión de bancos, que acaba de dar el permiso).
 */
export async function rescanNow(opts: { force?: boolean; now?: number } = {}): Promise<number> {
  if (!isNativeApp() || inflight) return 0
  const now = opts.now ?? Date.now()
  if (!opts.force && now - lastAt < RESCAN_MIN_GAP_MS) return 0
  lastAt = now
  inflight = true
  try {
    const { processed } = parseRescan(await enqueueNative(() => ContigoNative.rescanNotifications()))
    if (processed > 0) listeners.forEach((cb) => cb(processed))
    return processed
  } catch (e) {
    logError(e, 'rescan')
    return 0
  } finally {
    inflight = false
  }
}

/**
 * «Buscar gastos ahora»: la pide la persona, así que salta el límite de 10 s. Devuelve el resultado completo,
 * o null si no es la app nativa o falló (la pantalla dice qué hacer). Refresca la bandeja si encontró algo.
 */
export async function scanNow(): Promise<RescanResult | null> {
  if (!isNativeApp()) return null
  try {
    const r = parseRescan(await enqueueNative(() => ContigoNative.rescanNotifications()))
    lastAt = Date.now()
    if (r.processed > 0) listeners.forEach((cb) => cb(r.processed))
    return r
  } catch (e) {
    logError(e, 'rescan')
    return null
  }
}
