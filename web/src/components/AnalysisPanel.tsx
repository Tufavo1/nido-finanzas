import { useEffect, useMemo, useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { buildAnalysis } from '../lib/analysis'
import type { Analysis, HistExpense } from '../lib/analysis'
import { buildNumbers } from '../lib/numbers'
import { buildUpcoming } from '../lib/upcoming'
import { splitOf } from '../lib/split'
import UpcomingCard from './UpcomingCard'
import { buildPlan } from '../lib/advisor'
import type { Plan } from '../lib/advisor'
import { analyzeDebts } from '../lib/debtAnalysis'
import type { Numbers } from '../lib/numbers'
import type { Level } from '../lib/finance'
import { money } from '../lib/format'
import { fetchHistory } from '../lib/history'
import { monthName } from '../lib/ui'
import { SLICE_COLORS, levelColor } from '../lib/chartColors'
import { Bars, Donut, Gauge } from './Charts'
import Logo from './Logo'
import { Rich } from '../lib/rich'

interface Props {
  hh: Household
  data: HouseholdData
  month: Date
  onGoSalary: () => void
}

const MARK: Record<Level, string> = { ok: '✓', warn: '!', bad: '✕' }
const WORD: Record<Level, string> = { ok: 'Bien', warn: 'Ojo', bad: 'Urgente' }

function RuleRow({ label, hint, amount, income, target, kind }: { label: string; hint: string; amount: number; income: number; target: number; kind: 'max' | 'min' }) {
  const pct = income > 0 ? Math.round((amount * 100) / income) : 0
  const bad = kind === 'max' ? pct > target : pct < target
  return (
    <div className="stack tight">
      <div className="row between">
        <span className="strong">{label}</span>
        <span className={bad ? 'num over' : 'num'}>
          {pct} % <span className="muted small-text">· referencia {target} %</span>
        </span>
      </div>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${Math.min(100, pct)}%`, background: bad ? 'var(--warn)' : 'var(--accent)' }} />
        <i style={{ left: `${target}%` }} />
      </div>
      <span className="muted small-text">
        <span className="num">{money(amount)}</span> · {hint}
      </span>
    </div>
  )
}

function ruleNote(a: Analysis): string {
  const r = a.rule
  if (!r || r.income <= 0) return ''
  const n = Math.round((r.needs * 100) / r.income)
  const w = Math.round((r.wants * 100) / r.income)
  const s = Math.round((r.savings * 100) / r.income)
  if (s >= 20 && n <= 50) return 'Vas dentro de la referencia: lo básico cabe en la mitad y ahorras 20 % o más.'
  if (n > 50) return `Lo básico ya se lleva el ${n} % de lo que ganas. Es lo que más aprieta: revisa arriendo, cuentas y cuotas antes que los gustos.`
  if (w > 30) return `Los gustos suben al ${w} % (la referencia es 30 %). Ahí tienes el margen más fácil para recortar y ahorrar más.`
  return `Te queda un ${s} % para ahorrar; la referencia es 20 %. Ajusta gustos o gastos fijos para acercarte.`
}


const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`
const comma = (x: number, d = 1) => x.toFixed(d).replace('.', ',')

function FlowCard({ f, month, isCurrent }: { f: NonNullable<Numbers['flow']>; month: Date; isCurrent: boolean }) {
  const pct = f.savingsPct
  return (
    <section className="card" aria-label="Tu mes en números">
      <strong>Tu mes en números</strong>
      <span className="muted small-text">
        Lo que entra, lo que sale y lo que sobra en {monthName(month)}{isCurrent ? ' (hasta hoy)' : ''}.
      </span>
      <div className="tiles">
        <div className="tile">
          <span className="muted small-text">Ganas</span>
          <span className="amount-sm num">{money(f.income)}</span>
        </div>
        <div className="tile">
          <span className="muted small-text">Gastas</span>
          <span className="amount-sm num">{money(f.spent)}</span>
        </div>
        {f.commitments > 0 && (
          <div className="tile">
            <span className="muted small-text">Cuotas de deudas</span>
            <span className="amount-sm num">{money(f.commitments)}</span>
          </div>
        )}
        {f.saved > 0 && (
          <div className="tile">
            <span className="muted small-text">Ahorro apartado</span>
            <span className="amount-sm num">{money(f.saved)}</span>
          </div>
        )}
        {isCurrent && f.pendingFixed > 0 && (
          <div className="tile">
            <span className="muted small-text">Fijos que aún vencen</span>
            <span className="amount-sm num">{money(f.pendingFixed)}</span>
          </div>
        )}
        <div className="tile">
          <span className="muted small-text">{f.realFree < 0 ? 'Te faltará' : isCurrent && f.pendingFixed > 0 ? 'Libre de verdad' : 'Te sobra hoy'}</span>
          <span className={f.realFree < 0 ? 'amount-sm num over' : 'amount-sm num'}>{money(Math.abs(isCurrent ? f.realFree : f.free))}</span>
        </div>
      </div>
      {isCurrent && f.pendingFixed > 0 && (
        <span className="muted small-text">
          Hoy tienes {money(f.free)}, pero aún vencen {money(f.pendingFixed)} en gastos fijos este mes: lo que de verdad puedes gastar es {money(f.realFree)}.
        </span>
      )}
      <div className="stack tight">
        <span className="strong">De cada $100 que ganas</span>
        <div className="split" role="img" aria-label={`Gastos ${f.per100.spent} pesos, deudas ${f.per100.debts} pesos, fijos por venir ${f.per100.pending} pesos, ahorro ${f.per100.saved} pesos, te sobran ${f.per100.left} pesos`}>
          <span style={{ width: `${Math.min(100, f.per100.spent)}%`, background: 'var(--blue)' }} />
          <span style={{ width: `${Math.min(100 - Math.min(100, f.per100.spent), f.per100.debts)}%`, background: 'var(--warn)' }} />
          <span style={{ width: `${Math.min(100 - Math.min(100, f.per100.spent + f.per100.debts), f.per100.pending)}%`, background: 'var(--amber)' }} />
          <span style={{ width: `${Math.min(100 - Math.min(100, f.per100.spent + f.per100.debts + f.per100.pending), f.per100.saved)}%`, background: 'var(--green, var(--accent))', opacity: 0.6 }} />
          <span style={{ width: `${f.per100.left}%`, background: 'var(--accent)' }} />
        </div>
        <div className="split-legend small-text">
          <span><i style={{ background: 'var(--blue)' }} /> Gastos ${f.per100.spent}</span>
          {f.per100.debts > 0 && <span><i style={{ background: 'var(--warn)' }} /> Deudas ${f.per100.debts}</span>}
          {f.per100.pending > 0 && <span><i style={{ background: 'var(--amber)' }} /> Fijos por venir ${f.per100.pending}</span>}
          {f.per100.saved > 0 && <span><i style={{ background: 'var(--accent)', opacity: 0.6 }} /> Ahorro ${f.per100.saved}</span>}
          <span><i style={{ background: 'var(--accent)' }} /> Sobra ${f.per100.left}</span>
        </div>
      </div>
      <div className="stack tight">
        <div className="row between">
          <span className="muted">Gastas en promedio por día</span>
          <span className="num strong">{money(f.dailyAvg)}</span>
        </div>
        {isCurrent && f.safeDaily !== null && (
          <div className="row between">
            <span className="muted">Puedes gastar por día hasta fin de mes</span>
            <span className="num strong">{money(f.safeDaily)}</span>
          </div>
        )}
        <div className="row between">
          <span className="muted">
            {f.outlook < 0 ? (isCurrent ? 'A fin de mes te faltarían' : 'Te faltaron') : isCurrent ? 'A fin de mes ahorrarías' : 'Ahorraste'}
          </span>
          <span className={f.outlook < 0 ? 'num strong over' : 'num strong'}>
            {money(Math.abs(f.outlook))} · {pct < 0 ? '−' : ''}{Math.abs(pct)} %
          </span>
        </div>
      </div>
      <details className="how">
        <summary>¿Cómo se calcula?</summary>
        <p>
          «Gastas» es tu costo real: tus gastos personales más tu parte de los compartidos. «Te sobra» es lo que ganas menos lo que gastas y
          menos tus cuotas de deuda. Al cierre se estima con tu ritmo diario actual. Ahorrar entre 10 % y 20 % de lo que ganas es una meta sana.
        </p>
      </details>
    </section>
  )
}

function ChangesCard({ c, month }: { c: NonNullable<Numbers['changes']>; month: Date }) {
  const up = c.diff > 0
  return (
    <section className="card" aria-label="Frente al mes pasado">
      <strong>Frente al mes pasado</strong>
      <span className="muted small-text">
        Lo gastado en {monthName(month)} frente a lo gastado {c.label}, para que la comparación sea justa.
      </span>
      <div className="row between">
        <span className="strong">{c.diff === 0 ? 'Gastas igual' : up ? 'Gastas más' : 'Gastas menos'}</span>
        <span className={up ? 'num over' : 'num'}>
          {signed(c.diff)}{c.pct !== null ? ` · ${c.pct > 0 ? '+' : c.pct < 0 ? '−' : ''}${Math.abs(c.pct)} %` : ''}
        </span>
      </div>
      {c.items.length > 0 && (
        <div className="legend">
          {c.items.map((i) => (
            <div className="legend-item" key={i.name}>
              <span className={i.diff > 0 ? 'delta up' : 'delta down'} aria-hidden="true">{i.diff > 0 ? '▲' : '▼'}</span>
              <span className="grow ellipsis">{i.name}</span>
              <span className="muted small-text num">{i.pct === null ? 'nuevo' : `${i.pct > 0 ? '+' : '−'}${Math.abs(i.pct)} %`}</span>
              <span className={i.diff > 0 ? 'num strong over' : 'num strong'}>{signed(i.diff)}</span>
            </div>
          ))}
        </div>
      )}
      <span className="muted small-text">▲ subió, ▼ bajó. Solo se muestran los cambios de $5.000 o más.</span>
    </section>
  )
}

function FixedVarCard({ f }: { f: NonNullable<Numbers['fixedVar']> }) {
  return (
    <section className="card" aria-label="Gastos fijos y variables">
      <strong>Lo fijo y lo que puedes ajustar</strong>
      <div className="split" role="img" aria-label={`Fijos ${f.fixedPct} por ciento, variables ${100 - f.fixedPct} por ciento`}>
        <span style={{ width: `${f.fixedPct}%`, background: 'var(--blue)' }} />
        <span style={{ width: `${100 - f.fixedPct}%`, background: 'var(--accent)' }} />
      </div>
      <div className="tiles">
        <div className="tile">
          <span className="muted small-text">Fijos · {f.fixedPct} %</span>
          <span className="amount-sm num">{money(f.fixed)}</span>
        </div>
        <div className="tile">
          <span className="muted small-text">Variables · {100 - f.fixedPct} %</span>
          <span className="amount-sm num">{money(f.variable)}</span>
        </div>
      </div>
      <span className="muted small-text">
        Los fijos son los que se anotan solos cada mes (arriendo, cuentas…). Los variables son los que decides día a día: ahí está tu margen.
        {f.fixedOfIncome !== null && ` Lo fijo ya compromete el ${f.fixedOfIncome} % de lo que ganas${f.fixedOfIncome > 50 ? ': es mucho, queda poco margen.' : '.'}`}
      </span>
    </section>
  )
}

function DebtsCard({ d }: { d: NonNullable<Numbers['debts']> }) {
  return (
    <section className="card" aria-label="Tus deudas en números">
      <strong>Tus deudas en números</strong>
      <div className="tiles">
        <div className="tile">
          <span className="muted small-text">Todavía debes</span>
          <span className="amount-sm num">{money(d.remaining)}</span>
        </div>
        <div className="tile">
          <span className="muted small-text">Pagas al mes</span>
          <span className="amount-sm num">{money(d.payment)}</span>
        </div>
        <div className="tile">
          <span className="muted small-text">Interés que se va al mes</span>
          <span className="amount-sm num">{money(d.interest)}</span>
        </div>
        <div className="tile">
          <span className="muted small-text">Libre de deudas en</span>
          <span className="amount-sm num">{d.stuck ? 'No avanza' : d.freeInMonths === 0 ? 'Listo' : `${d.freeInMonths} ${d.freeInMonths === 1 ? 'mes' : 'meses'}`}</span>
        </div>
      </div>
      {d.monthsOfIncome !== null && (
        <span className="muted small-text">Tu deuda equivale a {comma(d.monthsOfIncome)} meses de lo que ganas.</span>
      )}
      {d.stuck && <span className="small-text">Alguna cuota no alcanza ni para cubrir el interés: la deuda no baja. Sube la cuota o negocia la tasa.</span>}
      <span className="muted small-text">Se cuenta solo lo tuyo: tus deudas y tu parte de las compartidas. El detalle está en la pestaña Deudas.</span>
    </section>
  )
}

function CushionCard({ c }: { c: NonNullable<Numbers['cushion']> }) {
  const pct = Math.min(100, Math.round((c.covered / 6) * 100))
  const eta = (m: number | null) => (m === null ? null : m > 36 ? 'más de 3 años' : `${m} ${m === 1 ? 'mes' : 'meses'}`)
  return (
    <section className="card" aria-label="Tu ahorro para imprevistos">
      <strong>Tu ahorro para imprevistos</strong>
      <span className="muted small-text">Cuántos meses podrías vivir sin ingresos con lo que llevas en tu meta de ahorro para imprevistos.</span>
      <div className="row between">
        <span className="amount-sm num">{money(c.saved)}</span>
        <span className="strong num">{comma(c.covered)} de 6 meses</span>
      </div>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${pct}%`, background: c.covered >= 3 ? 'var(--accent)' : 'var(--warn)' }} />
        <i style={{ left: '50%' }} />
      </div>
      <div className="stack tight">
        <div className="row between">
          <span className="muted">Primera meta: 3 meses ({money(c.target3)})</span>
          <span className="num small-text">{c.covered >= 3 ? '✓ logrado' : eta(c.monthsTo3) ? `en ${eta(c.monthsTo3)}` : '—'}</span>
        </div>
        <div className="row between">
          <span className="muted">Ideal: 6 meses ({money(c.target6)})</span>
          <span className="num small-text">{c.covered >= 6 ? '✓ logrado' : eta(c.monthsTo6) ? `en ${eta(c.monthsTo6)}` : '—'}</span>
        </div>
      </div>
      <span className="muted small-text">Los plazos suponen que ahorras todo lo que te sobra cada mes, sin intereses. Un «—» significa que este mes no te sobra nada.</span>
    </section>
  )
}

function HistoryCard({ h, w }: { h: NonNullable<Numbers['history']>; w: Numbers['weekday'] }) {
  const t = h.trendPct
  return (
    <section className="card" aria-label="Tus meses en números">
      <strong>Tus meses en números</strong>
      <div className="tiles">
        <div className="tile">
          <span className="muted small-text">Gasto típico al mes</span>
          <span className="amount-sm num">{money(h.avg)}</span>
        </div>
        <div className="tile">
          <span className="muted small-text">Al año, a este ritmo</span>
          <span className="amount-sm num">{money(h.yearly)}</span>
        </div>
        <div className="tile">
          <span className="muted small-text">Mes más caro · {h.high.label}</span>
          <span className="amount-sm num">{money(h.high.amount)}</span>
        </div>
        <div className="tile">
          <span className="muted small-text">Mes más barato · {h.low.label}</span>
          <span className="amount-sm num">{money(h.low.amount)}</span>
        </div>
      </div>
      {t !== null && Math.abs(t) >= 5 && (
        <span className="small-text">
          {t > 0 ? `Tus últimos 3 meses gastaste ${t} % más que antes.` : `Tus últimos 3 meses gastaste ${-t} % menos que antes. Buen rumbo.`}
        </span>
      )}
      {w && (
        <span className="muted small-text">
          Gastas más los <strong>{w.name}</strong>: ahí se va el {w.pct} % de tu gasto.
        </span>
      )}
      <span className="muted small-text">Sin contar el mes en curso, que aún no termina.</span>
    </section>
  )
}

function PlanCard({ plan }: { plan: Plan }) {
  const deficit = plan.kind === 'deficit'
  return (
    <section className="card" aria-label={deficit ? 'Cómo cuadrar el mes' : 'Qué hacer con lo que sobra'}>
      <strong>{deficit ? 'Cómo cuadrar el mes' : 'Qué hacer con lo que te sobra'}</strong>
      <span className={deficit ? 'small-text' : 'muted small-text'}>{plan.headline}</span>
      <ol className="plan">
        {plan.steps.map((st) => (
          <li key={st.key + st.title}>
            <div className="grow">
              <div className="strong">{st.title}</div>
              <div className="muted small-text">{st.why}</div>
            </div>
          </li>
        ))}
      </ol>
      <span className="muted small-text">Es una sugerencia calculada con tus números de hoy; ajústala a tu realidad. No es asesoría financiera.</span>
    </section>
  )
}

/** Tu análisis personal: en qué se va tu plata, cómo vas y qué mejorar. Se calcula solo. */
export default function AnalysisPanel({ hh, data, month, onGoSalary }: Props) {
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
  const a = built?.a ?? null
  const n = built?.n ?? null
  const up = built?.u ?? null
  const plan = built?.plan ?? null
  const [showAll, setShowAll] = useState(false)

  if (failed) {
    return (
      <section className="card">
        <strong>No se pudo calcular tu análisis</strong>
        <span className="muted">Revisa tu conexión e inténtalo de nuevo.</span>
        <button type="button" className="btn small" onClick={() => setAttempt((n) => n + 1)}>
          Reintentar
        </button>
      </section>
    )
  }
  if (!a || !n) {
    return (
      <section className="card">
        <span className="muted" role="status">
          Calculando tu análisis…
        </span>
      </section>
    )
  }
  if (!a.hasData) {
    return (
      <section className="card empty">
        <Logo size={44} animate />
        <strong>Aún no hay gastos para analizar</strong>
        <span className="muted">
          Registra tus gastos con el botón + y aquí verás en qué se va tu plata, cómo vas y qué puedes mejorar. Todo se calcula solo.
        </span>
      </section>
    )
  }

  const isCurrent = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth()
  const shownInsights = showAll ? a.insights : a.insights.slice(0, 4)
  const total = a.slices.reduce((s, x) => s + x.amount, 0)

  return (
    <>
      <section className="card hero" aria-label="Tu panorama">
        <div className="row between">
          <strong>Tu panorama</strong>
          <span className="pill">🔒 Solo tú</span>
        </div>
        {a.score ? (
          <div className="score-top">
            <Gauge value={a.score.value} level={a.score.level} />
            <div className="grow">
              <span className="muted small-text">Tu salud financiera de {monthName(month)}</span>
              <span className="score-label" style={{ color: a.score.level === 'ok' ? 'var(--accent-ink)' : a.score.level === 'warn' ? 'var(--text)' : 'var(--warn)' }}>
                {a.score.label}
              </span>
            </div>
          </div>
        ) : null}
        <p className="summary">{a.summary}</p>

        {a.score ? (
          <div className="stack">
            {a.score.parts.map((p) => (
              <div className="stack tight" key={p.key}>
                <div className="row between">
                  <span className="strong">{p.label}</span>
                  <span className="muted small-text num">
                    {p.points} / {p.max}
                  </span>
                </div>
                <div className="bar" aria-hidden="true">
                  <span style={{ width: `${(p.points * 100) / p.max}%`, background: levelColor(p.level) }} />
                </div>
                <span className="muted small-text">{p.detail}</span>
              </div>
            ))}
            <details className="how">
              <summary>¿Cómo se calcula este puntaje?</summary>
              <p>
                Suma hasta 100 puntos con cuatro cosas: <strong>ahorro</strong> (40, llegando al 20 % de lo que ganas),{' '}
                <strong>deudas</strong> (25, con cuotas bajo el 15 % de tu ingreso), <strong>presupuesto</strong> (15, categorías del hogar
                dentro de lo definido) y <strong>ahorro para imprevistos</strong> (20, lo que llevas en tu meta de imprevistos frente a 6 meses de gastos). Si falta
                alguno, el puntaje se calcula con lo que hay. Es una orientación con tus datos; no reemplaza a un asesor financiero.
              </p>
            </details>
          </div>
        ) : (
          <div className="stack tight">
            <span className="muted">Pon tu sueldo para que calcule cuánto ahorras, cómo vas con tus deudas y te dé un puntaje.</span>
            <button type="button" className="btn small" onClick={onGoSalary}>
              Poner mi sueldo
            </button>
          </div>
        )}
      </section>

      {a.savings && (
        <section className="card" aria-label="Cuánto tendrías ahorrado">
          <strong>Si sigues así, ahorrarías</strong>
          <span className="muted">Si cada mes te sobra lo mismo que este mes (~{money(a.savings.monthly)}):</span>
          <div className="tiles">
            <div className="tile">
              <span className="muted small-text">En 6 meses</span>
              <span className="amount-sm num">{money(a.savings.in6)}</span>
            </div>
            <div className="tile">
              <span className="muted small-text">En 12 meses</span>
              <span className="amount-sm num">{money(a.savings.in12)}</span>
            </div>
          </div>
          <span className="muted small-text">Es una suma simple de lo que te sobra, sin intereses ni inflación. Si gastas distinto, cambia.</span>
        </section>
      )}

      {n.flow && <FlowCard f={n.flow} month={month} isCurrent={isCurrent} />}

      {up && <UpcomingCard u={up} />}

      {plan && <PlanCard plan={plan} />}

      {a.slices.length > 0 && (
        <section className="card" aria-label="En qué se va tu plata">
          <strong>En qué se va tu plata</strong>
          <span className="muted small-text">Tu costo real: lo tuyo más tu parte de lo compartido.</span>
          <div className="donut-row">
            <Donut
              amounts={a.slices.map((s) => s.amount)}
              label={`Tu gasto de ${monthName(month)} por categoría: ${a.slices.map((s) => `${s.name} ${s.pct} %`).join(', ')}`}
            >
              <span className="donut-total num">{money(total)}</span>
              <span className="muted small-text">en {monthName(month)}</span>
            </Donut>
          </div>
          <div className="legend">
            {a.slices.map((s, i) => (
              <div className="legend-item" key={s.id}>
                <span className="swatch" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} aria-hidden="true" />
                <span className="grow ellipsis">{s.name}</span>
                <span className="muted small-text num">{s.pct} %</span>
                <span className="num strong">{money(s.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {n.changes && <ChangesCard c={n.changes} month={month} />}

      {n.fixedVar && <FixedVarCard f={n.fixedVar} />}

      <section className="card" aria-label="Tus últimos meses">
        <strong>Tus últimos 6 meses</strong>
        <Bars months={a.months} avg={a.avgPrev} />
        <span className="muted small-text">
          {a.avgPrev ? `La línea punteada es tu promedio de meses anteriores: ${money(a.avgPrev)}.` : 'Aún no hay meses anteriores para comparar.'}
        </span>
      </section>

      {n.history && <HistoryCard h={n.history} w={n.weekday} />}

      {a.rule && (
        <section className="card" aria-label="Regla 50, 30, 20">
          <strong>¿Cómo se reparte lo que ganas?</strong>
          <span className="muted small-text">
            Referencia popular 50/30/20: la mitad para lo básico, 30 % para gustos y 20 % para ahorrar. Es una guía, ajústala a tu realidad.
          </span>
          <RuleRow label="Necesidades" hint="súper, hogar, transporte, salud y cuotas" amount={a.rule.needs} income={a.rule.income} target={50} kind="max" />
          <RuleRow label="Gustos" hint="ocio y lo demás" amount={a.rule.wants} income={a.rule.income} target={30} kind="max" />
          <RuleRow label="Ahorro" hint="lo que te sobra" amount={a.rule.savings} income={a.rule.income} target={20} kind="min" />
          <span className="small-text">{ruleNote(a)}</span>
          {a.projected !== null && <span className="muted small-text">Estimado a fin de mes con tu ritmo actual.</span>}
        </section>
      )}

      {n.debts && <DebtsCard d={n.debts} />}

      {n.cushion && <CushionCard c={n.cushion} />}

      <section className="card" aria-label="Qué puedes mejorar">
        <div className="row between">
          <strong>Qué puedes mejorar</strong>
          {a.insights.length > 4 && (
            <button type="button" className="link-btn" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Ver menos' : `Ver los ${a.insights.length}`}
            </button>
          )}
        </div>
        <div className="stack tight">
          {shownInsights.map((f, i) => (
            <div className={`find ${f.level}`} key={`${f.title}-${i}`}>
              <span className="find-mark" aria-label={WORD[f.level]}>
                {MARK[f.level]}
              </span>
              <div className="grow">
                <div className="strong"><Rich text={f.title} /></div>
                <div className="muted small-text"><Rich text={f.detail} /></div>
              </div>
            </div>
          ))}
        </div>
        <span className="muted small-text">Calculado automáticamente con tus datos. Son orientaciones, no asesoría financiera.</span>
      </section>
    </>
  )
}
