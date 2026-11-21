// Copyright (c) 2026 Dinovance

/** Taxonomía de errores de la app (estandares.md, Backend). */
export type AppErrorKind =
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'RATE_LIMIT'
  | 'MAINTENANCE'
  | 'SERVER'
  | 'UNKNOWN'

/** Qué le sugerimos hacer a la persona */
export type SuggestedAction = 'retry' | 'login' | 'wait' | 'fix_input' | 'none' | 'contact'

export interface AppError {
  kind: AppErrorKind
  /** Mensaje para la persona, en español simple. Nunca texto técnico ni datos. */
  message: string
  action: SuggestedAction
  /** El error original, intacto, para registrar o relanzar. Nada se traga. */
  cause: unknown
}

/** Mensajes fijos: jamás se copia texto del servidor, que podría traer SQL, tokens o montos. */
const INFO: Record<AppErrorKind, { message: string; action: SuggestedAction }> = {
  OFFLINE: { message: 'Sin conexión. Revisa tu internet e intenta de nuevo.', action: 'retry' },
  TIMEOUT: { message: 'Está tardando demasiado. Intenta de nuevo en un momento.', action: 'retry' },
  UNAUTHORIZED: { message: 'No pudimos verificar tu identidad. Vuelve a entrar.', action: 'login' },
  SESSION_EXPIRED: { message: 'Tu sesión venció. Vuelve a entrar con tu correo y contraseña.', action: 'login' },
  FORBIDDEN: { message: 'No tienes permiso para hacer esto.', action: 'none' },
  NOT_FOUND: { message: 'No encontramos lo que buscabas.', action: 'none' },
  CONFLICT: { message: 'Ese registro ya estaba guardado.', action: 'none' },
  VALIDATION: { message: 'Hay un dato que no es válido. Revísalo e intenta de nuevo.', action: 'fix_input' },
  RATE_LIMIT: { message: 'Demasiados intentos. Espera un momento y vuelve a probar.', action: 'wait' },
  MAINTENANCE: { message: 'Estamos en mantención. Vuelve en unos minutos.', action: 'wait' },
  SERVER: { message: 'Algo falló de nuestro lado. Tus datos están a salvo; intenta de nuevo.', action: 'retry' },
  UNKNOWN: { message: 'Ocurrió un problema inesperado. Si sigue pasando, contáctanos.', action: 'contact' },
}

/** Códigos de Postgres/PostgREST relevantes (https://www.postgresql.org/docs/current/errcodes-appendix.html). */
const PG_CODE_KIND: Record<string, AppErrorKind> = {
  '23505': 'CONFLICT', // unique_violation
  '23514': 'VALIDATION', // check_violation
  '23502': 'VALIDATION', // not_null_violation
  '23503': 'VALIDATION', // foreign_key_violation
  '22P02': 'VALIDATION', // invalid_text_representation
  '42501': 'FORBIDDEN', // insufficient_privilege / RLS
  PGRST301: 'SESSION_EXPIRED', // JWT vencido en PostgREST
}

const STATUS_KIND: Record<number, AppErrorKind> = {
  400: 'VALIDATION',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  408: 'TIMEOUT',
  409: 'CONFLICT',
  422: 'VALIDATION',
  429: 'RATE_LIMIT',
  503: 'MAINTENANCE',
  504: 'TIMEOUT',
}

const NETWORK_FAILURE = /failed to fetch|load failed|network ?request failed|networkerror|network error/i
const TIMEOUT_TEXT = /timeout|timed out/i
const EXPIRED_TEXT = /jwt expired|token.*expired|expired/i

/** Lo único que se lee de un error: estado, código y texto (solo para clasificar, nunca para mostrar). */
interface Shape {
  status?: number
  code?: string
  text: string
  name: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function shapeOf(err: unknown): Shape | null {
  if (!isRecord(err)) return null
  // Respuesta de supabase-js ({status, error}), o un error con status/code propios (AuthApiError, PostgrestError)
  const inner = isRecord(err['error']) ? err['error'] : err
  const status = typeof err['status'] === 'number' && Number.isInteger(err['status']) ? err['status'] : undefined
  return { status, code: str(inner['code']) || undefined, text: str(inner['message']), name: str(err['name']) || str(inner['name']) }
}

function isAppError(v: unknown): v is AppError {
  return isRecord(v) && typeof v['kind'] === 'string' && v['kind'] in INFO && typeof v['message'] === 'string' && typeof v['action'] === 'string' && 'cause' in v
}

function kindOfStatus(status: number, text: string): AppErrorKind {
  if (status === 0) return TIMEOUT_TEXT.test(text) ? 'TIMEOUT' : 'OFFLINE'
  if (status === 401) return EXPIRED_TEXT.test(text) ? 'SESSION_EXPIRED' : 'UNAUTHORIZED'
  const known = STATUS_KIND[status]
  if (known) return known
  return status >= 500 && status <= 599 ? 'SERVER' : 'UNKNOWN'
}

function kindOf(s: Shape): AppErrorKind {
  if (s.name === 'TimeoutError') return 'TIMEOUT'
  if (s.code && PG_CODE_KIND[s.code]) return PG_CODE_KIND[s.code]!
  if (s.status !== undefined) return kindOfStatus(s.status, s.text)
  if (NETWORK_FAILURE.test(s.text)) return 'OFFLINE'
  return 'UNKNOWN'
}

/** Convierte cualquier cosa (Response-like, error de supabase/postgres, Error, valor raro) en un AppError. Nunca lanza. */
export function toAppError(err: unknown): AppError {
  if (isAppError(err)) return err
  const shape = err instanceof Error ? { ...(shapeOf(err) ?? { text: '', name: '' }), text: err.message, name: err.name } : shapeOf(err)
  const kind = shape ? kindOf(shape) : 'UNKNOWN'
  return { kind, ...INFO[kind], cause: err }
}
