import { money } from './format'

/** Frase corta del estado del mes frente a los límites por categoría */
export function monthStatus({ budget, total, isCurrent, daysLeft }: { budget: number; total: number; isCurrent: boolean; daysLeft: number }): string {
  if (budget <= 0) return 'Pon límites por categoría en Gastos para ver cuánto les queda.'
  const left = budget - total
  if (left < 0) return `Se pasaron por ${money(-left)}`
  return isCurrent ? `Les quedan ${money(left)} · ${daysLeft} días` : `Sobraron ${money(left)}`
}

/** «Últimos gastos» del Inicio: solo los 3 más recientes (la lista ya viene ordenada) */
export function latestExpenses<T>(expenses: T[]): T[] {
  return expenses.slice(0, 3)
}

/** Gastos del día elegido en el calendario; sin día elegido no hay lista */
export function dayExpenses<T extends { spent_on: string }>(expenses: T[], day: number | null): T[] {
  if (day === null) return []
  return expenses.filter((e) => Number(e.spent_on.slice(8, 10)) === day)
}

/** Comparación con el mes pasado; null si no hay con qué comparar */
export function deltaText(deltaPct: number | null, isCurrent: boolean): string | null {
  if (deltaPct === null) return null
  if (deltaPct === 0) return 'Igual que el mes pasado'
  return `${Math.abs(deltaPct)} % ${deltaPct > 0 ? 'más' : 'menos'} que el mes pasado${isCurrent ? ' a esta fecha' : ''}`
}
