import { useEffect, useMemo, useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from './data'
import { buildAnalysis } from './analysis'
import type { HistExpense } from './analysis'
import { buildNumbers } from './numbers'
import { buildUpcoming } from './upcoming'
import { splitOf } from './split'
import { buildPlan } from './advisor'
import { analyzeDebts } from './debtAnalysis'
import { fetchHistory } from './history'

/** El análisis personal del mes elegido (con su historial), calculado a partir de los datos del hogar. */
export function useAnalysisBuild(hh: Household, data: HouseholdData, month: Date) {
  const [hist, setHist] = useState<HistExpense[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const monthId = `${month.getFullYear()}-${month.getMonth()}`
  const householdId = hh.household.id

  // Se vuelve a calcular al cambiar de mes o cuando llega un gasto nuevo
  useEffect(() => {
    let off = false
    fetchHistory(householdId, new Date(month.getFullYear(), month.getMonth(), 1))
      .then((rows) => {
        if (off) return
        setFailed(false)
        setHist(rows)
      })
      .catch(() => {
        if (!off) setFailed(true)
      })
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, monthId, data.expenses, attempt])

  const split = useMemo(() => splitOf(hh.members), [hh.members])
  const built = useMemo(() => {
    if (hist === null) return null
    const input = {
      meId: hh.me.user_id,
      memberCount: split,
      goals: data.goals,
      month,
      history: hist,
      categories: data.categories,
      salary: data.salary,
      incomes: data.incomes,
      debts: data.debts,
      debtPayments: data.debtPayments,
      contributions: data.contributions,
      recurring: data.recurring,
    }
    const analysis = buildAnalysis(input)
    const numbers = buildNumbers(input, analysis)
    // Los pagos que vienen solo tienen sentido para el mes en curso
    const now = new Date()
    const current = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth()
    const upcoming = current
      ? buildUpcoming({
          now,
          meId: hh.me.user_id,
          split,
          recurring: data.recurring,
          debts: data.debts,
          debtPayments: data.debtPayments,
          salary: data.salary,
          free: numbers.flow?.free ?? null,
          variableDaily: (numbers.fixedVar?.variable ?? analysis.cost) / Math.max(now.getDate(), 1),
        })
      : null
    const plan =
      upcoming && analysis.income > 0
        ? buildPlan({
            now,
            endOfMonth: upcoming.endOfMonth,
            variableDaily: upcoming.variableDaily,
            income: analysis.income,
            cushion: numbers.cushion,
            debtInsights: analyzeDebts(data.debts, data.debtPayments, now),
            debts: data.debts,
            debtPayments: data.debtPayments,
            categories: analysis.slices.filter((x) => x.id !== 'otras').map((x) => ({ name: x.name, amount: x.amount })),
          })
        : null
    return { a: analysis, n: numbers, u: upcoming, plan }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist, hh.me.user_id, split, monthId, data.goals, data.categories, data.salary, data.incomes, data.debts, data.debtPayments, data.contributions, data.recurring])
  return { built, failed, retry: () => setAttempt((n) => n + 1) }
}
