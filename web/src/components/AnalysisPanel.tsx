import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Household } from '../App'
import Icon from './Icon'
import Modal from './Modal'
import { useDesktop } from '../lib/useDesktop'
import SectionHead from './SectionHead'
import type { HouseholdData } from '../lib/data'
import { useAnalysisBuild } from '../lib/useAnalysisBuild'
import type { Analysis } from '../lib/analysis'
import UpcomingCard from './UpcomingCard'
import type { Plan } from '../lib/advisor'
import type { Numbers } from '../lib/numbers'
import type { Finding, Level } from '../lib/finance'
import { money } from '../lib/format'
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

const EMOJI: Record<Level, string> = { ok: '👏', warn: '💡', bad: '❗' }

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

function FlowCard({ f, isCurrent }: { f: NonNullable<Numbers['flow']>; isCurrent: boolean }) {
  const pct = f.savingsPct
  return (
    <section className="card" aria-label="Tu mes en números">
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
  const { built, failed, retry } = useAnalysisBuild(hh, data, month)
  const a = built?.a ?? null
  const n = built?.n ?? null
  const up = built?.u ?? null
  const plan = built?.plan ?? null
  const [openScore, setOpenScore] = useState(false)
  const [openFlow, setOpenFlow] = useState(false)
  const [openTips, setOpenTips] = useState(false)
  const [showSlices, setShowSlices] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [openExtra, setOpenExtra] = useState<string | null>(null)
  const desktop = useDesktop()

  if (failed) {
    return (
      <section className="card">
        <strong>No se pudo calcular tu análisis</strong>
        <span className="muted">Revisa tu conexión e inténtalo de nuevo.</span>
        <button type="button" className="btn small" onClick={retry}>
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
  const total = a.slices.reduce((s, x) => s + x.amount, 0)
  const flow = n.flow
  const tips: Finding[] = a.insights
  const todo = tips.filter((f) => f.level !== 'ok')
  const good = tips.filter((f) => f.level === 'ok')

  // Cada análisis extra es una fila corta: título y una cifra. El detalle completo se abre al tocarla.
  const items: { key: string; title: string; figure: string; over?: boolean; body: ReactNode }[] = []
  if (a.savings) {
    items.push({
      key: 'ahorro',
      title: 'Si sigues así, ahorrarías',
      figure: `${money(a.savings.in12)} en 12 meses`,
      body: (
        <section className="card" aria-label="Cuánto tendrías ahorrado">
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
        </section>
      ),
    })
  }
  if (up && (up.events.length > 0 || up.endOfMonth !== null)) {
    const end = up.endOfMonth
    items.push({
      key: 'pagos',
      title: 'Pagos que vienen',
      figure: end !== null ? (end < 0 ? `Te faltarían ${money(-end)}` : `Te quedarían ${money(end)}`) : `${up.events.length} pagos`,
      over: end !== null && end < 0,
      body: <UpcomingCard u={up} />,
    })
  }
  if (plan) {
    items.push({ key: 'plan', title: plan.kind === 'deficit' ? 'Cómo cuadrar el mes' : 'Qué hacer con lo que te sobra', figure: `${plan.steps.length} pasos`, body: <PlanCard plan={plan} /> })
  }
  if (n.changes) {
    items.push({ key: 'cambios', title: 'Frente al mes pasado', figure: signed(n.changes.diff), over: n.changes.diff > 0, body: <ChangesCard c={n.changes} month={month} /> })
  }
  if (n.fixedVar) {
    items.push({ key: 'fijos', title: 'Lo fijo y lo variable', figure: `${n.fixedVar.fixedPct} % es fijo`, body: <FixedVarCard f={n.fixedVar} /> })
  }
  items.push({
    key: 'meses',
    title: 'Tus últimos 6 meses',
    figure: n.history ? `${money(n.history.avg)} al mes` : '',
    body: (
      <>
        <section className="card" aria-label="Tus últimos meses">
          <Bars months={a.months} avg={a.avgPrev} />
        </section>
        {n.history && <HistoryCard h={n.history} w={n.weekday} />}
      </>
    ),
  })
  if (a.rule) {
    const r = a.rule
    items.push({
      key: 'regla',
      title: 'Cómo se reparte lo que ganas',
      figure: r.income > 0 ? `Ahorro ${Math.round((r.savings * 100) / r.income)} %` : '',
      body: (
        <section className="card" aria-label="Regla 50, 30, 20">
          <RuleRow label="Necesidades" hint="súper, hogar, transporte, salud y cuotas" amount={r.needs} income={r.income} target={50} kind="max" />
          <RuleRow label="Gustos" hint="ocio y lo demás" amount={r.wants} income={r.income} target={30} kind="max" />
          <RuleRow label="Ahorro" hint="lo que te sobra" amount={r.savings} income={r.income} target={20} kind="min" />
          <span className="small-text">{ruleNote(a)}</span>
        </section>
      ),
    })
  }
  if (n.debts) {
    items.push({ key: 'deudas', title: 'Tus deudas en números', figure: money(n.debts.remaining), over: n.debts.stuck, body: <DebtsCard d={n.debts} /> })
  }
  if (n.cushion) {
    items.push({ key: 'colchon', title: 'Ahorro para imprevistos', figure: `${comma(n.cushion.covered)} de 6 meses`, body: <CushionCard c={n.cushion} /> })
  }
  const openItem = items.find((x) => x.key === openExtra)

  const extras = (
    <div className="stack tight">
      {items.map((x) => (
        <button key={x.key} type="button" className="fixed-card" aria-haspopup="dialog" onClick={() => setOpenExtra(x.key)}>
          <span className="fixed-top">
            <span className="grow fixed-name">
              <strong>{x.title}</strong>
              {x.figure && <span className={x.over ? 'small-text over' : 'muted small-text'}>{x.figure}</span>}
            </span>
            <Icon name="chevR" size={18} />
          </span>
        </button>
      ))}
    </div>
  )

  return (
    <>
      <SectionHead title="Tu panorama" hint="Cómo vas este mes, de un vistazo" />

      <div className="fixed-grid wide">
        {a.score ? (
          <button type="button" className="fixed-card" aria-haspopup="dialog" onClick={() => setOpenScore(true)}>
            <span className="fixed-top">
              <span className="grow fixed-name">
                <strong>Tu salud financiera</strong>
                <span className="muted small-text">🔒 Solo tú · {monthName(month)}</span>
              </span>
            </span>
            <span className="score-top">
              <Gauge value={a.score.value} level={a.score.level} />
              <span className="grow">
                <span className="score-label" style={{ color: a.score.level === 'ok' ? 'var(--accent-ink)' : a.score.level === 'warn' ? 'var(--text)' : 'var(--warn)' }}>
                  {a.score.label}
                </span>
              </span>
            </span>
            <span className="card-cta" aria-hidden="true">
              Toca para ver el detalle <Icon name="chevR" size={16} />
            </span>
          </button>
        ) : (
          <section className="card">
            <strong>Pon tu sueldo para ver tu puntaje</strong>
            <button type="button" className="btn small wide" onClick={onGoSalary}>
              Poner mi sueldo
            </button>
          </section>
        )}

        {flow && (
          <button type="button" className="fixed-card" aria-haspopup="dialog" onClick={() => setOpenFlow(true)}>
            <span className="fixed-top">
              <span className="grow fixed-name">
                <strong>Este mes en números</strong>
                <span className="muted small-text">{monthName(month)}</span>
              </span>
            </span>
            <span className="tiles">
              <span className="tile">
                <span className="muted small-text">Ganas</span>
                <span className="amount-sm num">{money(flow.income)}</span>
              </span>
              <span className="tile">
                <span className="muted small-text">Gastas</span>
                <span className="amount-sm num">{money(flow.spent + flow.commitments)}</span>
              </span>
            </span>
            <span className="row between">
              <span className="muted">{flow.free < 0 ? 'Te faltará' : 'Te sobra'}</span>
              <strong className={flow.free < 0 ? 'amount-sm num over' : 'amount-sm num'}>{money(Math.abs(flow.free))}</strong>
            </span>
            <span className="card-cta" aria-hidden="true">
              Toca para ver el detalle <Icon name="chevR" size={16} />
            </span>
          </button>
        )}
      </div>

      {a.slices.length > 0 && (
        <>
          <SectionHead title="En qué se va tu plata" hint="Tus gastos por categoría" />
          <section className="card donut-card" aria-label="En qué se va tu plata">
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
              {a.slices.slice(0, showSlices ? undefined : 3).map((s, i) => (
                <div className="legend-item" key={s.id}>
                  <span className="swatch" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} aria-hidden="true" />
                  <span className="grow ellipsis">{s.name}</span>
                  <span className="muted small-text num">{s.pct} %</span>
                  <span className="num strong">{money(s.amount)}</span>
                </div>
              ))}
            </div>
            {a.slices.length > 3 && (
              <button type="button" className="btn ghost small wide" aria-expanded={showSlices} onClick={() => setShowSlices((v) => !v)}>
                {showSlices ? 'Ver menos' : `Ver más (${a.slices.length - 3} categorías más)`}
              </button>
            )}
          </section>
        </>
      )}

      {tips.length > 0 && (
        <>
          <SectionHead title="Consejos para este mes" hint="Pequeños cambios que te ayudan a llegar mejor a fin de mes" />
          <section className="card" aria-label="Consejos para este mes">
            <div className="stack tight">
              {[...todo, ...good].slice(0, 3).map((f, i) => (
                <div className={`find ${f.level}`} key={`${f.title}-${i}`}>
                  <span className="tip-emoji" aria-hidden="true">
                    {EMOJI[f.level]}
                  </span>
                  <span className="strong">
                    <Rich text={f.title} />
                  </span>
                </div>
              ))}
            </div>
            <button type="button" className="btn ghost small wide" aria-haspopup="dialog" onClick={() => setOpenTips(true)}>
              Ver cómo mejorar
            </button>
          </section>
        </>
      )}

      {desktop ? (
        <>
          <SectionHead title="Más análisis" hint="Toca uno para ver el detalle" />
          {extras}
        </>
      ) : (
        <>
          <button type="button" className="btn ghost small wide" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
            {moreOpen ? 'Ver menos análisis' : 'Ver más análisis'}
          </button>
          {moreOpen && extras}
        </>
      )}

      {openScore && a.score && (
        <Modal label="Tu salud financiera" onClose={() => setOpenScore(false)}>
          <div className="card cat-sheet">
            <div className="stack cat-detail">
              <div className="row between">
                <strong className="cat-title">Tu salud financiera</strong>
                <button type="button" className="btn ghost small" onClick={() => setOpenScore(false)}>
                  Cerrar
                </button>
              </div>
              <p className="cat-verdict">{a.summary}</p>
              {a.score.parts.map((p) => (
                <div className="stack tight" key={p.key}>
                  <div className="row between">
                    <span className="strong">{p.label}</span>
                    <span className="muted num">
                      {p.points} / {p.max}
                    </span>
                  </div>
                  <div className="bar cat-bar" aria-hidden="true">
                    <span style={{ width: `${(p.points * 100) / p.max}%`, background: levelColor(p.level) }} />
                  </div>
                  <span className="muted small-text">{p.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {openFlow && flow && (
        <Modal label="Este mes en números" onClose={() => setOpenFlow(false)}>
          <div className="card cat-sheet">
            <div className="stack cat-detail">
              <div className="row between">
                <strong className="cat-title">Este mes en números</strong>
                <button type="button" className="btn ghost small" onClick={() => setOpenFlow(false)}>
                  Cerrar
                </button>
              </div>
              <FlowCard f={flow} isCurrent={isCurrent} />
            </div>
          </div>
        </Modal>
      )}

      {openItem && (
        <Modal label={openItem.title} onClose={() => setOpenExtra(null)}>
          <div className="card cat-sheet">
            <div className="stack cat-detail">
              <div className="row between">
                <strong className="cat-title">{openItem.title}</strong>
                <button type="button" className="btn ghost small" onClick={() => setOpenExtra(null)}>
                  Cerrar
                </button>
              </div>
              {openItem.body}
            </div>
          </div>
        </Modal>
      )}

      {openTips && (
        <Modal label="Consejos para este mes" onClose={() => setOpenTips(false)}>
          <div className="card cat-sheet">
            <div className="stack cat-detail">
              <div className="row between">
                <strong className="cat-title">Consejos para este mes</strong>
                <button type="button" className="btn ghost small" onClick={() => setOpenTips(false)}>
                  Cerrar
                </button>
              </div>
              {todo.length > 0 && (
                <div className="stack tight">
                  <strong>💡 Para mejorar</strong>
                  {todo.map((f, i) => (
                    <div className="tip-card" key={`${f.title}-${i}`}>
                      <span className="strong"><Rich text={f.title} /></span>
                      <span className="muted">
                        <Rich text={f.detail} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {good.length > 0 && (
                <div className="stack tight cat-edit">
                  <strong>👏 Lo que ya haces bien</strong>
                  {good.map((f, i) => (
                    <div className="tip-card good" key={`${f.title}-${i}`}>
                      <span className="strong"><Rich text={f.title} /></span>
                      <span className="muted">
                        <Rich text={f.detail} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
