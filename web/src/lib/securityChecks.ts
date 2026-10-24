import { getLockMinutes } from './applock'

export interface Check {
  id: string
  label: string
  /** true = bien, false = conviene revisarlo, null = no aplica o no se puede saber en este navegador */
  ok: boolean | null
  detail: string
}

/** Cuántas respuestas de la base de datos o del captcha hay guardadas en las cachés de este navegador (debe ser 0) */
async function cachedPrivateResponses(): Promise<number | null> {
  if (!('caches' in window)) return null
  try {
    let n = 0
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const req of await cache.keys()) {
        const u = new URL(req.url)
        if (u.pathname.startsWith('/supabase/') || u.hostname === 'challenges.cloudflare.com') n++
      }
    }
    return n
  } catch {
    return null
  }
}

/** Revisa en este mismo dispositivo qué protecciones están activas ahora mismo */
export async function runSecurityChecks(): Promise<Check[]> {
  const secure = window.isSecureContext && (location.protocol === 'https:' || location.hostname === 'localhost')
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null
  const cached = await cachedPrivateResponses()
  const lock = getLockMinutes()
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker.controller !== null : null

  return [
    {
      id: 'tls',
      label: 'Conexión cifrada (HTTPS)',
      ok: secure,
      detail: secure ? 'Todo lo que viaja entre tu teléfono y el servidor va cifrado.' : 'Esta página no está en un contexto seguro. No ingreses datos reales aquí.',
    },
    {
      id: 'cache',
      label: 'Sin datos privados en la caché',
      ok: cached === null ? null : cached === 0,
      detail:
        cached === null
          ? 'Este navegador no deja revisarlo.'
          : cached === 0
            ? 'Ninguna respuesta con tus finanzas está guardada en la caché del navegador.'
            : `Hay ${cached} respuestas guardadas. Recarga la app para que se limpien; si sigue igual, avísanos.`,
    },
    {
      id: 'lock',
      label: 'Bloqueo por inactividad',
      ok: lock > 0,
      detail: lock > 0 ? `La app se bloquea tras ${lock} ${lock === 1 ? 'minuto' : 'minutos'} sin usarla.` : 'Está apagado. Actívalo en Ajustes → Bloqueo de la app.',
    },
    {
      id: 'sw',
      label: 'Versión controlada por la app',
      ok: sw,
      detail: sw ? 'El service worker está activo: la app se actualiza sola y carga rápido.' : 'Aún no hay service worker activo; recarga una vez para activarlo.',
    },
    {
      id: 'install',
      label: 'Abierta como app instalada',
      ok: standalone ? true : null,
      detail: standalone ? 'Corre en su propia ventana, sin barra de direcciones ni pestañas ajenas.' : 'Estás en el navegador. Instalarla es opcional.',
    },
    {
      id: 'persist',
      label: 'Almacenamiento protegido del borrado',
      ok: persisted,
      detail:
        persisted === null
          ? 'Este navegador no lo informa.'
          : persisted
            ? 'El navegador no borrará los datos de la app por falta de espacio.'
            : 'El navegador podría limpiar el almacenamiento si falta espacio. Tus datos siguen seguros en el servidor.',
    },
  ]
}
