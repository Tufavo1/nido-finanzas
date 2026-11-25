// Copyright (c) 2026 Dinovance

/** Pantallas que no necesitan los datos del servidor: usan lo del teléfono (el almacén seguro y el plugin) y abren sin internet */
const LOCAL_TABS: readonly string[] = ['security', 'help']

/**
 * Qué se dibuja en el cuerpo de la app. Un error al cargar los datos del hogar (por ejemplo sin internet)
 * reemplaza solo las pantallas que dependen de ellos; Ajustes y Ayuda siguen abiertos. Lo que sí
 * necesita red falla en su propia acción, con su mensaje.
 */
export function bodyGate(tab: string, error: boolean, ready: boolean): 'error' | 'loading' | 'screen' {
  if (LOCAL_TABS.includes(tab)) return error || ready ? 'screen' : 'loading'
  if (error) return 'error'
  return ready ? 'screen' : 'loading'
}
