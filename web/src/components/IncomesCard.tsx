import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { money, todayISO } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { digitsOnly, monthName, dots } from '../lib/ui'
import type { Notify } from './Toast'
import Modal from './Modal'
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)
  const selected = data.incomes.find((x) => x.id === selectedId) ?? null
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

  function startEdit(x: { source: string; amount: number; received_on: string }) {
    setSource(x.source)
    setAmount(String(x.amount))
    setDate(x.received_on.slice(0, 10))
    setEditing(true)
  }

  function closeDetail() {
    setSource('')
    setAmount('')
    setDate(todayISO())
    setSelectedId(null)
    setConfirmId(null)
    setEditing(false)
  }

  async function saveEdit(e: FormEvent, id: string) {
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
      .update({ amount: n, source: source.trim(), received_on: date || todayISO() })
      .eq('id', id)
    setBusy(false)
    if (err) {
      console.error(err)
      setError('No se pudo guardar el cambio. Intenta de nuevo.')
      return
    }
    setSource('')
    setAmount('')
    setDate(todayISO())
    closeDetail()
    onToast('Ingreso actualizado\nLos cambios ya cuentan en tu **balance**.')
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
    closeDetail()
    onToast('Ingreso borrado\nYa no cuenta en tu **balance** del mes.')
    await data.refresh()
  }

  const fmt = (iso: string) => `${Number(iso.slice(8, 10))} de ${monthName(new Date(`${iso.slice(0, 10)}T12:00:00`))}`

  return (
    <>
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
        <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
          + Agregar ingreso extra
        </button>
      </section>

      {data.incomes.length > 0 && (
        <div className="fixed-grid wide">
          {data.incomes.map((x) => (
            <button
              key={x.id}
              type="button"
              className="fixed-card"
              aria-haspopup="dialog"
              aria-label={`${x.source}, ${money(x.amount)}. Toca para ver el detalle`}
              onClick={() => setSelectedId(x.id)}
            >
              <span className="fixed-top">
                <span className="grow fixed-name">
                  <strong>{x.source}</strong>
                  <span className="muted small-text">Ingreso extra</span>
                </span>
                <span className="fixed-amount num">{money(x.amount)}</span>
              </span>
              <span className="fixed-next">
                <span className="fixed-date">
                  <span className="muted small-text">Recibido el</span>
                  <strong>{fmt(x.received_on)}</strong>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <Modal label="Agregar ingreso extra" onClose={() => setOpen(false)}>
          <form className="card" onSubmit={(e) => void add(e)}>
            <strong>Agregar ingreso extra</strong>
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
        </Modal>
      )}

      {selected && (
        <Modal label={`Detalle de ${selected.source}`} onClose={closeDetail}>
          <section className="card fixed-sheet">
            <div className="row between">
              <span className="pill">🔒 Solo tú</span>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={closeDetail}>
                ✕
              </button>
            </div>
            {!editing ? (
              <>
            <div className="fixed-hero">
              <strong className="fixed-title">{selected.source}</strong>
              <span className="amount num">{money(selected.amount)}</span>
            </div>
            <dl className="fixed-facts">
              <div>
                <dt>Recibido el</dt>
                <dd>{fmt(selected.received_on)}</dd>
              </div>
              <div>
                <dt>Cuenta en</dt>
                <dd>Tu balance de {monthName(month)}</dd>
              </div>
            </dl>
            <div className="fixed-sheet-actions">
              <button type="button" className="btn small" onClick={() => startEdit(selected)}>
                Editar
              </button>
              <button type="button" className={confirmId === selected.id ? 'btn danger small' : 'btn ghost small'} onClick={() => void remove(selected.id)}>
                {confirmId === selected.id ? 'Toca otra vez para borrar' : 'Borrar'}
              </button>
            </div>
              </>
            ) : (
              <form className="stack" onSubmit={(e) => void saveEdit(e, selected.id)}>
                <strong className="fixed-title">Editar ingreso extra</strong>
                <div className="field">
                  <label htmlFor="inc-ed-source">¿De dónde viene?</label>
                  <input id="inc-ed-source" className="input" maxLength={60} value={source} onChange={(e) => setSource(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="inc-ed-amount">Monto</label>
                  <input id="inc-ed-amount" autoComplete="off" className="input" inputMode="numeric" value={dots(amount)}
                    onChange={(e) => setAmount(digitsOnly(e.target.value))} />
                </div>
                <div className="field">
                  <label htmlFor="inc-ed-date">Fecha</label>
                  <input id="inc-ed-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="row">
                  <button className="btn small" type="submit" disabled={busy}>
                    {busy ? <Spin label="Guardando cambios…" /> : 'Guardar cambios'}
                  </button>
                  <button type="button" className="btn ghost small" onClick={closeDetail}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </section>
        </Modal>
      )}
    </>
  )
}
