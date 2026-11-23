// Copyright (c) 2026 Dinovance
import type { AppErrorKind } from './appError'

/** Código de respuesta (0 = sin conexión) → tipo de error, para elegir la pantalla de estado. */
export function kindForStatus(status: number): AppErrorKind {
  if (status === 0) return 'OFFLINE'
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 503) return 'MAINTENANCE'
  if (status === 408 || status === 504) return 'TIMEOUT'
  return status >= 500 ? 'SERVER' : 'UNKNOWN'
}
