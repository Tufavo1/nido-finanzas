import type { Debt, DebtPayment } from './data'
import type { Cushion } from './numbers'
import type { DebtInsights } from './debtAnalysis'
import { extraEffect } from './debtAnalysis'
import { money } from './format'
import { isNeed } from './analysis'
import type { AlertTab } from './engine'

/** Asesor: convierte los números en pasos concretos. Con plata de sobra, cómo repartirla; si falta, cómo cuadrar el mes. */

export interface PlanStep {
  key: 'imprevistos' | 'deuda' | 'metas' | 'libre' | 'ritmo' | 'recorte' | 'tasa'
  title: string
  /** Monto asociado al paso (0 si es solo una acción) */
  amount: number
  why: string
  tab?: AlertTab
}

export interface Plan {
  kind: 'surplus' | 'deficit'
  /** Lo que sobra (surplus) o lo que falta (deficit) a fin de mes */
  amount: number
  headline: string
  steps: PlanStep[]
}

export interface PlanInput {
  now?: Date
  /** Lo que quedaría a fin de mes; null sin sueldo */
  endOfMonth: number | null
  variableDaily: number
  income: number
  cushion: Cushion | null
  debtInsights: DebtInsights
  debts: Debt[]
  debtPayments: DebtPayment[]
  /** Gastado en el mes por categoría (tuyo) */
  categories: { name: string; amount: number }[]
}

const MIN_STEP = 5_000
const HIGH_RATE = 1.5
const round = (n: number, to = 1_000) => Math.round(n / to) * to
const meses = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`

export function buildPlan(input: PlanInput): Plan | null {
  const now = input.now ?? new Date()
  const left = input.endOfMonth
  if (left === null || input.income <= 0) return null
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()

  // ---------- Falta plata: cómo cuadrar el mes ----------
  if (left < 0) {
    const gap = -left
    const steps: PlanStep[] = []
    if (daysLeft > 0 && input.variableDaily > 0) {
      const target = Math.max(0, Math.floor(input.variableDaily - gap / daysLeft))
      steps.push({
        key: 'ritmo',
        title: target > 0 ? `Baja tu gasto diario de ${money(Math.round(input.variableDaily))} a ${money(target)}` : 'Frena el gasto variable lo que queda del mes',
        amount: Math.round(gap),
        why: target > 0 ? `Durante los ${daysLeft} días que quedan, eso cubre los ${money(Math.round(gap))} que faltan.` : `Aun sin gastar nada más, faltarían ${money(Math.round(gap))}: toca ver ingresos extra o postergar pagos.`,
        tab: 'home',
      })
    }
    // Recortes: las categorías de gustos donde más se ha gastado, un 30 % de lo que sigue a ese ritmo
    const wants = input.categories.filter((c) => !isNeed(c.name) && c.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 2)
    const elapsed = Math.max(now.getDate(), 1)
    for (const c of wants) {
      const rest = (c.amount / elapsed) * daysLeft
      const cut = round(rest * 0.3)
      if (cut >= MIN_STEP) steps.push({ key: 'recorte', title: `Recorta ${money(cut)} en ${c.name}`, amount: cut, why: `Llevas ${money(c.amount)} este mes; bajar un 30 % lo que resta lo libera.`, tab: 'expenses' })
    }
    const worst = input.debtInsights.costs[0]
    if (worst && worst.rate >= HIGH_RATE) {
      steps.push({ key: 'tasa', title: `Pregunta por una tasa menor en ${worst.name}`, amount: worst.monthlyInterest, why: `Hoy se te van ~${money(worst.monthlyInterest)} al mes solo en interés. Refinanciar o consolidar baja la cuota.`, tab: 'money' })
    }
    return { kind: 'deficit', amount: Math.round(gap), headline: `A este ritmo te faltarían ${money(Math.round(gap))}. Así puedes cuadrar el mes:`, steps }
  }

  // ---------- Sobra plata: cómo repartirla ----------
  const spare = round(left * 0.9, 1_000) // el 10 % queda de resguardo para el mes
  if (spare < 2 * MIN_STEP) return null
  const steps: PlanStep[] = []
  const costly = input.debtInsights.costs.find((c) => c.rate >= HIGH_RATE && c.totalInterest !== null)
  const cushion = input.cushion
  const needCushion = cushion !== null && cushion.covered < 3
  const w = costly ? { debt: 0.5, cushion: needCushion ? 0.3 : 0, goals: needCushion ? 0.2 : 0.5 } : needCushion ? { debt: 0, cushion: 0.7, goals: 0.3 } : { debt: 0, cushion: 0, goals: 0.6 }

  if (w.debt > 0 && costly) {
    const amt = round(spare * w.debt)
    const eff = amt >= MIN_STEP ? extraEffect(input.debts, input.debtPayments, amt, now) : null
    if (amt >= MIN_STEP) {
      steps.push({
        key: 'deuda',
        title: `Abona ${money(amt)} extra a ${eff?.target ?? costly.name}`,
        amount: amt,
        why: eff && eff.interestSaved > 0 ? `Si lo repites cada mes terminas ${meses(eff.monthsSaved)} antes y ahorras ${money(eff.interestSaved)} de interés. Es la que más cobra (${costly.rate.toString().replace('.', ',')} % al mes).` : `Es la deuda que más interés cobra (${costly.rate.toString().replace('.', ',')} % al mes): cada peso rinde más ahí.`,
        tab: 'money',
      })
    }
  }
  if (w.cushion > 0 && cushion) {
    const missing = Math.max(0, cushion.target3 - cushion.saved)
    const amt = Math.min(round(spare * w.cushion), round(missing))
    if (amt >= MIN_STEP) {
      steps.push({ key: 'imprevistos', title: `Aparta ${money(amt)} para imprevistos`, amount: amt, why: `Hoy cubres ${cushion.covered.toFixed(1).replace('.', ',')} meses de gastos; la primera meta son 3 (${money(cushion.target3)}).`, tab: 'goals' })
    }
  }
  const used = steps.reduce((s, x) => s + x.amount, 0)
  const goalsAmt = Math.min(round(spare * w.goals), Math.max(0, spare - used))
  if (goalsAmt >= MIN_STEP) steps.push({ key: 'metas', title: `Aporta ${money(goalsAmt)} a tus metas`, amount: goalsAmt, why: 'Un aporte seguido rinde más que uno grande de vez en cuando.', tab: 'goals' })
  const free = spare - steps.reduce((s, x) => s + x.amount, 0)
  if (free >= MIN_STEP) steps.push({ key: 'libre', title: `Te quedan ${money(round(free))} para disfrutar`, amount: round(free), why: 'Ya cubriste lo importante: esto es plata sin culpa.' })
  if (steps.length === 0) return null
  return { kind: 'surplus', amount: Math.round(left), headline: `Te sobrarían ~${money(Math.round(left))} a fin de mes. Una forma de repartirlos:`, steps }
}
