// Copyright (c) 2026 Dinovance
import { santiagoDay } from './format'
import { learnedCategory, suggestCategory } from './categorize'
import { cuotasText, installmentCase } from './installments'
import type { InstallmentFields } from './installments'

/**
 * EXPENSE: compra. INCOME: plata que entró (ingreso extra). DEBT_PAYMENT: pago a tu propia tarjeta o crédito (no es gasto).
 * TRANSFER_OUT: transferencia que hiciste a otra persona (el destinatario viene en merchant): gasto o pago de deuda, lo decide la persona.
 */
export type CandidateKind = 'EXPENSE' | 'INCOME' | 'DEBT_PAYMENT' | 'TRANSFER_OUT'
export type CandidateConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

/** Lo que entrega el plugin nativo (ParsedCandidate de Kotlin + fecha del aviso). Nunca incluye el texto bruto. */
export interface ParsedCandidate extends InstallmentFields {
  amountClp: number
  merchant: string | null
  kind: CandidateKind
  confidence: CandidateConfidence
  installment: { n: number; total: number } | null
  fingerprint: string
  postedAtMillis: number
}

export interface ExpenseDraft {
  amount: number
  note: string
  /** AAAA-MM-DD (fecha local del aviso) */
  spent_on: string
  shared: boolean
  paid_by: string
  category_id: string | null
  paymentMethod?: 'debito' | 'tarjeta'
  cardDebtId?: string | null
}

interface Cat { id: string; name: string }
interface Past { note: string | null; category_id: string }

export interface DraftOptions {
  paidBy: string
  /** Preferencia de la persona: ¿los gastos capturados van como compartidos? */
  shared: boolean
  categories: Cat[]
  history: Past[]
}

/** La fecha del gasto sale de America/Santiago, no de la zona del teléfono (H-13). */
export function localDate(millis: number): string {
  return santiagoDay(new Date(millis))
}

/**
 * Compra en cuotas: «Comercio (3 cuotas de $10.000)», igual que la nota del teléfono; el valor guardado es el total.
 * Un borrador antiguo solo con «installment» queda como «Comercio (cuota 1/3)».
 */
function noteOf(c: ParsedCandidate): string {
  const merchant = c.merchant?.trim() ?? ''
  const cuota = c.installmentCount ? cuotasText(c.installmentCount, c.installmentValueClp) : c.installment ? `cuota ${c.installment.n}/${c.installment.total}` : null
  if (!cuota) return merchant
  return merchant ? `${merchant} (${cuota})` : cuota
}

export function candidateToDraft(c: ParsedCandidate & { medium?: string | null }, o: DraftOptions): ExpenseDraft {
  const merchant = c.merchant?.trim() ?? ''
  const noTotal = installmentCase(c) === 'NO_TOTAL'
  return {
    // Si el aviso solo trae una cuota, el monto queda vacío: el total lo escribe la persona
    amount: noTotal ? 0 : Math.trunc(c.amountClp),
    note: noteOf(c),
    spent_on: localDate(c.postedAtMillis),
    shared: o.shared,
    paid_by: o.paidBy,
    category_id: merchant ? suggestCategory(merchant, o.categories, o.history) : null,
    // Una compra avisada como crédito va a la tarjeta (sin tarjeta elegida: la única del hogar, si hay una)
    // Una compra en cuotas es con tarjeta de crédito aunque el aviso no lo diga
    ...(c.kind === 'EXPENSE' && (c.medium === 'CREDIT' || c.installmentRole === 'PURCHASE') ? { paymentMethod: 'tarjeta' as const } : {}),
  }
}

export type CaptureMode = 'CONFIRM' | 'AUTO'
export interface CaptureSettings { mode: CaptureMode; maxClp: number }
/** Modo apagado (CONFIRM) y tope de 50.000 CLP (decisiones.md, punto 3). */
export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = { mode: 'CONFIRM', maxClp: 50_000 }

export type CaptureDecision = 'AUTO_SAVE' | 'ASK'

/**
 * Guardar solo es posible en modo AUTO, para un gasto de confianza alta, dentro del tope (inclusivo), con comercio
 * y una categoría que la persona ya usó antes. Todo lo demás (abonos, retiros, dudas) pide confirmación.
 */
export function decideCapture(c: ParsedCandidate, s: CaptureSettings, ctx: { categories: Cat[]; history: Past[] }): CaptureDecision {
  if (s.mode !== 'AUTO' || c.kind !== 'EXPENSE' || c.confidence !== 'HIGH') return 'ASK'
  if (c.amountClp <= 0 || c.amountClp > s.maxClp) return 'ASK'
  const merchant = c.merchant?.trim() ?? ''
  if (!merchant || !learnedCategory(merchant, ctx.categories, ctx.history)) return 'ASK'
  return 'AUTO_SAVE'
}
