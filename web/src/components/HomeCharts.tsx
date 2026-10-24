import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { Household } from '../App'
import type { Expense, HouseholdData } from '../lib/data'
import { compact } from '../lib/calendar'
import { money } from '../lib/format'
import { fetchHistory } from '../lib/history'
import { monthCurve, monthlyTotals, weekdayBars } from '../lib/homeCharts'
import type { HistExpense } from '../lib/analysis'
import { monthName } from '../lib/ui'
import { Bars } from './Charts'

/** Gráficos del Inicio: cómo va el mes, los últimos meses y en qué día de la semana se gasta. */

const W = 360
const H = 196
const PAD = { l: 38, r: 52, t: 14, b: 26 }

/** Marcas del eje con pasos redondos (1, 2, 2,5 o 5 por la potencia de diez que corresponda), unas 4 en total. */
function niceTicks(v: number): number[] {
  if (v <= 0) return [0, 1]
  const raw = v / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
  const n = Math.max(1, Math.ceil(v / step - 1e-9))
  return Array.from({ length: n + 1 }, (_, i) => i * step)
}

function Key({ kind, label }: { kind: 'now' | 'prev' | 'proj' | 'budget'; label: string }) {
  return (
    <span className="ckey">
      <svg width="22" height="8" aria-hidden="true">
        <line x1="0" x2="22" y1="4" y2="4" className={`cl cl-${kind}`} />
      </svg>
      {label}
    </span>
  )
}

export function MonthCurveCard({ expenses, prevExpenses, budget, month, isCurrent }: { expenses: Expense[]; prevExpenses: Expense[]; budget: number; month: Date; isCurrent: boolean }) {
  const c = useMemo(() => monthCurve(expenses, prevExpenses, month), [expenses, prevExpenses, month])
  const [hover, setHover] = useState<number | null>(null)
  const showBudget = budget > 0
  const ticks = niceTicks(Math.max(...c.points.map((p) => Math.max(p.now ?? 0, p.prev ?? 0, p.proj ?? 0)), showBudget ? budget : 0))
  const top = ticks[ticks.length - 1] ?? 1
  const x = (d: number) => PAD.l + ((d - 1) / Math.max(c.days - 1, 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b)
  const path = (pick: (p: (typeof c.points)[number]) => number | null) =>
    c.points
      .filter((p) => pick(p) !== null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)} ${y(pick(p) ?? 0).toFixed(1)}`)
      .join(' ')
  const last = c.points[c.upTo - 1]
  const xTicks = [1, 8, 15, 22, c.days].filter((d, i, a) => a.indexOf(d) === i && (d === c.days || c.days - d >= 3))

  // Etiquetas de fin de línea: si quedan casi a la misma altura, se separan para que no se pisen
  const endNow = y(last?.now ?? 0)
  const endPrev = y(c.points[c.days - 1]?.prev ?? 0)
  const prevLabelY = Math.abs(endPrev - endNow) < 12 ? endNow + (endPrev >= endNow ? 12 : -12) : endPrev

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - r.left) / r.width) * W
    const d = Math.round(1 + ((vx - PAD.l) / (W - PAD.l - PAD.r)) * (c.days - 1))
    setHover(Math.min(c.days, Math.max(1, d)))
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    setHover((h) => Math.min(c.days, Math.max(1, (h ?? c.upTo) + (e.key === 'ArrowRight' ? 1 : -1))))
  }
  const hp = hover !== null ? c.points[hover - 1] : null
  const diff = c.total - c.prevSame
  const pm = new Date(month.getFullYear(), month.getMonth() - 1, 1)

  return (
    <section className="card" aria-label="Cómo va el mes">
      <strong>Cómo va el mes</strong>
      <span className="muted small-text">Lo gastado día a día en {monthName(month)}, frente a {monthName(pm)}.</span>
      <div className="clegend">
        <Key kind="now" label="Este mes" />
        <Key kind="prev" label="Mes pasado" />
        {c.projected !== null && <Key kind="proj" label="Proyección" />}
        {showBudget && <Key kind="budget" label="Presupuesto" />}
      </div>
      <div className="chart-wrap">
        <svg
          className="line-chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          tabIndex={0}
          aria-label={`Gasto acumulado de ${monthName(month)}: llevan ${money(c.total)}. ${isCurrent ? `A esta fecha el mes pasado llevaban ${money(c.prevSame)}.` : `El mes anterior cerró en ${money(c.prevTotal)}.`} Usa las flechas para ver cada día.`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="cgrid" />
              <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" className="caxis">
                {t === 0 ? '0' : compact(t)}
              </text>
            </g>
          ))}
          {xTicks.map((d) => (
            <text key={d} x={x(d)} y={H - 8} textAnchor="middle" className="caxis">
              {d}
            </text>
          ))}
          {showBudget && budget <= top && (
            <g>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(budget)} y2={y(budget)} className="cl cl-budget" />
            </g>
          )}
          <path d={path((p) => p.prev)} className="cl cl-prev" fill="none" />
          {c.projected !== null && <path d={path((p) => p.proj)} className="cl cl-proj" fill="none" />}
          <path d={path((p) => p.now)} className="cl cl-now" fill="none" />
          {last && last.now !== null && <circle cx={x(last.day)} cy={endNow} r="4" className="cdot" />}
          {last && last.now !== null && (
            <text x={Math.min(x(last.day) + 8, W - 2)} y={endNow + 3} className="clab now">
              {compact(c.total)}
            </text>
          )}
          <text x={x(c.days) + 8} y={prevLabelY + 3} className="clab prev">
            {compact(c.prevTotal)}
          </text>
          {hp && (
            <g>
              <line x1={x(hp.day)} x2={x(hp.day)} y1={PAD.t} y2={H - PAD.b} className="ccross" />
              {hp.prev !== null && <circle cx={x(hp.day)} cy={y(hp.prev)} r="3.5" className="cdot prev" />}
              {hp.now !== null && <circle cx={x(hp.day)} cy={y(hp.now)} r="4" className="cdot" />}
            </g>
          )}
        </svg>
        {hp && (
          <div className="ctip" style={{ left: `${Math.min(78, Math.max(22, (x(hp.day) / W) * 100))}%` }} role="status">
            <span className="ctip-head">Día {hp.day}</span>
            {hp.now !== null && (
              <span className="ctip-row">
                <i className="cl-now-k" /> <strong className="num">{money(hp.now)}</strong> <span className="muted">este mes</span>
              </span>
            )}
            {hp.now === null && hp.proj !== null && (
              <span className="ctip-row">
                <i className="cl-proj-k" /> <strong className="num">{money(hp.proj)}</strong> <span className="muted">proyección</span>
              </span>
            )}
            {hp.prev !== null && (
              <span className="ctip-row">
                <i className="cl-prev-k" /> <strong className="num">{money(hp.prev)}</strong> <span className="muted">mes pasado</span>
              </span>
            )}
          </div>
        )}
      </div>
      <span className="small-text">
        {c.total === 0
          ? 'Aún no hay gastos este mes para dibujar la línea.'
          : isCurrent
            ? `Llevan ${money(c.total)}${c.prevSame > 0 || c.prevTotal > 0 ? `; a esta fecha el mes pasado llevaban ${money(c.prevSame)} (${diff === 0 ? 'igual' : `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`})` : ''}.${c.projected !== null ? ` A este ritmo cerrarían cerca de ${money(c.projected)}.` : ''}`
            : `Cerraron ${monthName(month)} en ${money(c.total)}; el mes anterior cerró en ${money(c.prevTotal)}.`}
      </span>
      <details className="how">
        <summary>Ver los datos en una tabla</summary>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">Este mes</th>
                <th scope="col">Mes pasado</th>
              </tr>
            </thead>
            <tbody>
              {c.points.map((p) => (
                <tr key={p.day}>
                  <th scope="row">{p.day}</th>
                  <td className="num">{p.now === null ? '—' : money(p.now)}</td>
                  <td className="num">{p.prev === null ? '—' : money(p.prev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

export function SixMonthsCard({ hh, data, month, who }: { hh: Household; data: HouseholdData; month: Date; who: string }) {
  const [hist, setHist] = useState<Pick<HistExpense, 'amount' | 'paid_by' | 'spent_on'>[] | null>(null)
  const monthId = `${month.getFullYear()}-${month.getMonth()}`
  useEffect(() => {
    let off = false
    fetchHistory(hh.household.id, new Date(month.getFullYear(), month.getMonth(), 1))
      .then((r) => {
        if (!off) setHist(r)
      })
      .catch(() => {
        if (!off) setHist(null)
      })
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hh.household.id, monthId, data.expenses])
  const m = useMemo(() => (hist === null ? null : monthlyTotals(hist, who, month)), [hist, who, month])
  if (!m || m.bars.every((b) => b.amount === 0)) return null
  return (
    <section className="card" aria-label="Últimos 6 meses">
      <strong>Últimos 6 meses</strong>
      <span className="muted small-text">{who === 'all' ? 'Lo que gasta el hogar cada mes.' : 'Lo que pagó esta persona cada mes.'}</span>
      <Bars months={m.bars} avg={m.avg} />
      <span className="muted small-text">
        {m.avg ? `La línea punteada es el promedio de los meses anteriores: ${money(m.avg)}.` : 'Aún no hay meses anteriores para comparar.'}
      </span>
    </section>
  )
}

export function WeekdayCard({ expenses }: { expenses: Expense[] }) {
  const { bars, top } = useMemo(() => weekdayBars(expenses), [expenses])
  const [active, setActive] = useState<number | null>(null)
  if (top === null || expenses.length < 5) return null
  const total = bars.reduce((s, b) => s + b.amount, 0)
  const max = Math.max(...bars.map((b) => b.amount))
  const sel = bars[active ?? top]!
  const bw = 26
  const gap = (W - 2 * 14 - bw * 7) / 6
  const plot = 84
  return (
    <section className="card" aria-label="Gasto por día de la semana">
      <strong>¿Qué día se gasta más?</strong>
      <span className="muted small-text">Todo lo gastado este mes, repartido de lunes a domingo.</span>
      <svg className="week-chart" viewBox={`0 0 ${W} 126`} role="img" aria-label={`Gasto por día de la semana. ${bars.map((b) => `${b.name} ${money(b.amount)}`).join('; ')}`}>
        {bars.map((b) => {
          const h = max > 0 ? (b.amount / max) * plot : 0
          const bx = 14 + b.idx * (bw + gap)
          const isTop = b.idx === top
          return (
            <g
              key={b.idx}
              tabIndex={0}
              role="button"
              aria-label={`${b.name}: ${money(b.amount)}, ${b.count} ${b.count === 1 ? 'gasto' : 'gastos'}`}
              className={b.idx === (active ?? top) ? 'wk on' : 'wk'}
              onPointerEnter={() => setActive(b.idx)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(b.idx)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(b.idx)}
            >
              <rect x={bx - gap / 2} y="0" width={bw + gap} height="126" fill="transparent" />
              <rect x={bx} y={8 + plot - h} width={bw} height={Math.max(h, b.amount > 0 ? 3 : 0)} rx="6" className={isTop ? 'wk-top' : 'wk-bar'} />
              {isTop && (
                <text x={bx + bw / 2} y={8 + plot - h - 4} textAnchor="middle" className="bars-val">
                  {compact(b.amount)}
                </text>
              )}
              <text x={bx + bw / 2} y="114" textAnchor="middle" className={isTop ? 'bars-lab now' : 'bars-lab'}>
                {b.label}
              </text>
            </g>
          )
        })}
      </svg>
      <span className="small-text" role="status">
        <strong>{sel.name.charAt(0).toUpperCase() + sel.name.slice(1)}</strong>: {money(sel.amount)} ({total > 0 ? Math.round((sel.amount * 100) / total) : 0} % del gasto) en {sel.count} {sel.count === 1 ? 'gasto' : 'gastos'}.
      </span>
    </section>
  )
}
