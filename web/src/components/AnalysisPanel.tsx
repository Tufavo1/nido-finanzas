import { useEffect, useMemo, useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { buildAnalysis } from '../lib/analysis'
import type { Analysis, HistExpense } from '../lib/analysis'
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

  const a = useMemo(
    () =>
      hist === null
        ? null
        : buildAnalysis({
            meId: hh.me.user_id,
            memberCount: hh.members.length,
            month,
            history: hist,
            categories: data.categories,
            salary: data.salary,
            incomes: data.incomes,
            debts: data.debts,
            debtPayments: data.debtPayments,
            contributions: data.contributions,
            recurring: data.recurring,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hist, hh.me.user_id, hh.members.length, monthId, data.categories, data.salary, data.incomes, data.debts, data.debtPayments, data.contributions, data.recurring],
  )
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
  if (!a) {
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
                dentro de lo definido) y <strong>colchón</strong> (20, lo aportado a metas frente a 6 meses de gastos). Si falta
                alguno, el puntaje se calcula con lo que hay. Es una guía para ordenarte, no una asesoría financiera.
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

      <section className="card" aria-label="Tus últimos meses">
        <strong>Tus últimos 6 meses</strong>
        <Bars months={a.months} avg={a.avgPrev} />
        <span className="muted small-text">
          {a.avgPrev ? `La línea punteada es tu promedio de meses anteriores: ${money(a.avgPrev)}.` : 'Aún no hay meses anteriores para comparar.'}
        </span>
      </section>

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
