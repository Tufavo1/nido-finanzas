import { parseBankNotice } from './bankNotice'
import { suggestCategory } from './categorize'
import { money } from './format'

/** Lo que la persona va anotando en «Registrar» antes de guardar */
export interface Draft {
  digits: string
  catId: string
  paidBy: string
  shared: boolean
  step: 1 | 2 | 3 | 4
  more: boolean
  note: string
  /** Vacía = hoy */
  date: string
  hasDiscount: boolean
  discount: string
}

/** Qué falta para poder guardar */
export type Blocker = 'amount' | 'over' | 'category' | 'note' | 'date'

export function initialDraft(catId: string | undefined, paidBy: string): Draft {
  return { digits: '', catId: catId ?? '', paidBy, shared: true, step: 1, more: false, note: '', date: '', hasDiscount: false, discount: '' }
}

/** Lo que realmente se pagó, ya con el descuento aplicado */
export function finalAmount(gross: number, hasDiscount: boolean, discount: string): number {
  const pct = hasDiscount ? Math.min(100, Math.max(0, Number(discount.replace(',', '.')) || 0)) : 0
  return Math.round(gross * (1 - pct / 100))
}

/** La fecha es opcional (vacía = hoy); una fecha futura no vale (null) */
export function resolveSpentOn(date: string, today: string): string | null {
  if (!date) return today
  return date > today ? null : date
}

export type NoticeDraft =
  | { ok: true; digits: string; note: string; /** Vacía = hoy */ date: string; /** null = que la persona elija */ catId: string | null }
  | { ok: false; error: string }

/** El monto más grande que acepta el teclado de «Registrar» (9 cifras) */
const MAX_AMOUNT = 999_999_999

/** Convierte el aviso de compra del banco en un gasto listo para revisar y guardar */
export function draftFromNotice(
  text: string,
  categories: { id: string; name: string }[],
  history: { note: string | null; category_id: string }[],
  now: Date,
): NoticeDraft {
  const n = parseBankNotice(text, now)
  if (!n) return { ok: false, error: 'No encontramos un monto en pesos en ese aviso. Anótalo a mano.' }
  if (n.kind === 'income') return { ok: false, error: 'Ese aviso es de plata que entró, no de un gasto.' }
  if (n.amount > MAX_AMOUNT) return { ok: false, error: 'Ese monto es demasiado grande. Anótalo a mano.' }
  return { ok: true, digits: String(n.amount), note: n.merchant, date: n.date ?? '', catId: suggestCategory(n.merchant, categories, history) }
}

/** Qué se está registrando: un gasto, un pago a una deuda o un aporte a una meta */
export type TargetKind = 'expense' | 'debt' | 'goal'

/** `max`: lo que se puede pagar como máximo (el saldo de la deuda); un pago nunca puede pasarlo */
export function saveBlocker(d: Draft, today: string, kind: TargetKind = 'expense', max?: number): Blocker | null {
  const gross = d.digits ? Number(d.digits) : 0
  // Un pago o aporte no lleva descuento ni categoría ni nota obligatoria
  if (finalAmount(gross, kind === 'expense' && d.hasDiscount, d.discount) <= 0) return 'amount'
  if (kind === 'debt' && max !== undefined && gross > max) return 'over'
  if (kind === 'expense') {
    if (!d.note.trim()) return 'note'
    if (!d.catId) return 'category'
  }
  if (resolveSpentOn(d.date, today) === null) return 'date'
  return null
}

export function saveLabel(blocker: Blocker | null, amount: number, kind: TargetKind = 'expense'): string {
  if (blocker === 'amount') return 'Escribe el monto'
  if (blocker === 'over') return 'Es más de lo que debes'
  if (blocker === 'note') return 'Cuenta de qué es el gasto'
  if (blocker === 'category') return 'Elige la categoría'
  if (blocker === 'date') return 'La fecha no puede ser futura'
  if (kind === 'debt') return `Pagar ${money(amount)}`
  if (kind === 'goal') return `Aportar ${money(amount)}`
  return `Guardar ${money(amount)}`
}
