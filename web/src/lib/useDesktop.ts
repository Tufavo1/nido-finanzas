import { useEffect, useState } from 'react'

/** Mismo punto de corte que el menú lateral del CSS: desde ahí hay pantalla para más análisis */
const QUERY = '(min-width: 1100px)'

/** `true` en computador y pantallas anchas; `false` en el celular, donde las pantallas muestran solo lo esencial */
export function useDesktop(): boolean {
  const [yes, setYes] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const on = () => setYes(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return yes
}
