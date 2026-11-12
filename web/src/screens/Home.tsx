import ScreenHelp from '../components/ScreenHelp'
import { useEffect, useMemo, useState } from 'react'
import type { Household } from '../App'
import Modal from '../components/Modal'
import SectionHead from '../components/SectionHead'
import type { Expense, HouseholdData } from '../lib/data'
import SavingsCheck from '../components/SavingsCheck'
import ScopeBar from '../components/ScopeBar'
import { scopeExpenses } from '../lib/scope'
import type { Scope } from '../lib/scope'
import type { Notify } from '../components/Toast'
import { savedInMonth } from '../lib/goals'
import { splitOf } from '../lib/split'
import Avatar, { AvatarPair } from '../components/Avatar'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import Ring from '../components/Ring'
import Venn from '../components/Venn'
import { MonthCurveCard, SixMonthsCard, WeekdayCard } from '../components/HomeCharts'
import { compact, monthGrid } from '../lib/calendar'
import { daysLeftInMonth, money } from '../lib/format'
import { analyzeSalary, myDebtShare } from '../lib/finance'
import { monthKey as monthKeyOf, myShare } from '../lib/analysis'
import { dayExpenses, deltaText, latestExpenses, monthStatus, topCategories } from '../lib/homeSummary'
import { pendingFixedThisMonth } from '../lib/upcoming'
import { computeMetrics } from '../lib/metrics'
import type { AlertTab, MoneySection } from '../lib/engine'
import { monthName, shortDate } from '../lib/ui'

interface Props {
  hh: Household
  data: HouseholdData
  month: Date
  isCurrent: boolean
  onMonth: (delta: number) => void
  onGo: (tab: AlertTab, section?: MoneySection) => void
  onSettings: () => void
  /** Abre Gastos mostrando solo esa categoría */
  onCategory: (categoryId: string) => void
  /** Abre Mi perfil en «Mi cuenta» */
  onProfile: () => void
  onToast: Notify
  scope: Scope
  onScope: (s: Scope) => void
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

export default function Home({ hh, data, month, isCurrent, onMonth, onGo, onSettings, onCategory, onProfile, onToast, scope, onScope }: Props) {
  const [day, setDay] = useState<number | null>(null)
  const [graphs, setGraphs] = useState(false)
  const [settle, setSettle] = useState(false)

  const members = hh.members
  const split = useMemo(() => splitOf(members), [members])
  const partner = members.find((m) => m.user_id !== hh.me.user_id)
  const byId = useMemo(() => new Map(hh.everyone.map((m) => [m.user_id, m] as const)), [hh.everyone])
  const catName = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name] as const)), [data.categories])

  // Si la persona elegida ya no está en el hogar, volver a la vista del hogar
  const view = scope === 'all' || byId.has(scope) ? scope : 'all'

  // Al cambiar de mes el día elegido deja de tener sentido
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`
  useEffect(() => {
    setDay(null)
  }, [monthKey])

  const all = useMemo(
    () => computeMetrics(data.expenses, data.prevExpenses, data.categories, members, month),
    [data.expenses, data.prevExpenses, data.categories, members, month],
  )
  // De una persona se ve lo que le corresponde: lo suyo y su parte de lo compartido, aunque lo haya pagado la otra
  const viewExpenses = useMemo<Expense[]>(() => scopeExpenses(data.expenses, view, split), [data.expenses, view, split])
  const viewPrev = useMemo<Expense[]>(() => scopeExpenses(data.prevExpenses, view, split), [data.prevExpenses, view, split])
  const sub = useMemo(() => {
    if (view === 'all') return all
    return computeMetrics(viewExpenses, viewPrev, data.categories, members, month)
  }, [view, all, viewExpenses, viewPrev, data.categories, members, month])
  const person = view === 'all' ? null : (all.people.find((p) => p.userId === view) ?? null)

  // Sueldo: dato privado, solo se calcula para mí y nunca para la pareja
  const mine = all.people.find((p) => p.userId === hh.me.user_id)
  const salaryCheck =
    data.salary && mine && (view === 'all' || view === hh.me.user_id)
      ? analyzeSalary({
          income: data.salary.amount,
          spent: mine.trueCost,
          commitments: myDebtShare(data.debts, data.debtPayments, hh.me.user_id, split),
          month,
          pendingFixed: pendingFixedThisMonth(data.recurring, hh.me.user_id, split),
          fixedBooked: data.expenses.reduce((s, e) => (e.recurring_id ? s + myShare(e, hh.me.user_id, split) : s), 0),
          saved: savedInMonth(data.contributions, hh.me.user_id, monthKeyOf(month)),
        })
      : null

  const pair = members.map((m) => {
    const p = all.people.find((x) => x.userId === m.user_id)
    return { name: m.display_name, color: m.color, paid: p?.paid ?? 0 }
  })
  const two = pair.length === 2 ? ([pair[0]!, pair[1]!] as [(typeof pair)[number], (typeof pair)[number]]) : null

  const budget = data.categories.reduce((s, c) => s + c.monthly_budget, 0)
  const left = budget - all.total

  const deltaLine = deltaText(sub.deltaPct, isCurrent)
  const status = monthStatus({ budget, total: all.total, isCurrent, daysLeft: daysLeftInMonth() })

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
  const latest = latestExpenses(viewExpenses)
  const top = topCategories(sub.byCategory, sub.total, view === 'all')
  const myProfile = data.profiles.find((p) => p.user_id === hh.me.user_id)
  const dayList = dayExpenses(viewExpenses, day)
  const heroLabel = view === 'all' ? 'Gastado en el mes' : view === hh.me.user_id ? 'Te corresponde en el mes' : `Le corresponde a ${byId.get(view)?.display_name ?? ''}`

  const steps = [
    { key: 'expense', label: 'Anotar tu primer gasto', done: data.expenses.length > 0 || data.prevExpenses.length > 0, go: () => onGo('add') },
    { key: 'salary', label: 'Agregar tu sueldo', done: !!data.salary, go: () => onGo('money', 'salary') },
    { key: 'goal', label: 'Crear una meta de ahorro', done: data.goals.length > 0, go: () => onGo('goals') },
    ...(data.profileReady ? [{ key: 'birth', label: 'Agregar tu fecha de nacimiento', done: !!myProfile?.birth_date, go: onProfile }] : []),
  ]
  const stepsDone = steps.filter((x) => x.done).length

  function renderExpense(e: Expense) {
    return (
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
    )
  }

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
        <div className="row">
          <ScreenHelp screen="home" />
          {members.length === 2 ? <AvatarPair people={members} /> : <Logo size={30} />}
          <button type="button" className="icon-btn" aria-label="Ajustes y seguridad" onClick={onSettings}>
            <Icon name="gear" />
          </button>
        </div>
      </div>

      <div className="row between" role="group" aria-label="Elegir mes">
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

      <ScopeBar hh={hh} scope={view} onScope={onScope} label="Ver gastos de" />

      {/* 1. Lo primero: cuánto se gastó */}
      <section className="card hero" aria-label="Resumen del mes">
        <span className="muted">{heroLabel}</span>
        <span className="amount num">{money(sub.total)}</span>
        {view === 'all' && budget > 0 && (
          <>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (all.total * 100) / budget)}%`, background: left < 0 ? 'var(--warn)' : all.pace === 'bien' ? 'var(--accent)' : 'var(--amber)' }} />
              <i style={{ left: `${Math.round(all.monthProgress * 100)}%` }} />
            </div>
            <span className={left < 0 ? 'over strong' : 'strong'}>{status}</span>
          </>
        )}
        {view === 'all' && budget === 0 && <span className="muted">{status}</span>}
        {deltaLine && <span className="muted small-text">{deltaLine}</span>}
        <div className="stats">
          <div>
            <span className="muted small-text">Compartido</span>
            <span className="num strong">{money(sub.shared)}</span>
          </div>
          <div>
            <span className="muted small-text">Personal</span>
            <span className="num strong">{money(sub.personal)}</span>
          </div>
        </div>
      </section>

      {/* En qué se fue: pocas categorías, de mayor a menor; tocar una abre sus gastos */}
      {top.length > 0 && (
        <section className="card" aria-labelledby="home-top">
          <strong id="home-top">En qué se fue</strong>
          <div>
            {top.map((c) => (
              <button type="button" className="top-cat" key={c.id} onClick={() => onCategory(c.id)} aria-label={`${c.name}: ${money(c.spent)}. Ver sus gastos`}>
                <span className="row between">
                  <span className="ellipsis">{c.name}</span>
                  <span className={c.over ? 'num strong over' : 'num strong'}>{money(c.spent)}</span>
                </span>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: `${c.pct}%`, background: c.over ? 'var(--warn)' : 'var(--accent)' }} />
                </span>
                {c.left !== null && <span className={c.over ? 'over small-text' : 'muted small-text'}>{c.left >= 0 ? `Quedan ${money(c.left)}` : `Se pasó por ${money(-c.left)}`}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {data.expenses.length === 0 && (
        <section className="card empty" aria-labelledby="home-empty">
          <Logo size={44} animate />
          <strong id="home-empty">Este mes aún no hay gastos</strong>
          <span className="muted">Anota el primero y aquí verás cuánto llevan gastado.</span>
          <button type="button" className="btn wide" onClick={() => onGo('add')}>
            Registrar mi primer gasto
          </button>
        </section>
      )}

      {/* Completa tu hogar: pasos sugeridos mientras falten (Completeness Meter) */}
      {steps.length > 0 && stepsDone < steps.length && (
        <section className="card setup" aria-labelledby="home-setup">
          <div className="row between">
            <strong id="home-setup">Completa tu hogar</strong>
            <span className="muted small-text">{stepsDone} de {steps.length}</span>
          </div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={stepsDone} aria-label="Pasos completados">
            <span style={{ width: `${Math.round((stepsDone * 100) / steps.length)}%`, background: 'var(--accent)' }} />
          </div>
          <ul className="setup-list">
            {steps.map((st) => (
              <li key={st.key}>
                {st.done ? (
                  <span className="setup-item done"><span aria-hidden="true">✔</span> {st.label}</span>
                ) : (
                  <button type="button" className="setup-item" onClick={st.go}>
                    <span aria-hidden="true">○</span> {st.label}
                    <Icon name="chevR" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 2. Tu sueldo: solo para ti */}
      {salaryCheck && (
        <button type="button" className={salaryCheck.level === 'ok' ? 'fixed-card' : 'fixed-card soon'} onClick={() => onGo('money', 'salary')}>
          <span className="fixed-top">
            <span className="grow fixed-name">
              <strong>{salaryCheck.headline}</strong>
              <span className="muted small-text">{salaryCheck.pendingFixed > 0 ? 'Libre de verdad' : 'Te queda del sueldo'}</span>
            </span>
            <span className={salaryCheck.realFree < 0 ? 'over num strong' : 'num strong'}>{money(salaryCheck.realFree)}</span>
          </span>
          <span className="card-cta" aria-hidden="true">
            <Icon name="lock" size={14} /> Solo tú · Toca para ver el detalle <Icon name="chevR" size={16} />
          </span>
        </button>
      )}

      {data.salary && data.financeReady && (view === 'all' || view === hh.me.user_id) && (
        <SavingsCheck hh={hh} data={data} month={month} onToast={onToast} onGoals={() => onGo('goals')} />
      )}

      {/* 3. Entre ustedes */}
      {view === 'all' && members.length > 1 && (
        <button type="button" className="fixed-card" onClick={() => setSettle(true)}>
          <span className="fixed-top">
            <span className="grow fixed-name">
              <span className="muted small-text">Cuentas entre ustedes</span>
              <strong className="settle">{settleText}</strong>
            </span>
          </span>
          <span className="card-cta" aria-hidden="true">
            Toca para ver el detalle <Icon name="chevR" size={16} />
          </span>
        </button>
      )}
      {view !== 'all' && person && (
        <button type="button" className="fixed-card" onClick={() => setSettle(true)}>
          <span className="fixed-top">
            <span className="grow fixed-name">
              <span className="muted small-text">{view === hh.me.user_id ? 'Tu costo real' : `Costo real de ${person.name}`}</span>
              <strong className="settle">{money(person.trueCost)}</strong>
            </span>
          </span>
          <span className="card-cta" aria-hidden="true">
            Toca para ver el detalle <Icon name="chevR" size={16} />
          </span>
        </button>
      )}
      {settle && (
        <Modal label="Cuentas" onClose={() => setSettle(false)}>
          <div className="card cat-sheet">
            <div className="stack cat-detail">
              <div className="row between">
                <strong className="cat-title">{view === 'all' ? 'Entre ustedes' : `Costo real de ${person?.name ?? ''}`}</strong>
                <button type="button" className="btn ghost small" onClick={() => setSettle(false)}>
                  Cerrar
                </button>
              </div>
              {view === 'all' ? (
                <>
                  <strong className="cat-big">{settleText}</strong>
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
                  <span className="muted small-text">El número de la derecha es lo que le cuesta a cada uno: sus gastos personales más su parte de lo compartido.</span>
                </>
              ) : (
                person && (
                  <div className="stack tight">
                    <Line label="Pagó en total" value={money(person.paid)} />
                    <Line label="De eso, compartido" value={money(person.paidShared)} />
                    <Line label="De eso, personal" value={money(person.paidPersonal)} />
                    <Line label="Su parte de lo compartido" value={money(person.fairShare)} />
                    <Line label="Costo real" value={money(person.trueCost)} strong />
                    <span className={person.balance < 0 ? 'over' : 'muted'}>
                      {person.balance > 0 ? `Le deben ${money(person.balance)}` : person.balance < 0 ? `Debe ${money(-person.balance)}` : 'Está a mano'}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* 4. Meta */}
      {view === 'all' && goal && (
        <button type="button" className="fixed-card" onClick={() => onGo('goals')}>
          <span className="fixed-top">
            <Ring pct={goalPct} />
            <span className="grow fixed-name">
              <strong>{goal.name}</strong>
              <span className="muted num">
                {money(saved)} de {money(goal.target_amount)}
              </span>
            </span>
          </span>
          <span className="card-cta" aria-hidden="true">
            Toca para ver tus metas <Icon name="chevR" size={16} />
          </span>
        </button>
      )}

      {/* 5. Últimos gastos */}
      <SectionHead title="Últimos gastos" hint={view === 'all' ? 'Lo último que anotaron' : 'Lo último que te corresponde'} />
      <section className="card">
        {latest.length === 0 && <span className="muted">Todavía no hay gastos este mes.</span>}
        <div>{latest.map(renderExpense)}</div>
        <button type="button" className="btn ghost wide" onClick={() => onGo('expenses')}>
          Ver todo el historial
        </button>
      </section>

      {/* 6. Gráficos: lo que menos se usa, al final */}
      {viewExpenses.length > 0 && (
        <>
          <SectionHead title="Gráficos" hint="Para mirar con calma: ritmo, días y categorías" />

          {!graphs ? (
            <button type="button" className="btn ghost wide" onClick={() => setGraphs(true)}>
              Ver gráficos
            </button>
          ) : (
            <>
              <MonthCurveCard expenses={viewExpenses} prevExpenses={viewPrev} budget={view === 'all' ? budget : 0} month={month} isCurrent={isCurrent} />
              <SixMonthsCard hh={hh} data={data} month={month} who={view} />
              <WeekdayCard expenses={viewExpenses} />

              <section className="card">
                <div className="row between">
                  <strong>Calendario</strong>
                  {day !== null && (
                    <button type="button" className="link-btn" onClick={() => setDay(null)}>
                      Quitar día
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
                        style={amt > 0 ? { background: `color-mix(in srgb, var(--accent) ${Math.round((amt / maxDay) * 60)}%, var(--surface-2))` } : undefined}
                        onClick={() => setDay(day === c ? null : c)}
                      >
                        <span>{c}</span>
                        {amt > 0 && <small>{compact(amt)}</small>}
                      </button>
                    )
                  })}
                </div>
                {day !== null && (
                  <>
                    <strong>Gastos del {day} de {monthName(month)}</strong>
                    {dayList.length === 0 && <span className="muted">Ese día no hubo gastos.</span>}
                    <div>{dayList.map(renderExpense)}</div>
                  </>
                )}
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

              {view === 'all' && two && (
                <section className="card">
                  <strong>Quién pagó más</strong>
                  <Venn people={two} />
                </section>
              )}

              <button type="button" className="btn ghost wide" onClick={() => setGraphs(false)}>
                Ocultar gráficos
              </button>
            </>
          )}
        </>
      )}
    </main>
  )
}
