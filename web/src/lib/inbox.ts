// Copyright (c) 2026 Dinovance
// Bandeja de gastos detectados: qué se guarda solo, qué se pregunta y cómo se arma la fila a guardar. Lógica pura.
import { decideCapture } from './candidates'
import { suggestCategory } from './categorize'
import type { ExpenseDraft } from './candidates'
import type { CaptureConfig } from './captureConfig'
import { draftExpenseId } from './draftExpenseId'
import type { NativeDraft } from './nativeBridge'
import type { QueuePayload } from './offlineQueue'

interface Ctx {
  categories: { id: string; name: string }[]
  history: { note: string | null; category_id: string }[]
}

export interface DraftPlan {
  /** Se guardan sin preguntar */
  auto: NativeDraft[]
  /** Esperan en la bandeja a que la persona los revise */
  ask: NativeDraft[]
}

/**
 * Un borrador ya confirmado en la notificación se guarda tal cual. Los demás solo se guardan solos en modo
 * automático y dentro de sus reglas (`decideCapture`); si vienen de un banco con el guardado automático apagado, nunca solos. Los abonos siempre se preguntan. `busy` evita guardar dos veces.
 */
export function planDrafts(drafts: NativeDraft[], config: CaptureConfig, ctx: Ctx, busy: ReadonlySet<string>): DraftPlan {
  const plan: DraftPlan = { auto: [], ask: [] }
  for (const d of drafts) {
    if (busy.has(d.id)) continue
    // Para guardar sin preguntar hace falta una categoría; si no se conoce, la persona la elige en la bandeja
    const confirmed = d.status === 'CONFIRMED' && d.kind === 'EXPENSE' && !!d.merchant && suggestCategory(d.merchant, ctx.categories, ctx.history) !== null
    const auto = confirmed || (d.status === 'PENDING' && !d.bankAutoOff && decideCapture(d, config, ctx) === 'AUTO_SAVE')
    plan[auto ? 'auto' : 'ask'].push(d)
  }
  return plan
}

export interface ExpenseRow {
  id: string
  household_id: string
  category_id: string
  amount: number
  paid_by: string
  shared: boolean
  note: string
  spent_on: string
  payment_method?: 'tarjeta'
  card_debt_id?: string | null
}

/** Fila de `expenses` con el id idempotente; un gasto personal lo paga quien lo anota. */
export function expenseRow(householdId: string, id: string, d: ExpenseDraft, meId: string): ExpenseRow {
  if (!d.category_id) throw new Error('Falta la categoría')
  return {
    id,
    household_id: householdId,
    category_id: d.category_id,
    amount: d.amount,
    paid_by: d.shared ? d.paid_by : meId,
    shared: d.shared,
    note: d.note.trim(),
    spent_on: d.spent_on,
    // Con débito no se manda nada: la base pone 'debito' y sin tarjeta
    ...(d.paymentMethod === 'tarjeta' ? { payment_method: 'tarjeta' as const, card_debt_id: d.cardDebtId ?? null } : {}),
  }
}

/** El gasto con el id que sale del borrador: el mismo en el primer envío y en todo reintento de la cola. */
export const formWithId = (form: ExpenseDraft, nativeDraftId: string): QueuePayload => ({ ...form, id: draftExpenseId(nativeDraftId) })
