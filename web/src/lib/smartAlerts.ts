import type { Household } from '../App'
import { myShare } from './analysis'
import { buildPlan } from './advisor'
import { analyzeDebts } from './debtAnalysis'
import type { Alert } from './engine'
import { analyzeExpenses } from './expenseAnalysis'
import type { ExpRow } from './expenseAnalysis'
import type { HouseholdData } from './data'
import { analyzeSalary, monthIncome, myDebtShare } from './finance'
import { money } from './format'
import { savedInMonth } from './goals'
import { splitOf } from './split'
import { buildUpcoming } from './upcoming'
import { longDate } from './ui'

/** Avisos que cruzan varias fuentes (deudas, pagos que vienen, gastos): lo que un solo número no deja ver. */

const HEAVY_SHARE = 0.3
const BIG_FIXED_SHARE = 0.15

export interface SmartInput {
  hh: Household
  data: HouseholdData
  month: Date
  now: Date
  /** Gastos de los últimos meses con nota e id; sin ellos se omiten los avisos de repetidos y suscripciones */
  rows?: ExpRow[]
  /** Lo que has gastado este mes (tu costo real) */
  myCost: number
}

export function smartAlerts({ hh, data, month, now, rows, myCost }: SmartInput): Alert[] {
  const out: Alert[] = []
  const mk = `${month.getFullYear()}-${month.getMonth() + 1}`
  const isCurrent = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth()
  if (!isCurrent) return out
  const meId = hh.me.user_id
  const members = splitOf(hh.members)

  /* ---------- Cuotas atrasadas ---------- */
  const debts = analyzeDebts(data.debts, data.debtPayments, now)
  for (const d of debts.payments.due.filter((x) => x.late)) {
    out.push({
      id: `debt-late:${d.id}:${mk}`,
      level: 'bad',
      area: 'deudas',
      title: `**${d.name}** tiene la cuota atrasada`,
      detail: `Faltan ${money(d.pending)} y ya venció. Pagar tarde suele traer multas e intereses penales.`,
      tab: 'money',
      action: 'Anotar el pago',
      amount: d.pending,
      priority: 96,
    })
  }
  if (debts.plan && debts.costs.length > 1 && debts.plan.interestSaved >= 20_000) {
    out.push({
      id: `debt-strategy:${debts.plan.order[0]}`,
      level: 'info',
      area: 'deudas',
      title: `Pagando primero **${debts.plan.order[0]}** ahorran ${money(debts.plan.interestSaved)}`,
      detail: 'Cuando termine una deuda, pasen su cuota a la siguiente de mayor interés.',
      tab: 'money',
      action: 'Ver la estrategia',
      amount: debts.plan.interestSaved,
      priority: 32,
    })
  }

  /* ---------- Cómo llega el mes: pagos que vienen + gasto diario ---------- */
  const salary = data.salary
  const income = monthIncome(salary, data.incomes)
  if (data.financeReady && salary && income > 0) {
    const sal = analyzeSalary({ income, spent: myCost, commitments: myDebtShare(data.debts, data.debtPayments, meId, members), month, now, saved: savedInMonth(data.contributions, meId, `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`) })
    const fixedSoFar = (rows ?? [])
      .filter((r) => r.spent_on.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`) && r.recurring_id)
      .reduce((s, r) => s + myShare(r, meId, members), 0)
    const variableDaily = Math.max(0, myCost - fixedSoFar) / Math.max(now.getDate(), 1)
    const up = buildUpcoming({ now, meId, split: members, recurring: data.recurring, debts: data.debts, debtPayments: data.debtPayments, salary, free: sal.free, variableDaily })

    const end = up.endOfMonth
    if (end !== null && now.getDate() >= 5) {
      if (end < 0) {
        out.push({
          id: `cash-short:${mk}:${Math.floor(-end / 100_000)}`,
          level: 'bad',
          area: 'sueldo',
          title: `A fin de mes te faltarían ${money(-end)}`,
          detail: `Contando lo que aún vence este mes y tu gasto diario de ~${money(Math.round(variableDaily))}.`,
          tab: 'money',
          action: 'Ver cómo cuadrarlo',
          amount: -end,
          priority: 92 + Math.min(6, Math.round(((-end / income) * 100) / 5)),
        })
      } else if (end < income * 0.05) {
        out.push({
          id: `cash-tight:${mk}`,
          level: 'warn',
          area: 'sueldo',
          title: `A fin de mes te quedarían solo ${money(end)}`,
          detail: 'Es menos del 5 % de lo que ganas: cualquier imprevisto te dejaría corto.',
          tab: 'money',
          action: 'Ver el plan',
          amount: end,
          priority: 58,
        })
      } else if (now.getDate() >= 18 && end >= 100_000) {
        const plan = buildPlan({
          now,
          endOfMonth: end,
          variableDaily,
          income,
          cushion: null,
          debtInsights: debts,
          debts: data.debts,
          debtPayments: data.debtPayments,
          categories: [],
        })
        out.push({
          id: `surplus:${mk}`,
          level: 'info',
          area: 'sueldo',
          title: `Te sobrarían ~${money(end)} este mes`,
          detail: plan?.steps[0] ? `${plan.steps[0].title}. ${plan.steps[0].why}` : 'Aprovecha de aportar a tus metas antes de gastarlo.',
          tab: 'money',
          action: 'Ver el plan',
          amount: end,
          priority: 34,
        })
      }
    }

    const heavy = up.heaviest
    if (heavy && heavy.names.length >= 2 && heavy.total >= income * HEAVY_SHARE) {
      const days = Math.round((heavy.date.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000)
      if (days >= 0 && days <= 10) {
        out.push({
          id: `heavy:${heavy.date.toISOString().slice(0, 10)}`,
          level: 'warn',
          area: 'sueldo',
          title: `El ${longDate(heavy.date)} se juntan ${heavy.names.length} pagos por ${money(heavy.total)}`,
          detail: 'Es harto de una vez: deja esa plata aparte antes de esa fecha.',
          tab: 'money',
          action: 'Ver pagos que vienen',
          amount: heavy.total,
          priority: 60 - days,
        })
      }
    }
    for (const e of up.events.filter((x) => x.kind === 'fijo' && x.inDays <= 3 && x.amount >= income * BIG_FIXED_SHARE)) {
      out.push({
        id: `fixed-soon:${e.key}:${e.date.toISOString().slice(0, 10)}`,
        level: 'info',
        area: 'gastos',
        title: `${e.inDays === 0 ? 'Hoy' : e.inDays === 1 ? 'Mañana' : `En ${e.inDays} días`} se anota **${e.name}** por ${money(e.amount)}`,
        detail: 'Es un gasto fijo grande: revisa que haya plata para cubrirlo.',
        tab: 'money',
        action: 'Ver gastos fijos',
        amount: e.amount,
        priority: 45 - e.inDays,
      })
    }
  }

  /* ---------- Gastos repetidos, inusuales y suscripciones ---------- */
  if (rows && rows.length > 0) {
    const r = analyzeExpenses({ history: rows, month, now, categories: data.categories, recurring: data.recurring, who: 'all' })
    for (const d of r.duplicates.slice(0, 2)) {
      out.push({
        id: `dup:${d.dates.join(',')}:${d.amount}`,
        level: 'warn',
        area: 'gastos',
        title: `Posible gasto repetido: **${d.label}**`,
        detail: `${d.dates.length} gastos de ${money(d.amount)} en ${d.category} en días seguidos. Si fue un error, bórralo.`,
        tab: 'expenses',
        action: 'Revisar el gasto',
        amount: d.amount,
        priority: 56,
      })
    }
    for (const u of r.unusual.slice(0, 1)) {
      out.push({
        id: `unusual:${u.id}`,
        level: 'info',
        area: 'gastos',
        title: `**${u.label}** es mucho más de lo normal en ${u.category}`,
        detail: `${money(u.amount)} cuando lo típico es ${money(u.typical)}. Revisa que el monto esté bien anotado.`,
        tab: 'expenses',
        action: 'Revisar el gasto',
        amount: u.amount,
        priority: 38,
      })
    }
    for (const s of r.subscriptions.slice(0, 1)) {
      out.push({
        id: `sub:${s.label.toLowerCase()}`,
        level: 'info',
        area: 'gastos',
        title: `**${s.label}** parece un gasto fijo`,
        detail: `Lo pagan casi igual (~${money(s.amount)}) hace ${s.months} meses. Márcalo como fijo para que se anote solo.`,
        tab: 'money',
        action: 'Marcarlo como fijo',
        amount: s.amount,
        priority: 28,
      })
    }
  }
  return out
}
