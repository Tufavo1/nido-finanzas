// Copyright (c) 2026 Dinovance
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isNative } from './platform'

export type HapticKind = 'tap' | 'success' | 'warning' | 'error'

const PREF_KEY = 'contigo-haptics'
const WEB_PATTERN: Record<HapticKind, number | number[]> = { tap: 10, success: 20, warning: [20, 40, 20], error: [40, 60, 40] }

/** La persona puede apagar la vibración en Ajustes (RF-13). Por defecto está encendida. */
export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    // Sin almacenamiento la preferencia no se guarda; la vibración sigue con su valor por defecto
  }
}

async function nativeHaptic(kind: HapticKind): Promise<void> {
  if (kind === 'tap') return Haptics.impact({ style: ImpactStyle.Light })
  const type = { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error }[kind]
  return Haptics.notification({ type })
}

/** Vibración corta para acciones clave. Si no hay motor, o la persona la apagó, no hace nada. */
export function haptic(kind: HapticKind): void {
  if (!hapticsEnabled()) return
  if (isNative()) {
    // Es un detalle de comodidad: si el sistema la tiene desactivada no es un error que haya que mostrar
    void nativeHaptic(kind).catch(() => undefined)
  } else if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(WEB_PATTERN[kind])
  }
}
