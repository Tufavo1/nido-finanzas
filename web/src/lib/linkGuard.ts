// Copyright (c) 2026 Dinovance
import type { ParsedCandidate } from './candidates'
import { parseExpenseLink } from './deepLink'

/** Mientras dura esta ventana, el mismo enlace cuenta como uno solo (el sistema puede entregarlo dos veces al arrancar). */
export const LINK_WINDOW_MS = 10_000

export interface LinkGuard {
  accept(url: string, nowMs: number): boolean
}

export function createLinkGuard(): LinkGuard {
  let last: { url: string; at: number } | null = null
  return {
    accept(url, nowMs) {
      if (last && last.url === url && nowMs - last.at < LINK_WINDOW_MS) return false
      last = { url, at: nowMs }
      return true
    },
  }
}

export type LinkDraft = { ok: true; candidate: ParsedCandidate } | { ok: false; reason: string }

/** nido://gasto → candidato listo para «Confirmar gasto» (validado por deepLink.ts). */
export function linkToDraft(url: string, now: Date): LinkDraft {
  const link = parseExpenseLink(url, now)
  if (!link.ok) return link
  const at = link.date ? new Date(Number(link.date.slice(0, 4)), Number(link.date.slice(5, 7)) - 1, Number(link.date.slice(8, 10)), 12).getTime() : now.getTime()
  return {
    ok: true,
    candidate: { amountClp: link.amountClp, merchant: link.merchant, kind: 'EXPENSE', confidence: 'HIGH', installment: null, fingerprint: '', postedAtMillis: at },
  }
}
