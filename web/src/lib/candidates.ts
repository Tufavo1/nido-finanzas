// Copyright (c) 2026 Dinovance
import { learnedCategory, suggestCategory } from './categorize'

export type CandidateKind = 'EXPENSE' | 'INCOME'
export type CandidateConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

/** Lo que entrega el plugin nativo (ParsedCandidate de Kotlin + fecha del aviso). Nunca incluye el texto bruto. */
export interface ParsedCandidate {
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

/** La base cuenta los días en America/Santiago: la fecha del gasto sale de esa zona, no de la del teléfono (H-13). */
const SANTIAGO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })

function localDate(millis: number): string {
  return SANTIAGO_DAY.format(new Date(millis))
}

/** «Prueba Electro (cuota 1/3)»: el valor guardado es el de la cuota, el total queda en la nota. */
function noteOf(c: ParsedCandidate): string {
  const merchant = c.merchant?.trim() ?? ''
  if (!c.installment) return merchant
  const cuota = `cuota ${c.installment.n}/${c.installment.total}`
  return merchant ? `${merchant} (${cuota})` : cuota
}

export function candidateToDraft(c: ParsedCandidate, o: DraftOptions): ExpenseDraft {
  const merchant = c.merchant?.trim() ?? ''
  return {
    amount: Math.trunc(c.amountClp),
    note: noteOf(c),
    spent_on: localDate(c.postedAtMillis),
    shared: o.shared,
    paid_by: o.paidBy,
    category_id: merchant ? suggestCategory(merchant, o.categories, o.history) : null,
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
