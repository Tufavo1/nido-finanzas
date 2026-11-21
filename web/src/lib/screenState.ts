// Copyright (c) 2026 Dinovance
// Qué pantalla de error o vacío corresponde a cada situación. Lógica pura; los textos son para la persona.
import type { AppError } from './appError'

export type ErrorScreen = 'offline' | 'session-expired' | 'no-permission' | 'not-found' | 'maintenance' | 'unexpected'

export interface ScreenSpec {
  screen: ErrorScreen
  title: string
  detail: string
  /** Una accion clara */
  primary: { label: string; kind: 'retry' | 'login' | 'home' | 'back' | 'contact' }
}

const SCREENS: Record<ErrorScreen, ScreenSpec> = {
  offline: {
    screen: 'offline',
    title: 'Sin conexión',
    detail: 'No hay internet en este momento. Lo que ya cargó se puede mirar, pero los cambios se guardarán cuando vuelva la señal.',
    primary: { label: 'Reintentar', kind: 'retry' },
  },
  'session-expired': {
    screen: 'session-expired',
    title: 'Tu sesión terminó',
    detail: 'Por seguridad cerramos tu sesión después de un tiempo. Entra de nuevo para seguir; tus datos están a salvo.',
    primary: { label: 'Entrar de nuevo', kind: 'login' },
  },
  'no-permission': {
    screen: 'no-permission',
    title: 'No tienes permiso para ver esto',
    detail: 'Esta sección es de otra persona o de otra cuenta. Puedes volver al inicio y seguir desde ahí.',
    primary: { label: 'Volver al inicio', kind: 'home' },
  },
  'not-found': {
    screen: 'not-found',
    title: 'No encontramos esa página',
    detail: 'Puede que el enlace sea antiguo o que lo hayas borrado. Vuelve al inicio y búscalo desde ahí.',
    primary: { label: 'Volver al inicio', kind: 'home' },
  },
  maintenance: {
    screen: 'maintenance',
    title: 'Estamos mejorando Contigo',
    detail: 'El servicio está en mantenimiento por unos minutos. Tus datos están a salvo; vuelve a intentarlo en un rato.',
    primary: { label: 'Reintentar', kind: 'retry' },
  },
  unexpected: {
    screen: 'unexpected',
    title: 'Algo salió mal',
    detail: 'No fue tu culpa. Tus datos están a salvo; prueba de nuevo y, si sigue pasando, escríbenos.',
    primary: { label: 'Reintentar', kind: 'retry' },
  },
}

const BY_KIND: Partial<Record<AppError['kind'], ErrorScreen>> = {
  OFFLINE: 'offline',
  TIMEOUT: 'offline',
  SESSION_EXPIRED: 'session-expired',
  UNAUTHORIZED: 'session-expired',
  FORBIDDEN: 'no-permission',
  NOT_FOUND: 'not-found',
  MAINTENANCE: 'maintenance',
}

/** Que pantalla de error corresponde a un error de la app */
export function errorScreen(e: Pick<AppError, 'kind'>): ScreenSpec {
  return SCREENS[BY_KIND[e.kind] ?? 'unexpected']
}

export interface EmptySpec {
  title: string
  /** Guia del primer paso */
  hint: string
  cta: { label: string; target: 'register' | 'goals' | 'money' | 'settings' }
}
export type EmptySection = 'expenses' | 'goals' | 'recurring' | 'drafts'

const EMPTY: Record<EmptySection, EmptySpec> = {
  expenses: {
    title: 'Aún no hay gastos',
    hint: 'Anota el primero: el monto y en qué fue. Con eso ya empiezas a ver adónde se va la plata.',
    cta: { label: 'Anotar mi primer gasto', target: 'register' },
  },
  goals: {
    title: 'Aún no tienes metas',
    hint: 'Crea una meta, por ejemplo un viaje o un fondo de emergencia, y ve cuánto te falta para lograrla.',
    cta: { label: 'Crear mi primera meta', target: 'goals' },
  },
  recurring: {
    title: 'Sin gastos fijos',
    hint: 'Agrega tus cuentas de todos los meses, como el arriendo o el internet, para que Contigo te avise a tiempo.',
    cta: { label: 'Agregar un gasto fijo', target: 'money' },
  },
  drafts: {
    title: 'No hay gastos por confirmar',
    hint: 'Cuando Contigo detecte un gasto en tus avisos del banco, aparecerá aquí para que lo confirmes.',
    cta: { label: 'Revisar los avisos', target: 'settings' },
  },
}

/** null si la lista tiene elementos (no hay estado vacio) */
export function emptyState(section: EmptySection, count: number): EmptySpec | null {
  return count > 0 ? null : EMPTY[section]
}

export type NotificationPermission3 = 'granted' | 'denied' | 'default'

export interface PermissionScreen {
  screen: 'permission-pending' | 'permission-revoked'
  title: string
  detail: string
}

/** Estado de la captura segun el permiso de notificaciones; null si todo esta bien */
export function notificationPermissionState(p: NotificationPermission3, wasGranted: boolean): PermissionScreen | null {
  if (p === 'granted') return null
  if (wasGranted) {
    return {
      screen: 'permission-revoked',
      title: 'Dejamos de ver tus avisos',
      detail: 'El permiso de notificaciones se desactivó, así que ya no podemos detectar tus gastos. Vuelve a activarlo para seguir.',
    }
  }
  return {
    screen: 'permission-pending',
    title: 'Activa el acceso a las notificaciones',
    detail: 'Así podemos leer los avisos de tu banco y preparar tus gastos. El texto no sale de tu teléfono.',
  }
}
