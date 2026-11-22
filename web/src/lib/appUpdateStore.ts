// Copyright (c) 2026 Dinovance
import { useSyncExternalStore } from 'react'
import { parseUpdateInfo, progressPercent, shouldCheck, shouldPrompt, updateErrorInfo } from './appUpdate'
import type { UpdateErrorInfo, UpdateInfo } from './appUpdate'
import { ContigoNative, isNativeApp } from './nativeBridge'

/**
 * Estado de la actualización de la app Android, compartido entre la hoja de aviso y «Acerca de».
 * Solo corre en nativo. Sin conexión o con el plugin sin esta función, falla en silencio (salvo si la persona lo pidió).
 */
export type UpdatePhase = 'idle' | 'checking' | 'prompt' | 'downloading' | 'installing' | 'error' | 'uptodate'

export interface UpdateState {
  phase: UpdatePhase
  info: UpdateInfo
  percent: number | null
  error: UpdateErrorInfo | null
}

const LAST_KEY = 'contigo-update-checked'
const LATER_KEY = 'contigo-update-later'

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin almacenamiento: se vuelve a avisar, no pasa nada */
  }
}

let state: UpdateState = { phase: 'idle', info: { available: false }, percent: null, error: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<UpdateState>): void => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
let busy = false

/** Revisa si hay versión nueva. `manual` (botón de Acerca de) ignora el límite de 12 h y lo descartado, y cuenta los errores. */
export async function checkUpdates(manual = false): Promise<void> {
  if (!isNativeApp() || busy) return
  const last = Number(read(LAST_KEY))
  if (!manual && !shouldCheck(read(LAST_KEY) === null ? null : last, Date.now())) return
  busy = true
  set({ phase: 'checking', error: null })
  try {
    const info = parseUpdateInfo(await ContigoNative.checkForUpdate())
    write(LAST_KEY, String(Date.now()))
    if (shouldPrompt(info, read(LATER_KEY), manual)) set({ phase: 'prompt', info })
    else set({ phase: info.available ? 'idle' : 'uptodate', info })
  } catch (e) {
    set(manual ? { phase: 'error', error: updateErrorInfo(e) } : { phase: 'idle' })
  }
  busy = false
}

/** «Actualizar ahora»: descarga con avance y abre el instalador */
export async function startUpdate(): Promise<void> {
  if (!isNativeApp() || busy) return
  busy = true
  set({ phase: 'downloading', percent: null, error: null })
  const sub = await ContigoNative.addListener('updateProgress', (e) => set({ percent: progressPercent(e.downloaded, e.total) })).catch(() => null)
  try {
    await ContigoNative.downloadUpdate()
    set({ phase: 'installing', percent: 100 })
    await ContigoNative.installUpdate()
    set({ phase: 'idle' })
  } catch (e) {
    set({ phase: 'error', error: updateErrorInfo(e) })
  }
  void sub?.remove()
  busy = false
}

/** «Más tarde»: no vuelve a avisar de ESTA versión */
export function postponeUpdate(): void {
  if (state.info.versionName) write(LATER_KEY, state.info.versionName)
  set({ phase: 'idle', error: null })
}

export function closeUpdate(): void {
  set({ phase: 'idle', error: null })
}

export function openInstallPermission(): void {
  void ContigoNative.openInstallSettings().catch(() => undefined)
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
    () => state,
  )
}
