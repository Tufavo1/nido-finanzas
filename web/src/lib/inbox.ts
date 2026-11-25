// Copyright (c) 2026 Dinovance
// Bandeja de gastos detectados: qué se guarda solo, qué se pregunta y cómo se arma la fila a guardar. Lógica pura.
import { isGeneralCategory, pickDefaultCategory } from './autoCategory'
import { decideCapture } from './candidates'
import { suggestCategory } from './categorize'
import type { ExpenseDraft } from './candidates'
import type { CaptureConfig } from './captureConfig'
import { draftExpenseId } from './draftExpenseId'
import { installmentCase } from './installments'
import type { AutoSavedItem, NativeDraft } from './nativeBridge'
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
 * Categoría con que se guarda un borrador: la que ya trae del teléfono (si sigue existiendo), si no la sugerida por lo aprendido
 * o por palabra clave y, si tampoco hay, la general («Otros»). Es la misma regla del teléfono: el gasto termina igual desde cualquier lado.
 */
export function draftCategoryId(d: NativeDraft, categories: Ctx['categories'], history: Ctx['history']): string | null {
  const merchant = d.merchant?.trim() ?? ''
  const suggested = merchant ? suggestCategory(merchant, categories, history) : null
  if (d.categoryId && categories.some((c) => c.id === d.categoryId)) {
    // Si el teléfono solo dejó la general, una palabra clave («farmacia» → Salud) la corrige
    return isGeneralCategory(d.categoryId, categories) && suggested ? suggested : d.categoryId
  }
  return suggested ?? pickDefaultCategory(categories)
}

/**
 * Un borrador ya confirmado en la notificación se guarda tal cual (también una compra en cuotas con el total conocido; nunca la que solo trae una cuota ni el cobro de una cuota anterior). Los demás solo se guardan solos en modo
 * automático y dentro de sus reglas (`decideCapture`); si vienen de un banco con el guardado automático apagado, nunca solos. Los abonos siempre se preguntan. `busy` evita guardar dos veces.
 */
export function planDrafts(drafts: NativeDraft[], config: CaptureConfig, ctx: Ctx, busy: ReadonlySet<string>): DraftPlan {
  const plan: DraftPlan = { auto: [], ask: [] }
  for (const d of drafts) {
    if (busy.has(d.id)) continue
    // Un confirmado (la persona ya tocó «Guardar») siempre tiene categoría: la suya, la aprendida o la general. Solo sin categorías en el hogar espera en la bandeja
    // Una compra en cuotas solo se guarda sola si la persona ya la confirmó Y el aviso trae el total (el monto es el total).
    // Sin total (solo una cuota) o el cobro de una cuota de una compra ya anotada: se anota por el total o se descarta
    const cuotas = installmentCase(d)
    const needsPerson = cuotas === 'NO_TOTAL' || cuotas === 'PRIOR_CHARGE'
    const confirmed = !needsPerson && d.status === 'CONFIRMED' && d.kind === 'EXPENSE' && draftCategoryId(d, ctx.categories, ctx.history) !== null
    // Con monto dudoso (compra y comisión), posible duplicado o aviso viejo reentregado decide la persona, aunque el modo automático esté encendido
    const unsure = cuotas !== 'NONE' || d.ambiguousAmount === true || d.possibleDuplicate === true || d.staleDate === true
    const auto = confirmed || (d.status === 'PENDING' && !d.bankAutoOff && !unsure && decideCapture(d, config, ctx) === 'AUTO_SAVE')
    plan[auto ? 'auto' : 'ask'].push(d)
  }
  return plan
}

/**
 * Borradores que de verdad esperan a la persona. Si el gasto ya se guardó (el teléfono lo guardó solo y sigue sincronizando,
 * o ya está en los gastos del servidor con el mismo id), no puede verse a la vez como pendiente. Solo se compara por id:
 * mismo monto y comercio puede ser otra compra. Un guardado rechazado por el servidor sí queda a la vista.
 */
export function withoutSavedDrafts(drafts: NativeDraft[], autoSaved: readonly AutoSavedItem[], savedExpenseIds: ReadonlySet<string>): NativeDraft[] {
  const saved = new Set(autoSaved.filter((a) => a.status !== 'rejected').map((a) => a.id))
  return drafts.filter((d) => !saved.has(d.id) && !savedExpenseIds.has(draftExpenseId(d.id)))
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
  // Sin un monto válido no se guarda (p. ej. una cuota cuyo total aún no se conoce)
  if (!Number.isInteger(d.amount) || d.amount <= 0) throw new Error('Falta el monto')
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
