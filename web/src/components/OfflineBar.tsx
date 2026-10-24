import { useEffect, useState } from 'react'

/** Franja visible mientras no hay internet: los cambios no se guardan sin conexión */
export default function OfflineBar() {
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
  if (online) return null
  return (
    <div className="offline-bar" role="status">
      <strong>Sin conexión.</strong> Puedes mirar lo que ya cargó, pero los cambios no se guardarán hasta que vuelva el internet.
    </div>
  )
}
