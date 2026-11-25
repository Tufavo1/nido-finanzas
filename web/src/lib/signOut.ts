// Copyright (c) 2026 Dinovance
import { isNativeApp } from './nativeBridge'
import { disablePush as disableNativePush } from './nativePush'
import { disablePush as disableWebPush } from './push'
import { supabase } from './supabase'

const PUSH_CLEANUP_MS = 4_000

/**
 * Cerrar sesión: primero se borra del servidor la fila de avisos de este teléfono (con la sesión aún vigente, si no la
 * base no deja borrarla) y se desregistra el aviso; si falla o tarda se cierra igual, sin dejar a la persona atrapada.
 */
export async function signOutClean(): Promise<void> {
  const cleanup = (isNativeApp() ? disableNativePush() : disableWebPush()).catch(() => undefined)
  await Promise.race([cleanup, new Promise((r) => setTimeout(r, PUSH_CLEANUP_MS))])
  await supabase.auth.signOut()
}
