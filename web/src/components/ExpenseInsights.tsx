import { useEffect, useMemo, useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { analyzeExpenses } from '../lib/expenseAnalysis'
import type { ExpRow } from '../lib/expenseAnalysis'
import { money } from '../lib/format'
import { fetchExpenseRows } from '../lib/history'
import { monthName, shortDate } from '../lib/ui'
import FindingList from './FindingList'

/** Análisis de los gastos del mes: lo que se sale de lo normal, repetidos, suscripciones sin marcar y el ritmo de cada presupuesto. */
export default function ExpenseInsights({ hh, data, month, who }: { hh: Household; data: HouseholdData; month: Date; who: string }) {
  const [rows, setRows] = useState<ExpRow[] | null>(null)
  const monthId = `${month.getFullYear()}-${month.getMonth()}`

  // Se vuelve a pedir al cambiar de mes o cuando llega, se edita o se borra un gasto
  useEffect(() => {
    let off = false
    fetchExpenseRows(hh.household.id, new Date(month.getFullYear(), month.getMonth(), 1))
      .then((r) => {
        if (!off) setRows(r)
      })
      .catch(() => {
        if (!off) setRows(null)
      })
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hh.household.id, monthId, data.expenses])

  const r = useMemo(
    () => (rows === null ? null : analyzeExpenses({ history: rows, month, categories: data.categories, recurring: data.recurring, who })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, monthId, data.categories, data.recurring, who],
  )
  if (!r || !r.hasData) return null
  const { rhythm } = r

  return (
    <>
      <section className="card" aria-label="Análisis de los gastos">
        <strong>Lo que dice el análisis de {monthName(month)}</strong>
        {r.findings.length > 0 ? (
          <FindingList list={r.findings.slice(0, 6)} />
        ) : (
          <span className="muted">No veo nada fuera de lo normal este mes: sin repetidos, sin gastos raros y sin presupuestos en riesgo.</span>
        )}
        {r.duplicates.length > 0 && (
          <span className="muted small-text">Si un gasto repetido fue real (dos compras iguales), ignora el aviso.</span>
        )}
      </section>

      {r.pace.length > 0 && (
        <section className="card" aria-label="Ritmo de los presupuestos">
          <strong>Cómo va cada presupuesto</strong>
          <span className="muted small-text">Si siguen gastando al ritmo de hoy, así cierra cada categoría.</span>
          {r.pace.map((p) => {
            const pct = Math.min(100, Math.round((p.spent * 100) / p.budget))
            const proj = Math.min(100, Math.round((p.projected * 100) / p.budget))
            return (
              <div className="stack tight" key={p.id}>
                <div className="row between">
                  <span className="strong">{p.name}</span>
                  <span className={p.status === 'over' ? 'num over' : 'num'}>
                    {money(p.spent)} <span className="muted small-text">de {money(p.budget)}</span>
                  </span>
                </div>
                <div className="meter" aria-hidden="true">
                  <span style={{ width: `${pct}%`, background: p.status === 'over' ? 'var(--warn)' : p.status === 'will' ? 'var(--amber)' : 'var(--accent)' }} />
                  {p.status !== 'over' && proj > pct && <i style={{ left: `${proj}%` }} />}
                </div>
                <span className={p.status === 'ok' ? 'muted small-text' : 'small-text'}>
                  {p.status === 'over'
                    ? `Se pasaron por ${money(p.spent - p.budget)}.`
                    : p.status === 'will'
                      ? `A este ritmo cierran en ${money(p.projected)}: el tope se acaba el día ${p.hitDay}.`
                      : `Van bien: cerrarían cerca de ${money(p.projected)}.`}
                </span>
              </div>
            )
          })}
        </section>
      )}

      {(r.unusual.length > 0 || r.duplicates.length > 0 || r.subscriptions.length > 0) && (
        <section className="card" aria-label="Gastos para revisar">
          <strong>Gastos para revisar</strong>
          <div className="legend">
            {r.unusual.map((u) => (
              <div className="legend-item" key={u.id}>
                <span className="pill">Inusual</span>
                <div className="grow">
                  <div className="ellipsis strong">{u.label}</div>
                  <div className="muted small-text">{shortDate(u.date)} · {u.category} · lo normal: {money(u.typical)}</div>
                </div>
                <span className="num strong over">{money(u.amount)}</span>
              </div>
            ))}
            {r.duplicates.map((d) => (
              <div className="legend-item" key={d.dates.join()}>
                <span className="pill">Repetido</span>
                <div className="grow">
                  <div className="ellipsis strong">{d.label}</div>
                  <div className="muted small-text">{d.dates.map(shortDate).join(' y ')} · {d.category}</div>
                </div>
                <span className="num strong">{money(d.amount)} ×{d.dates.length}</span>
              </div>
            ))}
            {r.subscriptions.map((s) => (
              <div className="legend-item" key={s.label}>
                <span className="pill">¿Fijo?</span>
                <div className="grow">
                  <div className="ellipsis strong">{s.label}</div>
                  <div className="muted small-text">{s.months} meses seguidos parecido · {s.category}</div>
                </div>
                <span className="num strong">~{money(s.amount)}</span>
              </div>
            ))}
          </div>
          <span className="muted small-text">Toca el gasto en «Movimientos» para corregirlo o bórralo si fue un error. Los fijos se marcan en Finanzas › Fijos.</span>
        </section>
      )}

      {rhythm && (
        <section className="card" aria-label="Hábitos de gasto">
          <strong>Cómo gastan</strong>
          <div className="tiles">
            <div className="tile">
              <span className="muted small-text">Días con gasto</span>
              <span className="amount-sm num">{rhythm.spendDays} de {rhythm.elapsed}</span>
            </div>
            <div className="tile">
              <span className="muted small-text">Cada compra, en promedio</span>
              <span className="amount-sm num">{money(rhythm.avgTicket)}</span>
              <span className="line-help">{rhythm.count} {rhythm.count === 1 ? 'gasto' : 'gastos'}</span>
            </div>
            {rhythm.weekendPct !== null && (
              <div className="tile">
                <span className="muted small-text">En fin de semana</span>
                <span className="amount-sm num">{rhythm.weekendPct} %</span>
                <span className="line-help">de lo gastado</span>
              </div>
            )}
            {rhythm.earlyPct !== null && (
              <div className="tile">
                <span className="muted small-text">Primeros 10 días</span>
                <span className="amount-sm num">{rhythm.earlyPct} %</span>
                <span className="line-help">de lo gastado</span>
              </div>
            )}
          </div>
          {r.top.length > 0 && (
            <div className="legend">
              {r.top.map((t, i) => (
                <div className="legend-item" key={`${t.label}-${i}`}>
                  <span className="muted small-text num">{i + 1}.</span>
                  <div className="grow">
                    <div className="ellipsis">{t.label}</div>
                    <div className="muted small-text">{shortDate(t.date)} · {t.category}</div>
                  </div>
                  <span className="num strong">{money(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}
