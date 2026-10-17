import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Ring from '../components/Ring'
import { daysLeftInMonth, money } from '../lib/format'
import { memberColor, monthName, shortDate } from '../lib/ui'

export default function Home({ hh, data }: { hh: Household; data: HouseholdData }) {
  const { expenses, categories, goals, contributions } = data
  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const budget = categories.reduce((s, c) => s + c.monthly_budget, 0)
  const left = budget - total
  const denom = Math.max(budget, total, 1)

  const byPayer = new Map<string, number>()
  for (const e of expenses) byPayer.set(e.paid_by, (byPayer.get(e.paid_by) ?? 0) + e.amount)

  const members = new Map(hh.members.map((m) => [m.user_id, m] as const))
  const catName = new Map(categories.map((c) => [c.id, c.name] as const))

  const goal = goals[0]
  const saved = goal
    ? contributions.filter((c) => c.goal_id === goal.id).reduce((s, c) => s + c.amount, 0)
    : 0
  const pct = goal ? Math.min(100, Math.round((saved * 100) / goal.target_amount)) : 0

  let status = 'Define presupuestos en la pestaña Gastos.'
  if (budget > 0) {
    status =
      left >= 0
        ? `Quedan ${money(left)} · ${daysLeftInMonth()} días`
        : `Te pasaste por ${money(-left)}`
  }

  return (
    <main className="screen">
      <div>
        <span className="eyebrow" style={{ textTransform: 'capitalize' }}>
          {monthName()}
        </span>
        <h1 className="title">Hola, {hh.me.display_name}</h1>
      </div>

      <section className="card">
        <span className="muted">Gastado este mes</span>
        <span className="amount num">{money(total)}</span>
        <div className="bar big" aria-hidden="true">
          {hh.members.map((m) => (
            <span
              key={m.user_id}
              style={{ width: `${((byPayer.get(m.user_id) ?? 0) * 100) / denom}%`, background: memberColor(m) }}
            />
          ))}
        </div>
        <div className="row between">
          {hh.members.map((m) => (
            <span key={m.user_id} className="row" style={{ gap: 8 }}>
              <span className="dot" style={{ background: memberColor(m) }} />
              <span className="num">
                {m.display_name} {money(byPayer.get(m.user_id) ?? 0)}
              </span>
            </span>
          ))}
        </div>
        <span className={left < 0 && budget > 0 ? 'over' : 'muted'}>{status}</span>
      </section>

      {goal && (
        <section className="card">
          <div className="row">
            <Ring pct={pct} />
            <div className="grow">
              <strong>{goal.name}</strong>
              <div className="muted num">
                {money(saved)} de {money(goal.target_amount)}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <strong>Últimos movimientos</strong>
        {expenses.length === 0 && <span className="muted">Aún no hay gastos este mes.</span>}
        <div>
          {expenses.slice(0, 5).map((e) => (
            <div className="item" key={e.id}>
              <span className="dot" style={{ background: memberColor(members.get(e.paid_by)) }} />
              <div className="grow">
                <div className="ellipsis">{e.note || catName.get(e.category_id) || 'Gasto'}</div>
                <div className="muted small-text">
                  {catName.get(e.category_id)} · {shortDate(e.spent_on)}
                </div>
              </div>
              <span className="num">{money(e.amount)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
