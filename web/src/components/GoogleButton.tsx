import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, GOOGLE_ERROR, loadGsi, randomNonce, sha256Hex, signInWithGoogleToken } from '../lib/google'
import { signInWithGoogle } from '../lib/oauth'

const GOOGLE_G = (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

/**
 * «Continuar con Google». Con ID de cliente usa el botón oficial de Google, que entra sin salir de Contigo.
 * Si Google no carga (sin conexión o bloqueado) o no hay ID de cliente, cae al método anterior por redirección.
 */
export default function GoogleButton({ mode, onError }: { mode: 'login' | 'register'; onError: (msg: string | null) => void }) {
  const slot = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>(GOOGLE_CLIENT_ID ? 'loading' : 'fallback')
  const [busy, setBusy] = useState(false)
  // El aviso de error cambia en cada render de la pantalla de entrada: se guarda aparte para no volver a dibujar el botón
  const errorRef = useRef(onError)
  useEffect(() => {
    errorRef.current = onError
  })

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let alive = true
    void (async () => {
      try {
        const gsi = await loadGsi()
        const nonce = randomNonce()
        const hashed = await sha256Hex(nonce)
        if (!alive || !slot.current) return
        gsi.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: hashed,
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: (r) => {
            if (!r.credential) return errorRef.current(GOOGLE_ERROR)
            setBusy(true)
            errorRef.current(null)
            void signInWithGoogleToken(r.credential, nonce).then((err) => {
              // Si salió bien, la sesión cambia y esta pantalla desaparece sola
              if (err) errorRef.current(err)
              setBusy(false)
            })
          },
        })
        const width = Math.min(400, Math.max(200, Math.floor(slot.current.clientWidth)))
        gsi.renderButton(slot.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: mode === 'register' ? 'signup_with' : 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
          width,
          locale: 'es',
        })
        setState('ready')
        // Si Google cambia su estilo y la política de seguridad lo bloquea, el botón sale gigante y sin forma: se usa el respaldo
        window.setTimeout(() => {
          if (alive && slot.current && slot.current.getBoundingClientRect().height > 80) setState('fallback')
        }, 1500)
      } catch {
        if (alive) setState('fallback')
      }
    })()
    return () => {
      alive = false
    }
  }, [mode])

  if (state === 'fallback') {
    return (
      <button
        type="button"
        className="btn-google"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          onError(null)
          void signInWithGoogle().then((err) => {
            if (err) {
              onError(err)
              setBusy(false)
            }
          })
        }}
      >
        {GOOGLE_G}
        <span>{busy ? 'Abriendo Google…' : mode === 'register' ? 'Registrarme con Google' : 'Continuar con Google'}</span>
      </button>
    )
  }
  return (
    <div className="google-slot" aria-busy={state === 'loading' || busy}>
      {state === 'loading' && <span className="hint">Cargando Google…</span>}
      <div ref={slot} className={busy ? 'google-btn busy' : 'google-btn'} />
      {busy && <span className="hint" role="status">Entrando…</span>}
    </div>
  )
}
