import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { money, todayISO } from '../lib/format'
import { supabase } from '../lib/supabase'
import { digitsOnly, monthName, dots } from '../lib/ui'
import type { Notify } from './Toast'
import Spin from './Spin'

interface Props {
  hh: Household
  data: HouseholdData
  month: Date
  onToast: Notify
}

/** Ingresos extra del mes (bonos, ventas, honorarios). Privados: la pareja no los ve. */
export default function IncomesCard({ hh, data, month, onToast }: Props) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = data.incomes.reduce((s, x) => s + x.amount, 0)

  async function add(e: FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    if (!source.trim() || n <= 0) {
      setError('Pon de dónde viene y un monto mayor a cero')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from('incomes')
      .insert({ household_id: hh.household.id, amount: n, source: source.trim(), received_on: date || todayISO() })
    setBusy(false)
    if (err) {
      console.error(err)
      setError('No se pudo guardar el ingreso. Intenta de nuevo.')
      return
    }
    setSource('')
    setAmount('')
    setDate(todayISO())
    setOpen(false)
    onToast('Ingreso extra guardado\nSe sumó a tu **balance** del mes.')
    await data.refresh()
  }

  async function remove(id: string) {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    setConfirmId(null)
    const { error: err } = await supabase.from('incomes').delete().eq('id', id)
    if (err) {
      setError('No se pudo borrar el ingreso')
      return
    }
    await data.refresh()
  }

  return (
    <section className="card" aria-label="Otros ingresos">
      <div className="row between">
        <strong>Ingresos extra de {monthName(month)}</strong>
        <span className="pill">🔒 Solo tú</span>
      </div>
      <span className="muted small-text">
        ¿Te llegó plata extra además del sueldo? Por ejemplo un bono, una venta o un trabajo aparte. Anótala aquí y se suma
        para calcular cuánto te queda.
      </span>
      {total > 0 && <span className="amount num">{money(total)}</span>}
      {data.incomes.length > 0 && (
        <div>
          {data.incomes.map((x) => (
            <div className="item" key={x.id}>
              <div className="grow">
                <div className="ellipsis">{x.source}</div>
                <div className="muted small-text">
                  {x.received_on.slice(8, 10)}/{x.received_on.slice(5, 7)}
                </div>
              </div>
              <span className="num">{money(x.amount)}</span>
              <button
                type="button"
                className={confirmId === x.id ? 'txt-btn warn' : 'txt-btn'}
                aria-label={confirmId === x.id ? 'Confirmar borrado' : `Borrar ingreso ${x.source}`}
                onClick={() => void remove(x.id)}
              >
                {confirmId === x.id ? '¿Seguro?' : 'Borrar'}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {open ? (
        <form className="stack tight" onSubmit={(e) => void add(e)}>
          <div className="field">
            <label htmlFor="inc-source">¿De dónde viene?</label>
            <input id="inc-source" className="input" maxLength={60} placeholder="Ej. Bono, venta, freelance"
              value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
          <div className="row">
            <div className="field grow">
              <label htmlFor="inc-amount">Monto</label>
              <input id="inc-amount" autoComplete="off" className="input" inputMode="numeric" value={dots(amount)}
                onChange={(e) => setAmount(digitsOnly(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="inc-date">Fecha</label>
              <input id="inc-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <button className="btn small" type="submit" disabled={busy}>
              {busy ? <Spin label="Guardando ingreso…" /> : 'Guardar ingreso'}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
          Agregar ingreso extra
        </button>
      )}
    </section>
  )
}
