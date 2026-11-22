// Copyright (c) 2026 Dinovance
// Logica PURA del selector de destinatarios del aviso de gasto (sin Deno ni red): se prueba con vitest
// (web/src/lib/pushRecipients.test.ts).

export const BIG_SPEND_TITLE = 'Tu pareja hizo un gasto mayor'
export const DEFAULT_BIG_SPEND_THRESHOLD = 50_000

export interface BigSpendPref {
  user_id: string
  enabled: boolean
  threshold_clp: number | string
}

/**
 * Quien recibe el titulo de «gasto mayor»: solo quien lo activo y el gasto llega a su umbral (inclusivo).
 * Quien no tiene preferencia (o la tiene apagada, o con un umbral invalido) recibe el aviso normal de siempre.
 * Cada destinatario aparece una sola vez, en uno de los dos grupos.
 */
export function splitRecipients(recipients: readonly string[], prefs: readonly BigSpendPref[], amount: number): { major: string[]; normal: string[] } {
  const byUser = new Map(prefs.map((p) => [p.user_id, p]))
  const major: string[] = []
  const normal: string[] = []
  for (const id of new Set(recipients)) {
    const p = byUser.get(id)
    const threshold = p ? Number(p.threshold_clp) : DEFAULT_BIG_SPEND_THRESHOLD
    const isMajor = !!p && p.enabled === true && Number.isFinite(threshold) && threshold >= 1 && Number.isFinite(amount) && amount >= threshold
    ;(isMajor ? major : normal).push(id)
  }
  return { major, normal }
}

/** Cuerpo del aviso de gasto mayor: monto y categoria completos (no generico). */
export function bigSpendBody(formattedAmount: string, categoryName: string | null | undefined, shared: boolean): string {
  return `${formattedAmount} en ${categoryName ?? 'una categoría'}${shared ? '' : ' (personal)'}`
}
