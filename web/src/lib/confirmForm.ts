// Copyright (c) 2026 Dinovance
// Reglas de la pantalla «Confirmar gasto»: qué falta para poder guardar. Lógica pura.

export interface ConfirmForm {
  amount: number
  note: string
  categoryId: string | null
  paidBy: string
}

/** Primer problema que impide guardar, en español simple; null si está listo. */
export function confirmBlocker(f: ConfirmForm, memberIds: string[]): string | null {
  if (!Number.isInteger(f.amount) || f.amount <= 0) return 'Escribe cuánto fue, en pesos y sin decimales.'
  if (!f.note.trim()) return 'Dinos dónde o en qué fue el gasto.'
  if (!f.categoryId) return 'Elige una categoría.'
  if (!memberIds.includes(f.paidBy)) return 'Elige quién pagó.'
  return null
}
