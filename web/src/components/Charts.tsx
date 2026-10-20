import type { ReactNode } from 'react'
import { compact } from '../lib/calendar'
import type { MonthBar } from '../lib/analysis'
import { SLICE_COLORS, levelColor } from '../lib/chartColors'
import type { Level } from '../lib/finance'

/** Anillo de categorías. El texto accesible lo da quien lo usa. */
export function Donut({ amounts, label, children }: { amounts: number[]; label: string; children?: ReactNode }) {
  const r = 52
  const c = 2 * Math.PI * r
  const total = amounts.reduce((s, a) => s + a, 0)
  let offset = 0
  return (
    <div className="donut" role="img" aria-label={label}>
      <svg viewBox="0 0 140 140" width="148" height="148" aria-hidden="true">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--track)" strokeWidth="22" />
        {total > 0 &&
          amounts.map((a, i) => {
            const len = (a / total) * c
            const gap = amounts.length > 1 ? Math.min(3, len * 0.5) : 0
            const el = (
              <circle
                key={i}
                className="donut-slice"
                cx="70"
                cy="70"
                r={r}
                fill="none"
                strokeWidth="22"
                style={{ stroke: SLICE_COLORS[i % SLICE_COLORS.length], animationDelay: `${i * 80}ms` }}
                strokeDasharray={`${Math.max(len - gap, 0)} ${c - Math.max(len - gap, 0)}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            )
            offset += len
            return el
          })}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  )
}

/** Gasto de los últimos meses, con tu promedio como línea punteada. */
export function Bars({ months, avg }: { months: MonthBar[]; avg: number | null }) {
  const W = 300
  const top = 22
  const plot = 70
  const max = Math.max(1, ...months.map((m) => m.amount), avg ?? 0)
  const slot = W / months.length
  const bw = slot * 0.56
  const y = (v: number) => top + plot - (v / max) * plot
  const desc = months.map((m) => `${m.label}: ${m.amount.toLocaleString('es-CL')} pesos`).join('; ')
  return (
    <svg className="bars" viewBox={`0 0 ${W} 116`} role="img" aria-label={`Tu gasto de los últimos meses. ${desc}`}>
      {avg !== null && avg > 0 && (
        <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} className="bars-avg" />
      )}
      {months.map((m, i) => {
        const x = i * slot + (slot - bw) / 2
        const h = (m.amount / max) * plot
        return (
          <g key={m.key}>
            <rect
              className={m.current ? 'bar-now' : 'bar-past'}
              x={x}
              y={top + plot - h}
              width={bw}
              height={Math.max(h, m.amount > 0 ? 3 : 0)}
              rx="7"
              style={{ animationDelay: `${i * 60}ms` }}
            />
            {m.amount > 0 && (
              <text x={x + bw / 2} y={top + plot - h - 5} textAnchor="middle" className="bars-val">
                {compact(m.amount)}
              </text>
            )}
            <text x={x + bw / 2} y="108" textAnchor="middle" className={m.current ? 'bars-lab now' : 'bars-lab'}>
              {m.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Medidor del puntaje (0 a 100). */
export function Gauge({ value, level }: { value: number; level: Level }) {
  const r = 46
  const c = 2 * Math.PI * r
  return (
    <div className="gauge" role="img" aria-label={`Puntaje ${value} de 100`}>
      <svg viewBox="0 0 112 112" width="112" height="112" aria-hidden="true">
        <circle cx="56" cy="56" r={r} fill="none" stroke="var(--track)" strokeWidth="12" />
        <circle
          className="gauge-arc"
          cx="56"
          cy="56"
          r={r}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          style={{ stroke: levelColor(level), ['--c' as string]: c }}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          transform="rotate(-90 56 56)"
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-num num">{value}</span>
        <span className="muted small-text">de 100</span>
      </div>
    </div>
  )
}
