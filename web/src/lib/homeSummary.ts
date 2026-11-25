import { money } from './format'
import { plural } from './plural'

/** Frase corta del estado del mes frente a los límites por categoría */
export function monthStatus({ budget, total, isCurrent, daysLeft }: { budget: number; total: number; isCurrent: boolean; daysLeft: number }): string {
  if (budget <= 0) return 'Pon límites por categoría en Gastos para ver cuánto les queda.'
  const left = budget - total
  if (left < 0) return `Se pasaron por ${money(-left)}`
  return isCurrent ? `Les quedan ${money(left)} · ${plural(daysLeft, 'día', 'días')}` : `Sobraron ${money(left)}`
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

/** Base mínima (en pesos) del mes pasado para que un porcentaje diga algo */
export const MIN_BASE_CLP = 20000
/** El mes pasado debe pesar al menos esto del gasto actual; si no, el % sale gigante y engaña */
export const MIN_BASE_RATIO = 0.2
/** Tope visible: sobre esto se dice «más del triple» en vez de un porcentaje */
export const MAX_VISIBLE_PCT = 300

export interface MonthComparison {
  kind: 'none' | 'igual' | 'pct' | 'pesos' | 'triple'
  /** Cifra corta para un recuadro: «+50 %», «+$434.000», «Más del triple» */
  figure: string
  /** Frase completa; la misma en Inicio y en Gastos */
  text: string
}

/**
 * Regla ÚNICA para comparar con el mes pasado (Inicio y Gastos, en Hogar, Yo y pareja).
 * `total` y `prev` deben ser del mismo alcance y del mismo tramo del mes («a esta fecha»).
 * - Sin gasto el mes pasado: «Sin datos».
 * - Base poco significativa (menos de MIN_BASE_CLP o menos de MIN_BASE_RATIO del actual): diferencia en pesos, sin %.
 * - Porcentaje sobre MAX_VISIBLE_PCT: «más del triple».
 */
export function compareMonths(total: number, prev: number, isCurrent: boolean): MonthComparison {
  if (prev <= 0) return { kind: 'none', figure: 'Sin datos', text: 'Sin datos del mes pasado' }
  const when = `que el mes pasado${isCurrent ? ' a esta fecha' : ''}`
  const diff = total - prev
  if (diff === 0) return { kind: 'igual', figure: 'Igual', text: 'Igual que el mes pasado' }
  const up = diff > 0
  const word = up ? 'más' : 'menos'
  const sign = up ? '+' : '−'
  if (prev < MIN_BASE_CLP || prev < total * MIN_BASE_RATIO) {
    return { kind: 'pesos', figure: `${sign}${money(Math.abs(diff))}`, text: `${money(Math.abs(diff))} ${word} ${when}` }
  }
  const pct = Math.round((Math.abs(diff) * 100) / prev)
  if (up && pct > MAX_VISIBLE_PCT) return { kind: 'triple', figure: 'Más del triple', text: `Más del triple ${when}` }
  return { kind: 'pct', figure: `${sign}${pct} %`, text: `${pct} % ${word} ${when}` }
}

export interface TopCategory {
  id: string
  name: string
  spent: number
  /** Ancho de la barra (0 a 100): cuánto del límite se usó o, sin límite, qué parte del total es */
  pct: number
  over: boolean
  /** Lo que queda del límite (negativo si se pasó); null si no tiene límite o no aplica */
  left: number | null
}

/** Las categorías donde más se gastó, para el Inicio: pocas, ordenadas y listas para tocar */
export function topCategories(
  byCategory: { id: string; name: string; spent: number; budget: number }[],
  total: number,
  /** Los límites son del hogar: viendo a una sola persona no se comparan */
  useBudget = true,
  max = 4,
): TopCategory[] {
  return byCategory
    .filter((c) => c.spent > 0)
    .sort((x, y) => y.spent - x.spent)
    .slice(0, max)
    .map((c) => {
      const limited = useBudget && c.budget > 0
      const pct = limited ? (c.spent * 100) / c.budget : total > 0 ? (c.spent * 100) / total : 0
      return { id: c.id, name: c.name, spent: c.spent, pct: Math.min(100, Math.round(pct)), over: limited && c.spent > c.budget, left: limited ? c.budget - c.spent : null }
    })
}

/** Lo que gastaron las categorías que no salen en `topCategories`, para mostrarlo como «Otras categorías» y que la suma cuadre */
export function otherCategories(byCategory: { id: string; spent: number }[], shown: { id: string }[]): { spent: number; count: number } | null {
  const ids = new Set(shown.map((s) => s.id))
  const rest = byCategory.filter((c) => c.spent > 0 && !ids.has(c.id))
  return rest.length > 0 ? { spent: rest.reduce((s, c) => s + c.spent, 0), count: rest.length } : null
}
