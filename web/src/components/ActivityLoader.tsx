import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import LogoLoader from './LogoLoader'
import { getActivity, loaderText, subscribeActivity } from '../lib/activity'

/** Cuánto se espera antes de mostrar el cargador, para que lo instantáneo no parpadee */
const SHOW_AFTER_MS = 300
/** Desde cuándo se considera que algo va lento */
const SLOW_AFTER_MS = 8000
const READ_BAR_AFTER_MS = 1200

/**
 * Cargador de toda la app. Aparece solo cuando algo se guarda, edita o elimina (bloquea la pantalla
 * para que no se toque nada a medias), explica si va lento o si no hay internet, y muestra una barra
 * delgada arriba cuando los datos tardan en cargar.
 */
export default function ActivityLoader() {
  const a = useSyncExternalStore(subscribeActivity, getActivity)
  const [show, setShow] = useState(false)
  const [slow, setSlow] = useState(false)
  const [bar, setBar] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const writing = a.writes > 0
  useEffect(() => {
    if (!writing) return
    const t1 = setTimeout(() => setShow(true), SHOW_AFTER_MS)
    const t2 = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      setShow(false)
      setSlow(false)
    }
  }, [writing])

  const reading = a.reads > 0
  useEffect(() => {
    if (!reading) return
    const t = setTimeout(() => setBar(true), READ_BAR_AFTER_MS)
    return () => {
      clearTimeout(t)
      setBar(false)
    }
  }, [reading])

  const text = loaderText(a.method, slow, a.waiting > 0 || !online, a.label)
  return createPortal(
    <>
      {bar && <div className="net-bar" role="progressbar" aria-label="Cargando datos" />}
      {writing && show && (
        <div className="loader-back" role="status" aria-live="polite" aria-busy="true">
          <div className="loader-card">
            <LogoLoader />
            <strong>{text.title}</strong>
            <span className="muted">{text.detail}</span>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
