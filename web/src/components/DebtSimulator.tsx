import { useState } from 'react'
import { extraPaymentEffect, payoffPlan } from '../lib/finance'
import { money } from '../lib/format'
import { digitsOnly } from '../lib/ui'

const SUGGESTED = [10_000, 20_000, 50_000]
const meses = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`

/** Cuánto se paga de interés en total y qué cambia si cada mes se paga algo más que la cuota */
export default function DebtSimulator({ remaining, payment, ratePct }: { remaining: number; payment: number; ratePct: number }) {
  const [extra, setExtra] = useState('')
  const plan = payoffPlan(remaining, payment, ratePct)
  if (remaining <= 0 || payment <= 0 || !plan) return null
  const n = Number(extra)
  const e = n > 0 ? extraPaymentEffect(remaining, payment, ratePct, n) : null

  return (
    <div className="stack tight">
      <span className="muted small-text">
        {ratePct > 0
          ? `Con la cuota de ${money(payment)}, terminas en ${meses(plan.months)} y en total pagas ${money(plan.interest)} de interés.`
          : `Con la cuota de ${money(payment)}, terminas en ${meses(plan.months)}.`}
      </span>
      {ratePct > 0 && (
        <>
          <span className="strong">¿Y si pagas más cada mes?</span>
          <div className="chips" role="group" aria-label="Pago extra mensual">
            {SUGGESTED.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={n === s} onClick={() => setExtra(String(s))}>
                + {money(s)}
              </button>
            ))}
          </div>
          <input className="input" inputMode="numeric" autoComplete="off" placeholder="Otro monto extra al mes" aria-label="Monto extra al mes" value={extra} onChange={(ev) => setExtra(digitsOnly(ev.target.value))} />
          {e && (
            <span className="notice" role="status">
              {e.monthsSaved > 0
                ? `Terminas en ${meses(e.withExtra.months)}, ${meses(e.monthsSaved)} antes, y te ahorras ${money(e.interestSaved)} de interés.`
                : `Terminas en ${meses(e.withExtra.months)}.`}
            </span>
          )}
          {n > 0 && !e && <span className="muted small-text">Ni con ese extra alcanza a cubrir el interés.</span>}
        </>
      )}
    </div>
  )
}
