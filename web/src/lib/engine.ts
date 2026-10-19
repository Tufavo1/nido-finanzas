import type { Household } from '../App'
import type { HouseholdData } from './data'
import { analyzeSalary, myDebtShare, summarizeDebts } from './finance'
import { money, toISO } from './format'
import { computeMetrics } from './metrics'
import { adviceFor } from './profile'

export type AlertLevel = 'bad' | 'warn' | 'info' | 'ok'
export type AlertTab = 'home' | 'expenses' | 'money' | 'goals' | 'security'

export interface Alert {
  /** Estable entre recálculos: sirve para no repetir una notificación */
  id: string
  level: AlertLevel
  area: 'gastos' | 'deudas' | 'sueldo' | 'metas' | 'hogar' | 'perfil'
  title: string
  detail: string
  tab?: AlertTab
}

const RANK: Record<AlertLevel, number> = { bad: 0, warn: 1, info: 2, ok: 3 }
const EMERGENCY = /emergencia|colch[oó]n|imprevisto/i

const dayOf = (iso: string) => Number(iso.slice(8, 10))
const median = (xs: number[]) => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/**
 * Motor de reglas: recalcula todos los avisos a partir de los datos actuales.
 * Es determinista y corre en el teléfono; no usa IA ni servicios externos.
 */
export function buildAlerts(hh: Household, data: HouseholdData, month: Date, now: Date = new Date()): Alert[] {
  const out: Alert[] = []
  const add = (a: Alert) => out.push(a)
  const mk = `${month.getFullYear()}-${month.getMonth() + 1}`
  const isCurrent = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth()
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const today = now.getDate()

  const m = computeMetrics(data.expenses, data.prevExpenses, data.categories, hh.members, month, now)

  /* ---------- Presupuesto por categoría ---------- */
  for (const c of m.byCategory) {
    if (c.budget <= 0) continue
    const ratio = c.spent / c.budget
    if (ratio >= 1) {
      add({
        id: `bud-over:${c.id}:${mk}`,
        level: 'bad',
        area: 'gastos',
        title: `«${c.name}» se pasó del presupuesto`,
        detail: `Llevan ${money(c.spent)} de ${money(c.budget)} (${money(c.spent - c.budget)} de más).`,
        tab: 'expenses',
      })
    } else if (ratio >= 0.8 && (!isCurrent || m.monthProgress < 0.9)) {
      add({
        id: `bud-80:${c.id}:${mk}`,
        level: 'warn',
        area: 'gastos',
        title: `«${c.name}» va en ${Math.round(ratio * 100)} % del presupuesto`,
        detail: `Quedan ${money(c.budget - c.spent)}${isCurrent ? ` para ${daysInMonth - today} días` : ''}.`,
        tab: 'expenses',
      })
    } else if (isCurrent && today >= 7 && c.spent > 0) {
      const projected = Math.round((c.spent / today) * daysInMonth)
      if (projected > c.budget * 1.1) {
        add({
          id: `bud-proj:${c.id}:${mk}`,
          level: 'warn',
          area: 'gastos',
          title: `«${c.name}» terminaría pasada de presupuesto`,
          detail: `A este ritmo cerraría en ~${money(projected)} y el presupuesto es ${money(c.budget)}.`,
          tab: 'expenses',
        })
      }
    }
  }

  const active = data.categories.length > 0
  if (active && m.budgetTotal === 0) {
    add({
      id: `no-budget`,
      level: 'info',
      area: 'gastos',
      title: 'Aún no hay presupuestos',
      detail: 'Pon un monto mensual a cada categoría y la app te avisará antes de que se pasen.',
      tab: 'expenses',
    })
  } else if (m.budgetTotal > 0 && m.pace === 'pasado') {
    add({
      id: `pace-over:${mk}`,
      level: 'bad',
      area: 'gastos',
      title: 'Superaron el presupuesto total del mes',
      detail: `Gastaron ${money(m.total)} y el total presupuestado era ${money(m.budgetTotal)}.`,
      tab: 'home',
    })
  } else if (isCurrent && m.pace === 'atento' && today >= 5) {
    add({
      id: `pace-warn:${mk}`,
      level: 'warn',
      area: 'gastos',
      title: 'Van más rápido que el mes',
      detail: `Llevan ${Math.round((m.total * 100) / m.budgetTotal)} % del presupuesto y el mes va en ${Math.round(m.monthProgress * 100)} %.`,
      tab: 'home',
    })
  }

  /* ---------- Gastos fuera de lo normal ---------- */
  if (isCurrent && data.expenses.length >= 6 && m.avgPerDay > 0) {
    const recentLimit = toISO(new Date(now.getFullYear(), now.getMonth(), Math.max(1, today - 6)))
    let peak: { day: number; amount: number } | null = null
    for (const [day, amount] of m.daily) {
      const iso = toISO(new Date(month.getFullYear(), month.getMonth(), day))
      if (iso >= recentLimit && amount >= m.avgPerDay * 3 && amount >= 20000 && (!peak || amount > peak.amount)) {
        peak = { day, amount }
      }
    }
    if (peak) {
      add({
        id: `day-peak:${mk}:${peak.day}`,
        level: 'info',
        area: 'gastos',
        title: `El ${peak.day} gastaron mucho más de lo normal`,
        detail: `${money(peak.amount)} en un día, unas ${Math.round(peak.amount / m.avgPerDay)} veces su promedio diario.`,
        tab: 'home',
      })
    }
    const med = median(data.expenses.map((e) => e.amount))
    const big = m.biggest
    if (big && big.amount >= med * 4 && big.amount >= m.total * 0.2 && big.amount >= 30000) {
      add({
        id: `big:${big.id}`,
        level: 'info',
        area: 'gastos',
        title: 'Un gasto pesa mucho en el mes',
        detail: `${money(big.amount)}${big.note ? ` (${big.note})` : ''} es el ${Math.round((big.amount * 100) / m.total)} % de todo lo gastado.`,
        tab: 'expenses',
      })
    }
  }

  /* ---------- Categorías que se dispararon frente al mes pasado ---------- */
  if (isCurrent && today >= 7 && data.prevExpenses.length > 0) {
    const prevByCat = new Map<string, number>()
    for (const e of data.prevExpenses) {
      if (dayOf(e.spent_on) <= today) prevByCat.set(e.category_id, (prevByCat.get(e.category_id) ?? 0) + e.amount)
    }
    const jumps = m.byCategory
      .map((c) => ({ c, prev: prevByCat.get(c.id) ?? 0 }))
      .filter(({ c, prev }) => prev > 0 && c.spent > prev * 1.5 && c.spent - prev >= Math.max(15000, m.total * 0.05))
      .sort((a, b) => b.c.spent - b.prev - (a.c.spent - a.prev))
    const top = jumps[0]
    if (top) {
      add({
        id: `jump:${top.c.id}:${mk}`,
        level: 'warn',
        area: 'gastos',
        title: `«${top.c.name}» subió harto frente al mes pasado`,
        detail: `${money(top.c.spent)} vs ${money(top.prev)} a esta misma fecha.`,
        tab: 'home',
      })
    }
  }

  /* ---------- Olvido de registrar ---------- */
  if (isCurrent && today >= 4) {
    const last = data.expenses[0]?.spent_on
    const gap = last ? today - dayOf(last) : today
    if (gap >= 4) {
      add({
        id: `idle:${mk}:${Math.floor(gap / 4)}`,
        level: 'info',
        area: 'gastos',
        title: `Hace ${gap} días que no registran gastos`,
        detail: 'Si gastaron algo, anótenlo ahora mientras se acuerdan.',
        tab: 'home',
      })
    }
  }

  /* ---------- Cuentas entre los dos ---------- */
  if (m.settle && m.settle.amount >= 20000) {
    add({
      id: `settle:${mk}:${Math.floor(m.settle.amount / 50000)}`,
      level: m.settle.amount >= 100000 ? 'warn' : 'info',
      area: 'hogar',
      title: `${m.settle.from.name} le debe ${money(m.settle.amount)} a ${m.settle.to.name}`,
      detail: 'Salden cuentas y quedan a mano.',
      tab: 'home',
    })
  }

  /* ---------- Deudas ---------- */
  const debts = summarizeDebts(data.debts, data.debtPayments, now)
  if (isCurrent) {
    for (const f of debts.findings) {
      if (f.level === 'ok') continue
      add({
        id: `debt:${f.title}:${mk}`,
        level: f.level === 'bad' ? 'bad' : 'warn',
        area: 'deudas',
        title: f.title,
        detail: f.detail,
        tab: 'money',
      })
    }
  }

  /* ---------- Sueldo (solo el mío) ---------- */
  if (data.financeReady) {
    if (!data.salary) {
      add({
        id: 'salary-missing',
        level: 'info',
        area: 'sueldo',
        title: 'Pon tu sueldo para ver cómo vas',
        detail: 'Es privado: tu pareja no lo ve. Con él calculo cuánto te queda y si te alcanza.',
        tab: 'money',
      })
    } else {
      const me = m.people.find((p) => p.userId === hh.me.user_id)
      const a = analyzeSalary({
        income: data.salary.amount,
        spent: me?.trueCost ?? 0,
        commitments: myDebtShare(data.debts, data.debtPayments, hh.me.user_id, hh.members.length),
        month,
        now,
      })
      for (const f of a.findings) {
        if (f.level === 'ok') continue
        add({
          id: `salary:${f.title}:${mk}`,
          level: f.level === 'bad' ? 'bad' : 'warn',
          area: 'sueldo',
          title: f.title,
          detail: f.detail,
          tab: 'money',
        })
      }
      if (isCurrent && a.safeDaily !== null && data.salary.pay_day) {
        const days = ((data.salary.pay_day - today + daysInMonth) % daysInMonth)
        if (days <= 3 && a.free < 0) {
          add({
            id: `payday:${mk}`,
            level: 'info',
            area: 'sueldo',
            title: days === 0 ? 'Hoy te pagan' : `Te pagan en ${days} ${days === 1 ? 'día' : 'días'}`,
            detail: 'Cuando entre, paga primero las cuotas y aparta el ahorro.',
            tab: 'money',
          })
        }
      }
    }
  }

  /* ---------- Metas ---------- */
  for (const g of data.goals) {
    const mine = data.contributions.filter((c) => c.goal_id === g.id)
    const saved = mine.reduce((s, c) => s + c.amount, 0)
    const remaining = g.target_amount - saved
    if (remaining <= 0) {
      add({
        id: `goal-done:${g.id}`,
        level: 'ok',
        area: 'metas',
        title: `¡Lograron «${g.name}»!`,
        detail: 'Ya juntaron todo. Pueden archivarla o crear una nueva.',
        tab: 'goals',
      })
      continue
    }
    const monthAgo = toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30))
    const recent = mine.filter((c) => c.contributed_on >= monthAgo).reduce((s, c) => s + c.amount, 0)
    if (g.target_date) {
      const msLeft = Date.parse(g.target_date) - now.getTime()
      const monthsLeft = Math.max(1, Math.ceil(msLeft / (30 * 86400000)))
      if (msLeft < -86400000) {
        add({
          id: `goal-late:${g.id}`,
          level: 'bad',
          area: 'metas',
          title: `«${g.name}» ya pasó su fecha`,
          detail: `Faltan ${money(remaining)}. Cambien la fecha o suban los aportes.`,
          tab: 'goals',
        })
      } else {
        const need = Math.ceil(remaining / monthsLeft)
        if (recent < need * 0.6) {
          add({
            id: `goal-pace:${g.id}:${mk}`,
            level: 'warn',
            area: 'metas',
            title: `«${g.name}» va atrasada`,
            detail: `Para llegar a tiempo necesitan ~${money(need)} al mes y el último mes aportaron ${money(recent)}.`,
            tab: 'goals',
          })
        }
      }
    } else if (mine.length > 0 && recent === 0 && isCurrent) {
      add({
        id: `goal-idle:${g.id}:${mk}`,
        level: 'info',
        area: 'metas',
        title: `«${g.name}» lleva un mes sin aportes`,
        detail: 'Un aporte chico seguido rinde más que uno grande de vez en cuando.',
        tab: 'goals',
      })
    }
  }

  /* ---------- Perfil: fondo de emergencia a medida ---------- */
  if (data.profileReady) {
    const mine = data.profiles.find((p) => p.user_id === hh.me.user_id)
    if (!mine || !mine.profession.trim()) {
      add({
        id: 'profile-missing',
        level: 'info',
        area: 'perfil',
        title: 'Completa tu perfil',
        detail: 'Con tu profesión y tipo de trabajo ajusto el fondo de emergencia y los consejos para ti.',
        tab: 'security',
      })
    }
    const advice = adviceFor(mine)
    const prevFull = data.prevExpenses.reduce((s, e) => s + e.amount, 0)
    const baseline = isCurrent ? prevFull || m.projection || m.total : m.total
    if (baseline > 0) {
      const target = baseline * advice.emergencyMonths
      const fundGoals = data.goals.filter((g) => EMERGENCY.test(g.name))
      if (fundGoals.length === 0) {
        add({
          id: 'fund-missing',
          level: 'warn',
          area: 'perfil',
          title: 'Les falta un fondo de emergencia',
          detail: `Por tu perfil conviene tener ${advice.emergencyMonths} meses de gastos: unos ${money(target)}. Créenlo como meta.`,
          tab: 'goals',
        })
      } else {
        const ids = new Set(fundGoals.map((g) => g.id))
        const saved = data.contributions.filter((c) => ids.has(c.goal_id)).reduce((s, c) => s + c.amount, 0)
        if (saved < target * 0.5) {
          add({
            id: `fund-low:${Math.floor((saved * 4) / target)}`,
            level: 'info',
            area: 'perfil',
            title: 'Fondo de emergencia a medio camino',
            detail: `Llevan ${money(saved)} de ${money(target)} (${advice.emergencyMonths} meses de gasto).`,
            tab: 'goals',
          })
        }
      }
    }
  }

  return out.sort((a, b) => RANK[a.level] - RANK[b.level])
}
