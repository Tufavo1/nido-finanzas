import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { money, todayISO } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { digitsOnly, monthName, dots } from '../lib/ui'
import type { Notify } from './Toast'
import Icon from './Icon'
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
        {total > 0 ? <span className="cat-big num">{money(total)}</span> : <span className="muted">Sin ingresos extra este mes</span>}
        <span className="muted small-text">Bonos, ventas o trabajos aparte</span>
        <button type="button" className="btn small wide" onClick={() => setOpen(true)}>
          Agregar ingreso extra
        </button>
      </section>

      {data.incomes.length > 0 && (
        <>
          <strong>Historial de ingresos extra</strong>
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
                    <span className="muted small-text">Recibido el {fmt(x.received_on)}</span>
                  </span>
                  <span className="fixed-amount num">{money(x.amount)}</span>
                </span>
                <span className="card-cta" aria-hidden="true">
                  Toca para ver el detalle <Icon name="chevR" size={16} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {open && (
        <Modal label="Agregar ingreso extra" onClose={() => setOpen(false)}>
          <div className="card cat-sheet">
            <form className="stack cat-detail" onSubmit={(e) => void add(e)}>
              <div className="row between">
                <strong className="cat-title">Agregar ingreso extra</strong>
                <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
                  Cerrar
                </button>
              </div>
              <div className="field">
                <label htmlFor="inc-source">¿De dónde viene?</label>
                <input id="inc-source" className="input" maxLength={60} placeholder="Ej. Bono, venta, freelance"
                  value={source} onChange={(e) => setSource(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="inc-amount">Monto</label>
                <input id="inc-amount" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 50000" value={dots(amount)}
                  onChange={(e) => setAmount(digitsOnly(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="inc-date">Fecha en que lo recibiste</label>
                <input id="inc-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? <Spin label="Guardando ingreso…" /> : 'Guardar ingreso'}
              </button>
            </form>
          </div>
        </Modal>
      )}

      {selected && (
        <Modal label={`Detalle de ${selected.source}`} onClose={closeDetail}>
          <div className="card cat-sheet">
            {!editing ? (
              <div className="stack cat-detail">
                <div className="row between">
                  <span className="pill">🔒 Solo tú</span>
                  <button type="button" className="btn ghost small" onClick={closeDetail}>
                    Cerrar
                  </button>
                </div>
                <div className="stack tight">
                  <strong className="cat-title">{selected.source}</strong>
                  <span className="cat-big num">{money(selected.amount)}</span>
                </div>
                <div className="tiles">
                  <div className="tile">
                    <span className="muted small-text">Recibido el</span>
                    <span className="amount-sm">{fmt(selected.received_on)}</span>
                  </div>
                  <div className="tile">
                    <span className="muted small-text">Cuenta en</span>
                    <span className="amount-sm">Tu balance de {monthName(month)}</span>
                  </div>
                </div>
                <div className="stack tight">
                  <button type="button" className="btn" onClick={() => startEdit(selected)}>
                    Editar información
                  </button>
                  <button type="button" className={confirmId === selected.id ? 'btn danger' : 'btn ghost'} onClick={() => void remove(selected.id)}>
                    {confirmId === selected.id ? 'Toca otra vez para borrar' : 'Borrar ingreso'}
                  </button>
                </div>
              </div>
            ) : (
              <form className="stack cat-detail" onSubmit={(e) => void saveEdit(e, selected.id)}>
                <div className="row between">
                  <strong className="cat-title">Editar información</strong>
                  <button type="button" className="btn ghost small" onClick={closeDetail}>
                    Cerrar
                  </button>
                </div>
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
                  <label htmlFor="inc-ed-date">Fecha en que lo recibiste</label>
                  <input id="inc-ed-date" className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? <Spin label="Guardando cambios…" /> : 'Guardar cambios'}
                </button>
              </form>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
