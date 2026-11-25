import { describe, expect, it } from 'vitest'
import { toAppError, userMessage, UserError, type AppErrorKind } from './appError'

// Estándares, Backend: taxonomía tipada, mapeo HTTP/Supabase/Postgres → mensaje en español + acción, sin tragar excepciones.
const pg = (code: string, message: string, status: number) => ({ status, error: { code, message } })

describe('toAppError: mapeo por código', () => {
  const casos: [string, unknown, AppErrorKind, string][] = [
    ['23505 clave duplicada', pg('23505', 'duplicate key value violates unique constraint "expenses_pkey"', 409), 'CONFLICT', 'none'],
    ['409 sin código', { status: 409, error: { message: 'conflict' } }, 'CONFLICT', 'none'],
    ['23514 check violado', pg('23514', 'new row violates check constraint "expenses_amount_check"', 400), 'VALIDATION', 'fix_input'],
    ['400', { status: 400, error: { message: 'bad request' } }, 'VALIDATION', 'fix_input'],
    ['422', { status: 422, error: { message: 'unprocessable' } }, 'VALIDATION', 'fix_input'],
    ['401 sesión vencida (JWT expired)', { status: 401, error: { message: 'JWT expired' } }, 'SESSION_EXPIRED', 'login'],
    ['401 genérico', { status: 401, error: { message: 'Invalid login credentials' } }, 'UNAUTHORIZED', 'login'],
    ['403', { status: 403, error: { message: 'forbidden' } }, 'FORBIDDEN', 'none'],
    ['42501 RLS (permission denied)', pg('42501', 'new row violates row-level security policy for table "expenses"', 403), 'FORBIDDEN', 'none'],
    ['404', { status: 404, error: { message: 'not found' } }, 'NOT_FOUND', 'none'],
    ['429', { status: 429, error: { message: 'rate limit' } }, 'RATE_LIMIT', 'wait'],
    ['503 mantención', { status: 503, error: { message: 'unavailable' } }, 'MAINTENANCE', 'wait'],
    ['500', { status: 500, error: { message: 'boom' } }, 'SERVER', 'retry'],
    ['502', { status: 502, error: { message: 'bad gateway' } }, 'SERVER', 'retry'],
    ['504', { status: 504, error: { message: 'gateway timeout' } }, 'TIMEOUT', 'retry'],
    ['408', { status: 408, error: { message: 'request timeout' } }, 'TIMEOUT', 'retry'],
  ]
  it.each(casos)('%s', (_n, input, kind, action) => {
    const e = toAppError(input)
    expect(e.kind).toBe(kind)
    expect(e.action).toBe(action)
    expect(e.message.length).toBeGreaterThan(5)
  })
})

describe('toAppError: errores de red y excepciones', () => {
  it('sin red (TypeError: Failed to fetch) → OFFLINE, reintentar', () => {
    expect(toAppError(new TypeError('Failed to fetch'))).toMatchObject({ kind: 'OFFLINE', action: 'retry' })
    expect(toAppError(new TypeError('Load failed'))).toMatchObject({ kind: 'OFFLINE' })
    expect(toAppError(new TypeError('Network request failed'))).toMatchObject({ kind: 'OFFLINE' })
  })

  it('tiempo agotado (TimeoutError / AbortError por plazo) → TIMEOUT, reintentar', () => {
    const t = new Error('sin respuesta')
    t.name = 'TimeoutError'
    expect(toAppError(t)).toMatchObject({ kind: 'TIMEOUT', action: 'retry' })
    expect(toAppError({ status: 0, error: { message: 'TimeoutError: sin respuesta', code: '' } })).toMatchObject({ kind: 'TIMEOUT' })
  })

  it('estado 0 sin más datos es sin conexión', () => {
    expect(toAppError({ status: 0, error: { message: 'TypeError: Failed to fetch', code: '' } })).toMatchObject({ kind: 'OFFLINE' })
  })

  it('un AppError ya mapeado se devuelve igual (idempotente)', () => {
    const e = toAppError({ status: 429, error: { message: 'x' } })
    expect(toAppError(e)).toEqual(e)
  })
})

describe('toAppError: no traga excepciones ni filtra detalles', () => {
  it('conserva el error original en cause (misma referencia)', () => {
    const original = new TypeError('Failed to fetch')
    expect(toAppError(original).cause).toBe(original)
    const resp = { status: 500, error: { message: 'boom' } }
    expect(toAppError(resp).cause).toBe(resp)
  })

  it('valores raros → UNKNOWN, sin lanzar y con causa conservada', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    for (const raro of [null, undefined, 'texto', 42, {}, [], circular, Symbol('x')]) {
      const e = toAppError(raro)
      expect(e.kind).toBe('UNKNOWN')
      expect(e.action).toBe('contact')
      expect(e.cause).toBe(raro)
    }
  })

  it('el mensaje al usuario nunca contiene texto técnico, SQL, tokens ni montos', () => {
    const e = toAppError(pg('23505', 'duplicate key value violates unique constraint "expenses_pkey" Key (id)=(8f14e45f-ceea-467f-a0e6-9e0a3b2c1d11) amount=12990 Bearer eyJabc.def.ghi', 409))
    expect(e.message).not.toMatch(/duplicate|constraint|expenses_pkey|Bearer|eyJ|8f14e45f|12990|SQL/i)
    expect(e.message).toMatch(/[a-záéíóúñ]/i)
  })

  it('un 5xx cuyo cuerpo trae un token no lo copia al mensaje', () => {
    const e = toAppError({ status: 500, error: { message: 'apikey=sb_publishable_demo Authorization: Bearer abc.def.ghi' } })
    expect(e.message).not.toMatch(/sb_publishable|Bearer|abc\.def/)
  })
})

describe('M3 userMessage: nunca texto crudo del servidor', () => {
  it('un mensaje técnico de la base no se muestra', () => {
    const m = userMessage({ message: 'duplicate key value violates unique constraint "x" (monto 12990)', code: '23505' })
    expect(m).toBe(toAppError({ code: '23505' }).message)
    expect(m).not.toMatch(/duplicate|12990/)
  })
  it('un Error común tampoco se copia', () => {
    expect(userMessage(new Error('select * from secret'))).not.toMatch(/select/)
  })
  it('un mensaje escrito por nosotros (UserError) sí se muestra', () => {
    expect(userMessage(new UserError('Contraseña incorrecta'))).toBe('Contraseña incorrecta')
  })
})
