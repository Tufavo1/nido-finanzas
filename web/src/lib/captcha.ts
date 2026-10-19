// Verificación anti-bots con Cloudflare Turnstile. Supabase la exige en registro, inicio de sesión
// y recuperación cuando se activa en Authentication → Attack Protection.
// Sin VITE_TURNSTILE_SITE_KEY no hace nada (desarrollo local).

interface Turnstile {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
let script: Promise<Turnstile> | null = null

function load(): Promise<Turnstile> {
  script ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile no disponible')))
    s.onerror = () => {
      script = null
      reject(new Error('No se pudo cargar la verificación anti-bots. Revisa tu conexión.'))
    }
    document.head.appendChild(s)
  })
  return script
}

/** Un token nuevo por llamada (son de un solo uso). Solo muestra algo si Cloudflare pide interacción. */
export async function captchaToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined
  const ts = await load()
  const layer = document.createElement('div')
  layer.className = 'captcha-layer'
  document.body.appendChild(layer)
  let widget: string | undefined
  try {
    return await new Promise<string>((resolve, reject) => {
      const fail = () => reject(new Error('No pudimos verificar que no eres un robot. Inténtalo de nuevo.'))
      widget = ts.render(layer, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        language: 'es',
        callback: resolve,
        'error-callback': fail,
        'expired-callback': fail,
        'timeout-callback': fail,
      })
    })
  } finally {
    if (widget) ts.remove(widget)
    layer.remove()
  }
}
