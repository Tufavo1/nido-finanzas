// Copyright (c) 2026 Dinovance
// Emisor FCM (HTTP v1) para los push nativos. DESACTIVADO mientras no exista el secreto FCM_SERVICE_ACCOUNT_JSON.
// Solo habla con dos direcciones fijas de Google (no hay URL que venga de datos): sin riesgo de SSRF.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SEND_URL = (projectId: string) => `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const JWT_LIFETIME_S = 3600

export interface FcmAccount {
  project_id: string
  client_email: string
  private_key: string
}

export type FcmResult = 'sent' | 'dead' | 'failed'

/** null = el emisor está desactivado (sin secreto o con formato inválido). Nunca lanza ni imprime el secreto. */
export function loadFcmAccount(raw: string | undefined): FcmAccount | null {
  if (!raw) return null
  try {
    const a = JSON.parse(raw) as Partial<FcmAccount>
    return a.project_id && a.client_email && a.private_key?.includes('PRIVATE KEY') ? (a as FcmAccount) : null
  } catch {
    return null
  }
}

const b64url = (bytes: ArrayBuffer | string): string => {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes)
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signJwt(account: FcmAccount, nowS: number): Promise<string> {
  const pem = account.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowS, exp: nowS + JWT_LIFETIME_S }))
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`))
  return `${header}.${claims}.${b64url(signature)}`
}

export async function fetchAccessToken(account: FcmAccount, nowS = Math.floor(Date.now() / 1000)): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await signJwt(account, nowS) }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`oauth ${res.status}`)
  return ((await res.json()) as { access_token: string }).access_token
}

/** 404 o UNREGISTERED = el token ya no sirve y se borra (CA-10-8). Cualquier otra falla se reporta sin datos. */
export async function sendFcm(account: FcmAccount, accessToken: string, deviceToken: string, title: string, body: string): Promise<FcmResult> {
  const res = await fetch(SEND_URL(account.project_id), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    // Prioridad alta solo para gastos y aportes, para que lleguen en Doze (NFR-04).
    // visibility PRIVATE: en la pantalla de bloqueo Android oculta el contenido (con el monto) cuando el teléfono está
    // en «ocultar contenido sensible» (decisión 5). FCM HTTP v1 no permite enviar un cuerpo público alternativo; eso
    // lo tiene que armar la app (setPublicVersion) si el mensaje llega como datos.
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title, body },
        android: { priority: 'HIGH', notification: { visibility: 'PRIVATE' } },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (res.ok) return 'sent'
  return res.status === 404 ? 'dead' : 'failed'
}
