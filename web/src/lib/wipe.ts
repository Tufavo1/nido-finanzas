// Copyright (c) 2026 Dinovance
import { PushNotifications } from '@capacitor/push-notifications'
import { toAppError } from './appError'
import { ContigoNative, isNativeApp } from './nativeBridge'
import { emitNow, invalidateOwner } from './nativeSerial'

/**
 * Al cerrar sesión se borra de este dispositivo lo que dejó la persona: avisos ya mostrados (con montos),
 * avisos pospuestos, el estado del bloqueo y el freno de intentos. Se conservan solo las preferencias
 * del aparato (tema, tiempo de bloqueo, no volver a pedir instalar) y las guías ya vistas.
 */
const KEEP = new Set(['contigo-theme', 'contigo-lock-min', 'contigo-install-dismissed', 'contigo-smart-notify', 'contigo-update-checked', 'contigo-update-later', 'contigo-bank-consent'])

function wipeLocal(): void {
  try {
    const drop: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && ((k.startsWith('contigo-') && !KEEP.has(k) && k !== 'contigo-auth') || k.startsWith('nido:') || k.startsWith('contigo.push.token.'))) drop.push(k)
    }
    drop.forEach((k) => localStorage.removeItem(k))
    sessionStorage.clear()
  } catch {
    /* sin almacenamiento: no hay nada que borrar */
  }
}

/** Un fallo al vaciar lo nativo se registra solo por su tipo: nunca el mensaje */
const logWipeFailure = (e: unknown): void => console.error('[contigo] no se pudo vaciar lo nativo', toAppError(e).kind)

/**
 * Cerrar sesión (o borrar la cuenta): además de lo del navegador, vacía en el teléfono la sesión, la cola cifrada,
 * los borradores capturados, las notificaciones propias y la configuración de captura (`ContigoNative.wipe`).
 */
export function wipeSessionData(): void {
  wipeLocal()
  if (!isNativeApp()) return
  invalidateOwner()
  void PushNotifications.unregister().catch(logWipeFailure)
  void emitNow(ContigoNative.wipe()).catch(logWipeFailure)
}

/** Clave donde se guardan las preferencias de captura (ver useCaptureConfig) */
export const CAPTURE_CONFIG_KEY = 'capture-config'

/**
 * Entró otra persona sin cerrar sesión antes: el teléfono borra las colas y los borradores ajenos y la configuración
 * de la anterior. No usa `wipe()` porque borraría la sesión nueva, que ya se guardó. El dueño nuevo (usuario y hogar)
 * se fija después, al cargar el hogar (`useDetected`).
 */
export function wipeForAccountSwitch(): void {
  wipeLocal()
  if (!isNativeApp()) return
  invalidateOwner()
  void PushNotifications.unregister().catch(logWipeFailure)
  void emitNow(ContigoNative.wipeForAccountSwitch({ ownerKey: null })).catch(logWipeFailure)
  void emitNow(ContigoNative.secureRemove({ key: CAPTURE_CONFIG_KEY })).catch(logWipeFailure)
}
