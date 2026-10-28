import { useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { isEmergencyGoal, savedInMonth } from '../lib/goals'
import { notifyPartner } from '../lib/push'
import { saidNoSavings, setSaidNoSavings } from '../lib/savingsAnswer'
import { monthName, digitsOnly, dots } from '../lib/ui'
import { monthKey } from '../lib/analysis'
import Spin from './Spin'
import type { Notify } from './Toast'

interface Props {
  hh: Household
  data: HouseholdData
  month: Date
  onToast: Notify
  /** Lleva a la pestaña Metas (cuando aún no hay ninguna para ahorrar) */
  onGoals?: () => void
}

/** Pregunta si este mes guardaste plata para ahorrar. Lo que contestes se descuenta de tu sueldo y se ve en el análisis. */
export default function SavingsCheck({ hh, data, month, onToast, onGoals }: Props) {
  const meId = hh.me.user_id
  const key = monthKey(month)
  const isCurrent = key === monthKey(new Date())
  const saved = savedInMonth(data.contributions, meId, key)
  const income = (data.salary?.amount ?? 0) + data.incomes.reduce((s, i) => s + i.amount, 0)
  const pct = income > 0 ? Math.round((saved * 100) / income) : null

  const [no, setNo] = useState(() => saidNoSavings(meId, key))
  const [adding, setAdding] = useState(false)
  const [goalId, setGoalId] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  const goals = data.goals
  const firstGoal = goals.find((g) => isEmergencyGoal(g.name)) ?? goals[0]
  const chosen = goals.find((g) => g.id === goalId) ?? firstGoal

  async function save() {
    const n = Number(amount)
    if (!chosen || !n || n <= 0) {
      setError('Escribe cuánto guardaste')
      return
    }
    setBusy(true)
    setError(null)
    const { data: created, error: err } = await supabase
      .from('contributions')
      .insert({ household_id: hh.household.id, goal_id: chosen.id, user_id: meId, amount: n })
      .select('id')
      .single()
    setBusy(false)
    if (err) {
      setError('No se pudo guardar el ahorro. Intenta de nuevo.')
      return
    }
    setSaidNoSavings(meId, key, false)
    setNo(false)
    setAdding(false)
    setAmount('')
    onToast(`Ahorro anotado\nSumaste **${money(n)}** a **${chosen.name}**. Se descontó de lo que te queda del sueldo.`)
    if (created) notifyPartner('contribution', created.id)
    await data.refresh()
  }

  function answerNo() {
    setSaidNoSavings(meId, key, true)
    setNo(true)
    setAdding(false)
  }

  const form = adding && (
    <div className="stack tight">
      {goals.length === 0 ? (
        <>
          <span className="muted small-text">Para anotar un ahorro primero crea una meta, por ejemplo «Fondo de emergencia».</span>
          {onGoals && (
            <button type="button" className="btn small" onClick={onGoals}>
              Crear una meta
            </button>
          )}
        </>
      ) : (
        <>
          {goals.length > 1 && (
            <div className="field">
              <label htmlFor="sv-goal">¿A cuál meta?</label>
              <select id="sv-goal" className="input" value={chosen?.id ?? ''} onChange={(e) => setGoalId(e.target.value)}>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="sv-amount">¿Cuánto guardaste?</label>
            <input
              id="sv-amount" autoComplete="off"
              className="input"
              inputMode="numeric"
              placeholder="Ej. 50000"
              value={dots(amount)}
              onChange={(e) => setAmount(digitsOnly(e.target.value))}
            />
          </div>
          <div className="row">
            <button type="button" className="btn small" disabled={busy} onClick={() => void save()}>
              {busy ? <Spin label="Guardando ahorro…" /> : 'Guardar ahorro'}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setAdding(false)}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )

  // Meses que ya pasaron: solo se muestra lo que hubo, no se pregunta
  if (!isCurrent && saved === 0) return null

  if (saved > 0) {
    return (
      <section className="card verdict ok">
        <strong>Tu ahorro de {monthName(month)}</strong>
        <span className="amount num">{money(saved)}</span>
        <span className="muted small-text">
          Guardaste esto este mes{pct !== null ? ` (${pct} % de lo que ganas)` : ''}. Ya está descontado de lo que te queda del sueldo.
        </span>
        {isCurrent && !adding && (
          <button type="button" className="btn ghost small" onClick={() => setAdding(true)}>
            Anotar otro ahorro
          </button>
        )}
        {form}
      </section>
    )
  }

  if (no) {
    return (
      <section className="card">
        <strong>Este mes no has guardado ahorro</strong>
        <span className="muted small-text">Está bien, pero ojo: un aporte chico y seguido rinde más que uno grande de vez en cuando.</span>
        {!adding && (
          <button type="button" className="btn ghost small" onClick={() => setAdding(true)}>
            Ya guardé algo
          </button>
        )}
        {form}
      </section>
    )
  }

  return (
    <section className="card">
      <strong>¿Guardaste algo de ahorro este mes?</strong>
      <span className="muted small-text">Lo que ahorres se descuenta de tu sueldo, así ves cuánto te queda de verdad.</span>
      {!adding ? (
        <div className="row">
          <button type="button" className="btn small" onClick={() => setAdding(true)}>
            Sí, guardé
          </button>
          <button type="button" className="btn ghost small" onClick={answerNo}>
            No, este mes no
          </button>
        </div>
      ) : (
        form
      )}
    </section>
  )
}
