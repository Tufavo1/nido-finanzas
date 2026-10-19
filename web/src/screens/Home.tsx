import { useEffect, useMemo, useState } from 'react'
import type { Household } from '../App'
import type { Expense, HouseholdData } from '../lib/data'
import AlertsCard from '../components/AlertsCard'
import Avatar, { AvatarPair } from '../components/Avatar'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import Ring from '../components/Ring'
import Venn from '../components/Venn'
import { compact, monthGrid } from '../lib/calendar'
import { daysLeftInMonth, money } from '../lib/format'
import { analyzeSalary, myDebtShare } from '../lib/finance'
import { computeMetrics } from '../lib/metrics'
import type { Alert, AlertTab } from '../lib/engine'
import { memberColor, monthName, shortDate } from '../lib/ui'

interface Props {
  hh: Household
  data: HouseholdData
  month: Date
  isCurrent: boolean
  onMonth: (delta: number) => void
  alerts: Alert[]
  onGo: (tab: AlertTab) => void
}

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="row between">
      <span className={strong ? 'strong' : 'muted'}>{label}</span>
      <span className={strong ? 'num strong' : 'num'}>{value}</span>
    </div>
  )
}

export default function Home({ hh, data, month, isCurrent, onMonth, alerts, onGo }: Props) {
  const [requestedView, setView] = useState<string>('all')
  const [day, setDay] = useState<number | null>(null)

  const members = hh.members
  const partner = members.find((m) => m.user_id !== hh.me.user_id)
  const byId = useMemo(() => new Map(hh.everyone.map((m) => [m.user_id, m] as const)), [hh.everyone])
  const catName = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name] as const)), [data.categories])

  // Si la persona elegida ya no está en el hogar, volver a la vista del hogar
  const view = requestedView === 'all' || byId.has(requestedView) ? requestedView : 'all'

  // Al cambiar de mes el día elegido deja de tener sentido
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`
  useEffect(() => {
    setDay(null)
  }, [monthKey])

  const all = useMemo(
    () => computeMetrics(data.expenses, data.prevExpenses, data.categories, members, month),
    [data.expenses, data.prevExpenses, data.categories, members, month],
  )
  const viewExpenses = useMemo<Expense[]>(
    () => (view === 'all' ? data.expenses : data.expenses.filter((e) => e.paid_by === view)),
    [data.expenses, view],
  )
  const sub = useMemo(() => {
    if (view === 'all') return all
    const prev = data.prevExpenses.filter((e) => e.paid_by === view)
    return computeMetrics(viewExpenses, prev, data.categories, members, month)
  }, [view, all, viewExpenses, data.prevExpenses, data.categories, members, month])
  const person = view === 'all' ? null : (all.people.find((p) => p.userId === view) ?? null)

  // Sueldo: dato privado, solo se calcula para mí y nunca para la pareja
  const mine = all.people.find((p) => p.userId === hh.me.user_id)
  const salaryCheck =
    data.salary && mine && (view === 'all' || view === hh.me.user_id)
      ? analyzeSalary({
          income: data.salary.amount,
          spent: mine.trueCost,
          commitments: myDebtShare(data.debts, data.debtPayments, hh.me.user_id, members.length),
          month,
        })
      : null

  const pair = members.map((m) => {
    const p = all.people.find((x) => x.userId === m.user_id)
    return { name: m.display_name, color: m.color, paid: p?.paid ?? 0 }
  })
  const two = pair.length === 2 ? ([pair[0]!, pair[1]!] as [(typeof pair)[number], (typeof pair)[number]]) : null

  const budget = data.categories.reduce((s, c) => s + c.monthly_budget, 0)
  const left = budget - all.total
  const denom = Math.max(budget, all.total, 1)

  const d = sub.deltaPct
  const deltaText =
    d === null
      ? null
      : d === 0
        ? 'Igual que el mes pasado'
        : `${Math.abs(d)} % ${d > 0 ? 'más' : 'menos'} que el mes pasado${isCurrent ? ' a esta fecha' : ''}`

  let status = 'Define presupuestos en la pestaña Gastos.'
  if (budget > 0) {
    if (left >= 0) status = isCurrent ? `Quedan ${money(left)} · ${daysLeftInMonth()} días` : `Sobraron ${money(left)}`
    else status = `Se pasaron por ${money(-left)}`
  }

  let settleText = 'Aún no hay gastos compartidos'
  if (all.shared > 0) {
    settleText = all.settle
      ? `${all.settle.from.name} le debe ${money(all.settle.amount)} a ${all.settle.to.name}`
      : 'Están a mano'
  }

  const goal = data.goals[0]
  const saved = goal ? data.contributions.filter((c) => c.goal_id === goal.id).reduce((s, c) => s + c.amount, 0) : 0
  const goalPct = goal && goal.target_amount > 0 ? Math.min(100, Math.round((saved * 100) / goal.target_amount)) : 0

  const cells = useMemo(() => monthGrid(month.getFullYear(), month.getMonth()), [month])
  const maxDay = Math.max(1, ...sub.daily.values())
  const today = isCurrent ? new Date().getDate() : -1

  const cats = sub.byCategory.filter((c) => c.spent > 0 || (view === 'all' && c.budget > 0)).slice(0, 6)
  const shown =
    day === null ? viewExpenses.slice(0, 5) : viewExpenses.filter((e) => Number(e.spent_on.slice(8, 10)) === day)

  function change(delta: number) {
    setDay(null)
    onMonth(delta)
  }

  return (
    <main className={data.loading ? 'screen dim' : 'screen'} aria-busy={data.loading}>
      <div className="home-head">
        <div>
          <span className="eyebrow">{partner ? `Tú y ${partner.display_name}` : 'Tu hogar'}</span>
          <h1 className="title">Hola, {hh.me.display_name}</h1>
        </div>
        {members.length === 2 ? <AvatarPair people={members} /> : <Logo size={30} />}
      </div>

      <div className="row between">
        <button type="button" className="icon-btn" aria-label="Mes anterior" onClick={() => change(-1)}>
          <Icon name="chevL" />
        </button>
        <span className="month-title" aria-live="polite">
          {monthName(month)} {month.getFullYear()}
        </span>
        <button type="button" className="icon-btn" aria-label="Mes siguiente" disabled={isCurrent} onClick={() => change(1)}>
          <Icon name="chevR" />
        </button>
      </div>

      <div className="seg" role="group" aria-label="Ver gastos de">
        <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>
          Hogar
        </button>
        {[hh.me, ...(partner ? [partner] : [])].map((m) => (
          <button key={m.user_id} type="button" aria-pressed={view === m.user_id} onClick={() => setView(m.user_id)}>
            {m.user_id === hh.me.user_id ? 'Yo' : m.display_name}
          </button>
        ))}
      </div>

      <section className="card hero">
        <div className="hero-top">
          <div className="grow">
            <span className="muted">{view === 'all' ? 'Gastado en el mes' : `Pagó ${byId.get(view)?.display_name ?? ''}`}</span>
            <span className="amount num">{money(sub.total)}</span>
            {view === 'all' && <span className={budget > 0 && left < 0 ? 'over' : 'muted'}>{status}</span>}
          </div>
          {view === 'all' && budget > 0 && members.length < 2 && <Ring pct={Math.min(100, Math.round((all.total * 100) / budget))} />}
        </div>
        {view === 'all' && two && <Venn people={two} />}
        {view === 'all' && !two && (
          <div className="bar big" aria-hidden="true">
            {members.map((m) => (
              <span
                key={m.user_id}
                style={{
                  width: `${((all.people.find((p) => p.userId === m.user_id)?.paid ?? 0) * 100) / denom}%`,
                  background: memberColor(m),
                }}
              />
            ))}
          </div>
        )}
        <div className="stats">
          <div>
            <span className="muted small-text">Compartido</span>
            <span className="num strong">{money(sub.shared)}</span>
          </div>
          <div>
            <span className="muted small-text">Personal</span>
            <span className="num strong">{money(sub.personal)}</span>
          </div>
          <div>
            <span className="muted small-text">Promedio por día</span>
            <span className="num strong">{money(sub.avgPerDay)}</span>
          </div>
          {sub.projection !== null && (
            <div>
              <span className="muted small-text">Proyección</span>
              <span className="num strong">{money(sub.projection)}</span>
            </div>
          )}
        </div>
        {deltaText && <span className="muted small-text">{deltaText}</span>}
      </section>

      <AlertsCard alerts={alerts} onGo={onGo} />

      {data.expenses.length === 0 && (
        <section className="card empty">
          <Logo size={44} animate />
          <strong>Este mes aún no hay gastos</strong>
          <span className="muted">Registra el primero con el botón + de abajo y aquí aparecerá el resumen de los dos.</span>
        </section>
      )}

      {sub.total > 0 && (
        <section className="card">
          <strong>Resumen</strong>
          {budget > 0 && (
            <div className="stack tight">
              <span className={all.pace === 'pasado' ? 'over' : 'muted'}>
                {all.pace === 'bien' && 'Van a buen ritmo: el gasto va acorde al avance del mes.'}
                {all.pace === 'atento' && 'Ojo: llevan gastado más de lo que corresponde a esta fecha.'}
                {all.pace === 'pasado' && 'Superaron el presupuesto total del mes.'}
              </span>
              <div className="meter" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(100, (all.total * 100) / budget)}%`,
                    background: all.pace === 'bien' ? 'var(--accent)' : 'var(--warn)',
                  }}
                />
                <i style={{ left: `${Math.round(all.monthProgress * 100)}%` }} />
              </div>
              <span className="muted small-text">La marca vertical indica cuánto del mes ya pasó.</span>
            </div>
          )}
          {sub.topDay && (
            <div className="insight">
              <span className="muted">Día de más gasto:</span>
              <span className="num">
                {sub.topDay.day} de {monthName(month)} · {money(sub.topDay.amount)}
              </span>
            </div>
          )}
          {sub.byCategory[0] && sub.byCategory[0].spent > 0 && (
            <div className="insight">
              <span className="muted">Categoría principal:</span>
              <span>
                {sub.byCategory[0].name} ({Math.round((sub.byCategory[0].spent * 100) / sub.total)} %)
              </span>
            </div>
          )}
          {sub.biggest && (
            <div className="insight">
              <span className="muted">Gasto más grande:</span>
              <span className="num">
                {money(sub.biggest.amount)}
                {sub.biggest.note ? ` · ${sub.biggest.note}` : ''}
              </span>
            </div>
          )}
        </section>
      )}

      {salaryCheck && (
        <section className={`card verdict ${salaryCheck.level}`}>
          <div className="row between">
            <strong>Tu sueldo</strong>
            <span className="pill">🔒 Solo tú</span>
          </div>
          <strong className="verdict-title">{salaryCheck.headline}</strong>
          <div className="row between">
            <span className="muted">Te queda</span>
            <span className={salaryCheck.free < 0 ? 'over num' : 'num'}>{money(salaryCheck.free)}</span>
          </div>
          <div className="bar" aria-hidden="true">
            <span
              style={{
                width: `${Math.min(100, salaryCheck.spentPct + salaryCheck.debtPct)}%`,
                background: salaryCheck.level === 'ok' ? 'var(--accent)' : salaryCheck.level === 'warn' ? 'var(--amber)' : 'var(--warn)',
              }}
            />
          </div>
          <span className="muted small-text">
            Gastos {salaryCheck.spentPct} % + cuotas {salaryCheck.debtPct} % de tu sueldo. Detalle en la pestaña Plata.
          </span>
        </section>
      )}

      {view === 'all' ? (
        <section className="card">
          <strong>Entre ustedes</strong>
          <span className="settle">{settleText}</span>
          <div>
            {all.people.map((p) => (
              <div className="item" key={p.userId}>
                <Avatar name={p.name} color={p.color} />
                <div className="grow">
                  <div>{p.name}</div>
                  <div className="muted small-text">
                    Pagó compartido {money(p.paidShared)} · le tocaba {money(p.fairShare)}
                  </div>
                </div>
                <span className="num">{money(p.trueCost)}</span>
              </div>
            ))}
          </div>
          <span className="muted small-text">
            El número de la derecha es el costo real de cada uno: sus gastos personales más su mitad de lo compartido.
          </span>
        </section>
      ) : (
        person && (
          <section className="card">
            <strong>Costo real de {person.name}</strong>
            <Line label="Pagó en total" value={money(person.paid)} />
            <Line label="De eso, compartido" value={money(person.paidShared)} />
            <Line label="De eso, personal" value={money(person.paidPersonal)} />
            <Line label="Su mitad de lo compartido" value={money(person.fairShare)} />
            <Line label="Costo real" value={money(person.trueCost)} strong />
            <span className={person.balance < 0 ? 'over' : 'muted'}>
              {person.balance > 0
                ? `Le deben ${money(person.balance)}`
                : person.balance < 0
                  ? `Debe ${money(-person.balance)}`
                  : 'Está a mano'}
            </span>
          </section>
        )
      )}

      <section className="card">
        <div className="row between">
          <strong>Calendario</strong>
          {day !== null && (
            <button type="button" className="link-btn" onClick={() => setDay(null)}>
              Ver todo el mes
            </button>
          )}
        </div>
        <div className="cal">
          {DOW.map((l, i) => (
            <span key={i} className="cal-dow" aria-hidden="true">
              {l}
            </span>
          ))}
          {cells.map((c, i) => {
            if (c === null) return <span key={i} />
            const amt = sub.daily.get(c) ?? 0
            return (
              <button
                key={i}
                type="button"
                className={c === today ? 'cal-day today' : 'cal-day'}
                aria-pressed={day === c}
                aria-label={`Día ${c}: ${money(amt)}`}
                style={
                  amt > 0
                    ? { background: `color-mix(in srgb, var(--accent) ${Math.round((amt / maxDay) * 60)}%, var(--surface-2))` }
                    : undefined
                }
                onClick={() => setDay(day === c ? null : c)}
              >
                <span>{c}</span>
                {amt > 0 && <small>{compact(amt)}</small>}
              </button>
            )
          })}
        </div>
      </section>

      {cats.length > 0 && (
        <section className="card">
          <strong>Por categoría</strong>
          {cats.map((c) => {
            const useBudget = view === 'all' && c.budget > 0
            const pct = useBudget ? Math.min(100, (c.spent * 100) / c.budget) : sub.total > 0 ? (c.spent * 100) / sub.total : 0
            const over = useBudget && c.spent > c.budget
            return (
              <div className="stack tight" key={c.id}>
                <div className="row between">
                  <span>{c.name}</span>
                  <span className="num muted">
                    <span className={over ? 'over' : ''}>{money(c.spent)}</span>
                    {useBudget ? ` / ${money(c.budget)}` : ''}
                  </span>
                </div>
                <div className="bar" aria-hidden="true">
                  <span style={{ width: `${pct}%`, background: over ? 'var(--warn)' : 'var(--accent)' }} />
                </div>
              </div>
            )
          })}
        </section>
      )}

      {view === 'all' && goal && (
        <section className="card">
          <div className="row">
            <Ring pct={goalPct} />
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
        <strong>{day === null ? 'Últimos movimientos' : `Movimientos del ${day} de ${monthName(month)}`}</strong>
        {shown.length === 0 && <span className="muted">Sin movimientos.</span>}
        <div>
          {shown.map((e) => (
            <div className="item" key={e.id}>
              <Avatar name={byId.get(e.paid_by)?.display_name} color={byId.get(e.paid_by)?.color} />
              <div className="grow">
                <div className="ellipsis">{e.note || catName.get(e.category_id) || 'Gasto'}</div>
                <div className="muted small-text">
                  {catName.get(e.category_id) ?? 'Sin categoría'} · {shortDate(e.spent_on)}
                  {e.shared ? '' : ' · personal'}
                  {e.recurring_id ? ' · fijo' : ''}
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
