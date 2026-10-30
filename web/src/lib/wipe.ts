/**
 * Al cerrar sesión se borra de este dispositivo lo que dejó la persona: avisos ya mostrados (con montos),
 * avisos pospuestos, el estado del bloqueo y el freno de intentos. Se conservan solo las preferencias
 * del aparato (tema, tiempo de bloqueo, no volver a pedir instalar) y las guías ya vistas.
 */
const KEEP = new Set(['contigo-theme', 'contigo-lock-min', 'contigo-install-dismissed', 'contigo-smart-notify'])

export function wipeSessionData(): void {
  try {
    const drop: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && ((k.startsWith('contigo-') && !KEEP.has(k) && k !== 'contigo-auth') || k.startsWith('nido:'))) drop.push(k)
    }
    drop.forEach((k) => localStorage.removeItem(k))
    sessionStorage.clear()
  } catch {
    /* sin almacenamiento: no hay nada que borrar */
  }
}
