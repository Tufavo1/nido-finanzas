// Copyright (c) 2026 Dinovance

export type ExpenseLink =
  | { ok: true; amountClp: number; merchant: string | null; /** AAAA-MM-DD o null (= hoy) */ date: string | null }
  | { ok: false; reason: string }

/** Límite de la columna amount de la base: el monto debe ser menor. */
const MAX_AMOUNT = 10_000_000_000
const MAX_MERCHANT = 60
const MAX_AMOUNT_DIGITS = 10
// Solo esquema nido, acción «gasto», sin usuario, puerto, ruta ni fragmento.
const SHAPE = /^nido:\/\/gasto(?:\?([^#]*))?$/i
const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Control, formato (U+202E, U+200B, U+2066-2069, U+FEFF, U+00AD...) y separadores de línea o párrafo: sirven para suplantar al comercio. */
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}]/u
// El unidor de ancho cero entre dos emoji (👨‍🍳) es legítimo (R2-13)
const EMOJI_ZWJ = /(?<=[\p{Extended_Pictographic}\uFE0F])\u200D(?=\p{Extended_Pictographic})/gu
const hasControlChars = (s: string) => UNSAFE.test(s.replace(EMOJI_ZWJ, ''))

const fail = (reason: string): ExpenseLink => ({ ok: false, reason })

function readAmount(params: URLSearchParams): number | string {
  const all = params.getAll('monto')
  if (all.length === 0) return 'Falta el monto.'
  if (all.length > 1) return 'El monto viene repetido.'
  const raw = all[0]!
  if (!new RegExp(`^\\d{1,${MAX_AMOUNT_DIGITS}}$`).test(raw)) return 'El monto debe ser un número entero de pesos.'
  const amount = Number(raw)
  return amount >= 1 && amount < MAX_AMOUNT ? amount : 'El monto está fuera del rango permitido.'
}

function readMerchant(params: URLSearchParams): string | null | undefined {
  const all = params.getAll('comercio')
  if (all.length === 0) return null
  const raw = all[0]!
  if (all.length > 1 || hasControlChars(raw)) return undefined
  const merchant = raw.trim()
  if (merchant.length > MAX_MERCHANT) return undefined
  return merchant === '' ? null : merchant
}

/** Fecha válida y no futura, o null (= hoy), igual que el parser de avisos (RF-02). */
function readDate(params: URLSearchParams, now: Date): string | null {
  const m = DATE_SHAPE.exec(params.get('fecha') ?? '')
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  const exists = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return exists && date <= today ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** Valida nido://gasto?monto=..&comercio=..&fecha=.. (RF-27). `now` explícito para la fecha. */
export function parseExpenseLink(url: string, now: Date): ExpenseLink {
  const shape = SHAPE.exec(url)
  if (!shape) return fail('El enlace no es de Contigo.')
  const params = new URLSearchParams(shape[1] ?? '')
  const amount = readAmount(params)
  if (typeof amount === 'string') return fail(amount)
  const merchant = readMerchant(params)
  if (merchant === undefined) return fail('El comercio no es válido.')
  return { ok: true, amountClp: amount, merchant, date: readDate(params, now) }
}
