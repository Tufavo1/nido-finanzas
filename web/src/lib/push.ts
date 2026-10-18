import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

function keyToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID
}

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ])
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('No se concedió el permiso de notificaciones')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID) }))
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const authKey = json.keys?.auth
  if (!json.endpoint || !p256dh || !authKey) throw new Error('La suscripción quedó incompleta')
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: json.endpoint, p256dh, auth_key: authKey }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

/** Avisa a la pareja. Nunca bloquea ni rompe el registro si falla. */
export function notifyPartner(kind: 'expense' | 'contribution', id: string): void {
  void supabase.functions.invoke('notify', { body: { kind, id } })
}

export async function sendTest(): Promise<number> {
  const { data, error } = await supabase.functions.invoke('notify', { body: { kind: 'test' } })
  if (error) throw new Error(error.message)
  return (data as { sent?: number } | null)?.sent ?? 0
}