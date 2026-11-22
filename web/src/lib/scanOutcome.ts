// Copyright (c) 2026 Dinovance
// Qué decirle a la persona después de «Buscar gastos ahora»: una frase y, si hace falta, una acción. Lógica pura.
import type { RescanResult } from './nativeBridge'

export type ScanAction = 'access' | 'pick-app'

export interface ScanOutcome {
  kind: 'found' | 'info' | 'problem'
  text: string
  action?: { type: ScanAction; label: string }
  /** Pista extra (avisos de otras apps) con su enlace a Avanzado */
  hint?: { text: string; label: string }
}

export const SCAN_FAILED = 'No pude buscar ahora. Inténtalo de nuevo.'

export function describeScan(r: RescanResult): ScanOutcome {
  const hint = r.otherApps && r.otherApps > 0 && r.connected ? { text: 'Hay avisos de otras apps: ¿es alguna tu banco?', label: 'Elegir app' } : undefined
  if (r.processed > 0) return { kind: 'found', text: `Encontré ${r.processed} ${r.processed === 1 ? 'movimiento' : 'movimientos'}` }
  if (r.reason === 'LISTENER_OFF' || (!r.connected && r.reason !== 'NO_BANK_APP')) {
    return { kind: 'problem', text: 'Contigo no puede leer tus avisos. Activa el acceso a notificaciones.', action: { type: 'access', label: 'Activar acceso' } }
  }
  if (r.reason === 'NO_BANK_APP') return { kind: 'problem', text: 'No encontré la app de tu banco.', action: { type: 'pick-app', label: 'Elegir app' } }
  if (r.reason === 'ONLY_SEEN') return { kind: 'info', text: 'Ya habías visto los avisos que hay.', hint }
  if (r.reason === 'NOTHING_ACTIVE') return { kind: 'info', text: 'No hay avisos de tus bancos en la barra ahora. Cuando llegue el próximo, lo tomo solo.', hint }
  return { kind: 'info', text: 'No encontré gastos nuevos. Cuando llegue el próximo aviso, lo tomo solo.', hint }
}
