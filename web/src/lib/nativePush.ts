// Copyright (c) 2026 Dinovance
// Avisos nativos (Android): permiso con el plugin oficial de Capacitor y token FCM guardado en `native_push_tokens`.
import { PushNotifications } from '@capacitor/push-notifications'
import type { PluginListenerHandle } from '@capacitor/core'
import type { NativePushStatus } from './appUpdate'
import { supabase } from './supabase'

export type PushErrorCode = 'DENIED' | 'OFFLINE' | 'UNAVAILABLE' | 'TIMEOUT' | 'REGISTRATION' | 'FAILED'

/** Error con un código que la pantalla traduce a un mensaje corto; nunca lleva el token ni datos de la persona. */
export class PushError extends Error {
  readonly code: PushErrorCode
  constructor(code: PushErrorCode) {
    super(`push:${code}`)
    this.name = 'PushError'
    this.code = code
  }
}

export const REGISTER_TIMEOUT_MS = 15_000
// Empieza con «contigo-» para que el cierre de sesión (wipe.ts) lo borre; la clave vieja se sigue leyendo y se limpia al escribir
const KEY = (userId: string) => `contigo-push-token-${userId}`
const LEGACY_KEY = (userId: string) => `contigo.push.token.${userId}`

function readToken(userId: string): string | null {
  try {
    return localStorage.getItem(KEY(userId)) || localStorage.getItem(LEGACY_KEY(userId)) || null
  } catch {
    return null
  }
}
function writeToken(userId: string, token: string | null): void {
  try {
    localStorage.removeItem(LEGACY_KEY(userId))
    if (token) localStorage.setItem(KEY(userId), token)
    else localStorage.removeItem(KEY(userId))
  } catch {
    // Sin almacenamiento: el interruptor se verá apagado, pero nada se rompe
  }
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new PushError('FAILED')
  return id
}

interface DbError {
  message?: string
  code?: string
}

/** Qué le pasó a una escritura en Supabase: ya existía, falta el servicio, no hay red u otra cosa */
export function classifyDbError(error: DbError | null, status?: number): PushErrorCode | 'OK' {
  if (!error) return 'OK'
  const code = error.code ?? ''
  if (code === '23505') return 'OK'
  if (code === '42P01' || code.startsWith('PGRST') || status === 404 || /does not exist|schema cache/i.test(error.message ?? '')) return 'UNAVAILABLE'
  if (!code && (status === 0 || /fetch|network|timeout|abort|load failed/i.test(error.message ?? ''))) return 'OFFLINE'
  return 'FAILED'
}

// La tabla aún no está en los tipos generados
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tokens = () => (supabase as any).from('native_push_tokens')

async function insertToken(token: string): Promise<void> {
  let r: { error: DbError | null; status?: number }
  try {
    r = await tokens().insert({ token, platform: 'android' })
  } catch {
    throw new PushError('OFFLINE')
  }
  const c = classifyDbError(r.error, r.status)
  if (c !== 'OK') throw new PushError(c)
}

/** Pide el token al sistema (una sola escucha) y limpia las escuchas pase lo que pase. */
async function obtainToken(timeoutMs: number): Promise<string> {
  const handles: PluginListenerHandle[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new PushError('TIMEOUT')), timeoutMs)
      void (async () => {
        try {
          handles.push(await PushNotifications.addListener('registration', (t) => (t.value ? resolve(t.value) : reject(new PushError('REGISTRATION')))))
          handles.push(await PushNotifications.addListener('registrationError', () => reject(new PushError('REGISTRATION'))))
          await PushNotifications.register()
        } catch {
          reject(new PushError('REGISTRATION'))
        }
      })()
    })
  } finally {
    if (timer) clearTimeout(timer)
    await Promise.all(handles.map((h) => h.remove().catch(() => undefined)))
  }
}

export async function getPushStatus(): Promise<NativePushStatus> {
  const { receive } = await PushNotifications.checkPermissions()
  const permission = receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'default'
  const userId = await currentUserId().catch(() => null)
  return { permission, tokenRegistered: permission === 'granted' && !!userId && readToken(userId) !== null }
}

/** Pide permiso, obtiene el token y lo guarda. Lanza PushError con un código claro si algo falla. */
export async function enablePush(timeoutMs: number = REGISTER_TIMEOUT_MS): Promise<NativePushStatus> {
  const userId = await currentUserId()
  const perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') throw new PushError('DENIED')
  const token = await obtainToken(timeoutMs)
  await insertToken(token)
  writeToken(userId, token)
  return { permission: 'granted', tokenRegistered: true }
}

/** Borra la fila de este teléfono y apaga el registro. Si no se pudo borrar, lanza y el interruptor sigue encendido. */
export async function disablePush(): Promise<void> {
  const userId = await currentUserId()
  const token = readToken(userId)
  if (token) {
    let r: { error: DbError | null; status?: number }
    try {
      r = await tokens().delete().eq('token', token)
    } catch {
      throw new PushError('OFFLINE')
    }
    const c = classifyDbError(r.error, r.status)
    if (c !== 'OK') throw new PushError(c)
  }
  writeToken(userId, null)
  await PushNotifications.unregister().catch(() => undefined)
  await PushNotifications.removeAllListeners().catch(() => undefined)
}

/**
 * Al abrir la app: si los avisos ya estaban activados y el permiso sigue concedido, renueva el token por si rotó.
 * Nunca activa por su cuenta (la persona debe aceptar). Devuelve true si guardó un token nuevo.
 */
export async function refreshPushToken(timeoutMs: number = REGISTER_TIMEOUT_MS): Promise<boolean> {
  const userId = await currentUserId()
  const old = readToken(userId)
  if (!old) return false
  if ((await PushNotifications.checkPermissions()).receive !== 'granted') return false
  const token = await obtainToken(timeoutMs)
  if (token === old) return false
  await insertToken(token)
  writeToken(userId, token)
  try {
    await tokens().delete().eq('token', old)
  } catch {
    // El token viejo queda hasta que el servidor lo limpie
  }
  return true
}

/** Mensaje corto para cada fallo; null = usar el mensaje general */
export function pushErrorCopy(e: unknown): string | null {
  const code = e instanceof PushError ? e.code : null
  if (code === 'OFFLINE') return 'No se pudo cambiar\nRevisa tu conexión.'
  if (code === 'UNAVAILABLE') return 'Todavía no disponible\nLos avisos de tu pareja aún no están activados en el servidor.'
  return null
}
