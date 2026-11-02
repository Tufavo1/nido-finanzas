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

/** Qué se está registrando: un gasto, un pago a una deuda o un aporte a una meta */
export type TargetKind = 'expense' | 'debt' | 'goal'

/** `max`: lo que se puede pagar como máximo (el saldo de la deuda); un pago nunca puede pasarlo */
export function saveBlocker(d: Draft, today: string, kind: TargetKind = 'expense', max?: number): Blocker | null {
  const gross = d.digits ? Number(d.digits) : 0
  // Un pago o aporte no lleva descuento ni categoría ni nota obligatoria
  if (finalAmount(gross, kind === 'expense' && d.hasDiscount, d.discount) <= 0) return 'amount'
  if (kind === 'debt' && max !== undefined && gross > max) return 'over'
  if (kind === 'expense') {
    if (!d.catId) return 'category'
    if (!d.note.trim()) return 'note'
  }
  if (resolveSpentOn(d.date, today) === null) return 'date'
  return null
}

export function saveLabel(blocker: Blocker | null, amount: number, kind: TargetKind = 'expense'): string {
  if (blocker === 'amount') return 'Escribe el monto'
  if (blocker === 'over') return 'Es más de lo que debes'
  if (blocker === 'note') return 'Cuenta de qué es el gasto'
  if (kind === 'debt') return `Pagar ${money(amount)}`
  if (kind === 'goal') return `Aportar ${money(amount)}`
  return `Guardar ${money(amount)}`
}
