/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Se rellenan al compilar (vite.config.ts) */
declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string
declare const __COMMIT__: string

interface ImportMetaEnv {
  /** Clave de sitio de Cloudflare Turnstile (opcional; sin ella no hay CAPTCHA) */
  readonly VITE_TURNSTILE_SITE_KEY?: string
  readonly VITE_VAPID_PUBLIC_KEY: string
  /** ID de cliente de Google (público). Vacío = entrar con Google por redirección */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}
