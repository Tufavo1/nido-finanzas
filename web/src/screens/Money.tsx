import ScreenHelp from '../components/ScreenHelp'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import AnalysisPanel from '../components/AnalysisPanel'
import IncomesCard from '../components/IncomesCard'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import SectionHead from '../components/SectionHead'
import RecurringPanel from '../components/RecurringPanel'
import SalaryCalculator from '../components/SalaryCalculator'
import SavingsCheck from '../components/SavingsCheck'
import { isCustomSplit, percentOf, splitOf } from '../lib/split'
import ScopeBar from '../components/ScopeBar'
import { resolveScope, scopeDebts, scopeDebtShares } from '../lib/scope'
import type { Scope } from '../lib/scope'
import { monthIncome, monthsToPayoff, summarizeDebts } from '../lib/finance'
import type { DebtView } from '../lib/finance'
import { money, todayISO } from '../lib/format'
import { computeMetrics } from '../lib/metrics'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { daysUntil, digitsOnly, inDays, longDate, monthName, nextOccurrence, dots } from '../lib/ui'
import type { Notify } from '../components/Toast'
import type { MoneySection } from '../lib/engine'
import Spin from '../components/Spin'
import DebtGuidedForm from '../components/DebtGuidedForm'

interface Props {
  hh: Household
  data: HouseholdData
  month: Date
  onToast: Notify
  /** Pestaña con la que abre (al llegar desde un aviso) */
  section?: MoneySection
  /** De quién se ven los datos: el hogar o una persona */
  scope: Scope
  onScope: (s: Scope) => void
}

const KINDS = [
  { key: 'tarjeta', label: 'Tarjeta', help: 'Tarjeta de crédito o de una tienda.' },
  { key: 'credito', label: 'Crédito', help: 'Crédito de consumo, hipotecario o de auto.' },
  { key: 'prestamo', label: 'Préstamo', help: 'Dinero prestado por un banco, una persona o un familiar.' },
  { key: 'otro', label: 'Otra', help: 'Cualquier otra plata que se deba.' },
] as const

function Meter({ pct, level }: { pct: number; level: 'ok' | 'warn' | 'bad' }) {
  const color = level === 'ok' ? 'var(--accent)' : level === 'warn' ? 'var(--amber)' : 'var(--warn)'
  return (
    <div className="bar" aria-hidden="true">
      <span style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  )
}

/* ------------------------------ Sueldo ------------------------------ */
function SalaryPanel({ hh, data, month, onToast }: Props) {
  const { salary } = data
  const [editing, setEditing] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [amount, setAmount] = useState(salary ? String(salary.amount) : '')
  const [payDay, setPayDay] = useState(salary ? String(salary.pay_day) : '1')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  /** Guarda el sueldo y el día de pago; devuelve si se pudo */
  async function persist(n: number, d: number, ok: string): Promise<boolean> {
    if (!n || n <= 0) {
      setError('Ingresa un sueldo mayor a cero')
      return false
    }
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      setError('El día de pago debe estar entre 1 y 31')
      return false
    }
    setBusy(true)
    setError(null)
    const now = new Date().toISOString()
    // Sin upsert: la base solo permite modificar monto y día, no user_id ni household_id
    const { error: err } = salary
      ? await supabase
          .from('salaries')
          .update({ amount: n, pay_day: d, updated_at: now })
          .eq('user_id', hh.me.user_id)
      : await supabase
          .from('salaries')
          .insert({ user_id: hh.me.user_id, household_id: hh.household.id, amount: n, pay_day: d })
    setBusy(false)
    if (err) {
      console.error(err)
      setError('No se pudo guardar tu sueldo. Intenta de nuevo.')
      return false
    }
    setAmount(String(n))
    setPayDay(String(d))
    setEditing(false)
    onToast(ok)
    await data.refresh()
    return true
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    await persist(Number(amount), Number(payDay), 'Sueldo guardado\nTu **balance** del mes ya está al día.')
  }

  // Desde la calculadora: el líquido calculado pasa directo a tu sueldo mensual, sin pasos de más
  async function applyCalculated(liquido: number) {
    return persist(
      liquido,
      salary?.pay_day ?? (Number(payDay) || 1),
      `Sueldo calculado agregado\nTu sueldo mensual quedó en **${money(liquido)}**.`,
    )
  }

  return (
    <>
      <SectionHead title="Tu sueldo" hint="Lo que te depositan cada mes" />

      <div className="fixed-grid wide">
        <button
          type="button"
          className="fixed-card"
          aria-haspopup="dialog"
          aria-label={salary ? `Tu sueldo, ${money(salary.amount)}. Toca para ver el detalle` : 'Agregar mi sueldo'}
          onClick={() => (salary ? setViewing(true) : setEditing(true))}
        >
          <span className="fixed-top">
            <span className="grow fixed-name">
              <strong>Tu sueldo mensual</strong>
              <span className="muted small-text">🔒 Solo tú lo ves</span>
            </span>
            {salary && <span className="fixed-amount num">{money(salary.amount)}</span>}
          </span>
          <span className="fixed-next">
            <span className="fixed-date">
              <span className="muted small-text">{salary ? 'Te pagan' : 'Sin sueldo anotado'}</span>
              <strong>{salary ? `El día ${salary.pay_day} de cada mes` : 'Agrega tu sueldo'}</strong>
            </span>
          </span>
          <span className="card-cta" aria-hidden="true">
            {salary ? 'Toca para ver el detalle' : 'Toca para agregarlo'} <Icon name="chevR" size={16} />
          </span>
        </button>
      </div>

      {viewing && salary && (
        <Modal label="Detalle de tu sueldo" onClose={() => setViewing(false)}>
          <div className="card cat-sheet">
            <div className="stack cat-detail">
              <div className="row between">
                <strong className="cat-title">Tu sueldo</strong>
                <button type="button" className="btn ghost small" onClick={() => setViewing(false)}>
                  Cerrar
                </button>
              </div>
              <div className="stack tight">
                <span className="muted">Te depositan cada mes</span>
                <span className="cat-big num">{money(salary.amount)}</span>
                <span className="muted">🔒 {hh.members.length > 1 ? 'Tu pareja no ve este dato.' : 'Solo lo ves tú.'}</span>
              </div>
              <div className="tiles">
                <div className="tile">
                  <span className="muted small-text">Día de pago</span>
                  <span className="amount-sm num">El {salary.pay_day}</span>
                </div>
                <div className="tile">
                  <span className="muted small-text">Próximo pago</span>
                  <span className="amount-sm">{inDays(daysUntil(nextOccurrence(salary.pay_day)))}</span>
                  <span className="line-help">{longDate(nextOccurrence(salary.pay_day))}</span>
                </div>
                <div className="tile">
                  <span className="muted small-text">Equivale a</span>
                  <span className="amount-sm num">{money(Math.round(salary.amount / 30))}</span>
                  <span className="line-help">por día</span>
                </div>
                {data.incomes.length > 0 && (
                  <div className="tile">
                    <span className="muted small-text">Con ingresos extra</span>
                    <span className="amount-sm num">{money(monthIncome(salary, data.incomes))}</span>
                    <span className="line-help">este mes</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setViewing(false)
                  setEditing(true)
                }}
              >
                Editar información
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal label="Editar sueldo" onClose={() => setEditing(false)}>
          <div className="card cat-sheet">
            <form className="stack cat-detail" onSubmit={(e) => void save(e)}>
              <div className="row between">
                <strong className="cat-title">{salary ? 'Editar información' : 'Agregar mi sueldo'}</strong>
                <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>
                  Cerrar
                </button>
              </div>
              <span className="muted">🔒 {hh.members.length > 1 ? 'Tu pareja no ve este dato.' : 'Solo lo ves tú.'}</span>
              <div className="field">
                <label htmlFor="salary">Sueldo líquido mensual</label>
                <span className="line-help">Lo que te depositan, sin bonos ocasionales</span>
                <input
                  id="salary" autoComplete="off"
                  className="input"
                  inputMode="numeric"
                  placeholder="Ej. 1500000"
                  value={dots(amount)}
                  onChange={(e) => setAmount(digitsOnly(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="payday">¿Qué día del mes te pagan?</label>
                <select id="payday" className="input" value={payDay} onChange={(e) => setPayDay(e.target.value)}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Día {n}
                    </option>
                  ))}
                </select>
                {Number(payDay) >= 1 && Number(payDay) <= 31 && (
                  <span className="hint">Próximo pago: {longDate(nextOccurrence(Number(payDay)))} ({inDays(daysUntil(nextOccurrence(Number(payDay))))})</span>
                )}
              </div>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? <Spin label="Guardando sueldo…" /> : 'Guardar mi sueldo'}
              </button>
            </form>
          </div>
        </Modal>
      )}

      <SalaryCalculator onUse={applyCalculated} busy={busy} />

      {salary && (
        <>
          <SectionHead title="Tu ahorro" hint="Lo que apartas de tu sueldo este mes" />
          <SavingsCheck hh={hh} data={data} month={month} onToast={onToast} />
        </>
      )}
    </>
  )
}

/* ------------------------------ Deudas ------------------------------ */
function DebtCard({
  v,
  hh,
  data,
  onToast,
}: {
  v: DebtView
  hh: Household
  data: HouseholdData
  onToast: Notify
}) {
  const d = v.debt
  const [paying, setPaying] = useState(false)
  const [value, setValue] = useState(String(d.monthly_payment || ''))
  const [confirm, setConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [showPays, setShowPays] = useState(false)
  const [editPay, setEditPay] = useState<string | null>(null)
  const [pAmt, setPAmt] = useState('')
  const [pDate, setPDate] = useState('')
  const [payConfirm, setPayConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)
  const myPays = data.debtPayments.filter((p) => p.debt_id === d.id)
  const owner = d.owner_id ? hh.everyone.find((m) => m.user_id === d.owner_id) : null

  async function pay(e: FormEvent) {
    e.preventDefault()
    const n = Number(value)
    if (!n || n <= 0) {
      setError('Ingresa un monto mayor a cero')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('debt_payments').insert({
      household_id: hh.household.id,
      debt_id: d.id,
      amount: Math.min(n, v.remaining),
      paid_by: hh.me.user_id,
      paid_on: todayISO(),
    })
    setBusy(false)
    if (err) {
      setError('No se pudo registrar el pago')
      return
    }
    setPaying(false)
    onToast(`Pago registrado\nSe abonaron **${money(Math.min(n, v.remaining))}** a la deuda.`)
    await data.refresh()
  }

  async function removeDebt() {
    if (!confirm) {
      setConfirm(true)
      return
    }
    const { error: err } = await supabase.from('debts').delete().eq('id', d.id)
    setConfirm(false)
    if (err) {
      setError('No se pudo borrar la deuda')
      return
    }
    onToast('Deuda eliminada\nSe quitó junto con su **historial** de pagos.', 'info')
    await data.refresh()
  }

  async function savePayment(id: string) {
    const n = Number(pAmt)
    if (!n || n <= 0 || !pDate || pDate > todayISO()) {
      setError('Revisa el monto y que la fecha no sea futura')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('debt_payments').update({ amount: n, paid_on: pDate }).eq('id', id)
    setBusy(false)
    if (err) {
      setError('No se pudo corregir el pago')
      return
    }
    setEditPay(null)
    await data.refresh()
  }

  async function deletePayment(id: string) {
    if (payConfirm !== id) {
      setPayConfirm(id)
      return
    }
    const { error: err } = await supabase.from('debt_payments').delete().eq('id', id)
    setPayConfirm(null)
    if (err) {
      setError('No se pudo borrar el pago')
      return
    }
    onToast('Pago eliminado\nEl **saldo** de la deuda se recalculó.', 'info')
    await data.refresh()
  }

  async function archive() {
    const { error: err } = await supabase.from('debts').update({ archived: true }).eq('id', d.id)
    if (err) {
      setError('No se pudo archivar')
      return
    }
    onToast('Deuda archivada\nYa no cuenta en tus **cuotas** mensuales.', 'info')
    await data.refresh()
  }

  const done = v.remaining === 0
  const close = () => {
    setOpen(false)
    setEditing(false)
    setConfirm(false)
    setPaying(false)
    setError(null)
  }
  const nextDue = d.due_day && !done ? nextOccurrence(d.due_day) : null
  const dueLeft = nextDue ? daysUntil(nextDue) : null
  const level = v.progressPct >= 70 ? 'ok' : 'warn'
  const kindLabel = KINDS.find((k) => k.key === d.kind)?.label ?? 'Otra'
  const card = (
    <button
      type="button"
      className={`fixed-card${done ? ' paused' : ''}${dueLeft !== null && dueLeft <= 3 ? ' soon' : ''}`}
      aria-haspopup="dialog"
      aria-label={`${d.name}, falta pagar ${money(v.remaining)}. Toca para ver el detalle`}
      onClick={() => setOpen(true)}
    >
      <span className="fixed-top">
        <span className="grow fixed-name">
          <strong>{d.name}</strong>
          <span className="muted small-text">
            {kindLabel} · {owner ? owner.display_name : 'De los dos'}
          </span>
        </span>
        <span className="fixed-amount num">{money(v.remaining)}</span>
      </span>
      <Meter pct={v.progressPct} level={level} />
      <span className="row between muted small-text">
        <span>Pagado {v.progressPct} %</span>
        <span>{done ? 'Saldada 🎉' : v.months === null ? 'Sin fecha de término' : `Faltan ~${v.months} ${v.months === 1 ? 'mes' : 'meses'}`}</span>
      </span>
      <span className="card-cta" aria-hidden="true">
        Toca para ver el detalle <Icon name="chevR" size={16} />
      </span>
    </button>
  )
  if (!open) return card
  if (editing)
    return (
      <>
        {card}
        <Modal label={`Editar ${d.name}`} onClose={close}>
          <DebtForm hh={hh} data={data} existing={d} onClose={() => setEditing(false)} onToast={onToast} />
        </Modal>
      </>
    )
  return (
    <>
      {card}
      <Modal label={`Detalle de ${d.name}`} onClose={close}>
        <div className="card cat-sheet">
          <div className="stack cat-detail">
            <div className="row between">
              <span className="pill">{kindLabel} · {owner ? owner.display_name : 'De los dos'}</span>
              <button type="button" className="btn ghost small" onClick={close}>
                Cerrar
              </button>
            </div>

            <div className="stack tight">
              <strong className="cat-title">{d.name}</strong>
              <span className="muted">{done ? 'Ya no se debe nada' : 'Todavía falta pagar'}</span>
              <span className="cat-big num">{money(v.remaining)}</span>
              <span className="muted">La deuda era de {money(d.original_amount)}</span>
            </div>

            <div className="stack tight">
              <div className="bar cat-bar" role="img" aria-label={`${v.progressPct} % pagado`}>
                <span style={{ width: `${Math.min(100, v.progressPct)}%`, background: 'var(--accent)' }} />
              </div>
              <span className="muted small-text">{v.progressPct} % pagado</span>
            </div>

            <div className="tiles">
              <div className="tile">
                <span className="muted small-text">Cuota al mes</span>
                <span className="amount-sm num">{d.monthly_payment > 0 ? money(d.monthly_payment) : 'Sin definir'}</span>
              </div>
              <div className="tile">
                <span className="muted small-text">Interés</span>
                <span className="amount-sm num">{d.monthly_rate > 0 ? `${d.monthly_rate} % al mes` : 'Sin interés'}</span>
              </div>
              <div className="tile">
                <span className="muted small-text">Terminan de pagar</span>
                <span className="amount-sm">{done ? 'Saldada 🎉' : v.months === null ? 'Sin fecha' : `En ~${v.months} ${v.months === 1 ? 'mes' : 'meses'}`}</span>
              </div>
              <div className="tile">
                <span className="muted small-text">Vence</span>
                <span className="amount-sm">{d.due_day ? `El día ${d.due_day}` : 'Sin día'}</span>
                {nextDue && dueLeft !== null && <span className="line-help">{inDays(dueLeft)}</span>}
              </div>
            </div>

            {!done && d.monthly_payment > 0 && (
              <p className={v.paidThisMonth >= d.monthly_payment ? 'cat-verdict' : 'muted'}>
                {v.paidThisMonth >= d.monthly_payment
                  ? 'La cuota de este mes ya está pagada ✓'
                  : `Este mes han pagado ${money(v.paidThisMonth)} de ${money(d.monthly_payment)}`}
              </p>
            )}

            {paying ? (
              <form className="stack cat-edit" onSubmit={(e) => void pay(e)}>
                <div className="field">
                  <label htmlFor={`pay-${d.id}`}>¿Cuánto pagaste?</label>
                  <input
                    id={`pay-${d.id}`}
                    className="input"
                    inputMode="numeric"
                    value={dots(value)}
                    onChange={(e) => setValue(digitsOnly(e.target.value))}
                  />
                  <span className="hint">Solo anota el pago en la app; no mueve plata de tu banco.</span>
                </div>
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? <Spin label="Registrando pago…" /> : 'Guardar el pago'}
                </button>
                <button type="button" className="btn ghost" onClick={() => setPaying(false)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <div className="stack tight">
                {done ? (
                  <button type="button" className="btn" onClick={() => void archive()}>
                    Guardar en el archivo (ya está pagada)
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => setPaying(true)}>
                    Anotar un pago
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={() => setEditing(true)}>
                  Editar información
                </button>
                <button type="button" className={confirm ? 'btn danger' : 'btn ghost'} onClick={() => void removeDebt()}>
                  {confirm ? 'Toca otra vez para borrar' : 'Borrar deuda'}
                </button>
              </div>
            )}

            {myPays.length > 0 && (
              <div className="stack tight cat-edit">
                <button type="button" className="link-btn" aria-expanded={showPays} onClick={() => setShowPays((x) => !x)}>
                  {showPays ? 'Ocultar los pagos' : `Ver los pagos anotados (${myPays.length})`}
                </button>
                {showPays &&
                  myPays.map((p) =>
                    editPay === p.id ? (
                      <div className="stack tight item-edit" key={p.id}>
                        <input className="input" inputMode="numeric" value={dots(pAmt)} onChange={(e) => setPAmt(digitsOnly(e.target.value))} aria-label="Monto del pago" />
                        <input className="input" type="date" max={todayISO()} value={pDate} onChange={(e) => setPDate(e.target.value)} aria-label="Fecha del pago" />
                        <div className="row">
                          <button type="button" className="btn small" disabled={busy} onClick={() => void savePayment(p.id)}>
                            {busy ? <Spin label="Guardando pago…" /> : 'Guardar'}
                          </button>
                          <button type="button" className="btn ghost small" onClick={() => setEditPay(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="item" key={p.id}>
                        <button
                          type="button"
                          className="item-main grow muted small-text"
                          aria-label="Corregir pago"
                          onClick={() => {
                            setEditPay(p.id)
                            setPAmt(String(p.amount))
                            setPDate(p.paid_on)
                          }}
                        >
                          {hh.everyone.find((m) => m.user_id === p.paid_by)?.display_name ?? ''} · {p.paid_on.slice(8, 10)}/{p.paid_on.slice(5, 7)} · toca para corregir
                        </button>
                        <span className="num">{money(p.amount)}</span>
                        <button
                          type="button"
                          className={payConfirm === p.id ? 'txt-btn warn' : 'txt-btn'}
                          aria-label={payConfirm === p.id ? 'Confirmar borrado del pago' : 'Borrar pago'}
                          onClick={() => void deletePayment(p.id)}
                        >
                          {payConfirm === p.id ? '¿Seguro?' : 'Borrar'}
                        </button>
                      </div>
                    ),
                  )}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

function DebtEditForm({
  hh,
  data,
  onClose,
  onToast,
  existing,
}: {
  hh: Household
  data: HouseholdData
  onClose: () => void
  onToast: Notify
  existing?: HouseholdData['debts'][number]
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<(typeof KINDS)[number]['key']>((existing?.kind as (typeof KINDS)[number]['key']) ?? 'tarjeta')
  const [owner, setOwner] = useState<string>(existing?.owner_id ?? '')
  const [total, setTotal] = useState(existing ? String(existing.original_amount) : '')
  const [fee, setFee] = useState(existing && existing.monthly_payment ? String(existing.monthly_payment) : '')
  const [rate, setRate] = useState(existing && existing.monthly_rate ? String(existing.monthly_rate).replace('.', ',') : '')
  const [due, setDue] = useState(existing?.due_day ? String(existing.due_day) : '')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const orig = Number(total)
    const r = Number(rate.replace(',', '.') || '0')
    const dueDay = due ? Number(due) : null
    if (!name.trim()) return setError('Ponle un nombre a la deuda')
    if (!orig || orig <= 0) return setError('Ingresa cuánto deben en total')
    if (Number.isNaN(r) || r < 0 || r > 30) return setError('El interés mensual debe estar entre 0 y 30 %')
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) return setError('El día de vencimiento va de 1 a 31')
    setBusy(true)
    setError(null)
    const fields = {
      name: name.trim(),
      kind,
      owner_id: owner || null,
      original_amount: orig,
      monthly_payment: Number(fee || '0'),
      monthly_rate: r,
      due_day: dueDay,
    }
    const { error: err } = existing
      ? await supabase.from('debts').update(fields).eq('id', existing.id)
      : await supabase.from('debts').insert({ household_id: hh.household.id, ...fields })
    setBusy(false)
    if (err) {
      setError('No se pudo guardar la deuda')
      return
    }
    onToast(existing ? 'Deuda actualizada\nSus **cuotas** y saldo se recalcularon.' : 'Deuda agregada\nYa aparece en tu plan de **pago**.')
    onClose()
    await data.refresh()
  }

  const payoff =
    Number(fee) > 0 && Number(total) > 0 ? monthsToPayoff(Number(total), Number(fee), Number(rate.replace(',', '.') || '0') || 0) : undefined

  return (
    <div className="card cat-sheet">
      <form className="stack cat-detail" onSubmit={(e) => void submit(e)}>
        <div className="row between">
          <strong className="cat-title">Editar información</strong>
          <button className="btn ghost small" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="field">
          <label htmlFor="d-name">Nombre</label>
          <input id="d-name" className="input" maxLength={60} placeholder="Ej. Tarjeta Banco Estado" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="d-kind">Tipo de deuda</label>
          <select id="d-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number]['key'])}>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        {hh.members.length > 1 && (
          <div className="field">
            <span id="d-owner" className="strong">¿Quién la debe?</span>
            <div className="seg" role="group" aria-labelledby="d-owner">
              <button type="button" aria-pressed={owner === ''} onClick={() => setOwner('')}>
                Los dos
              </button>
              {hh.members.map((m) => (
                <button key={m.user_id} type="button" aria-pressed={owner === m.user_id} onClick={() => setOwner(m.user_id)}>
                  {m.user_id === hh.me.user_id ? 'Yo' : m.display_name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="d-total">Lo que falta pagar (CLP)</label>
          <input id="d-total" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 800000" value={dots(total)} onChange={(e) => setTotal(digitsOnly(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="d-fee">Cuota al mes (CLP)</label>
          <input id="d-fee" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 65000" value={dots(fee)} onChange={(e) => setFee(digitsOnly(e.target.value))} />
          {payoff === null && <span className="hint">Con esa cuota la deuda no baja: conviene subirla.</span>}
          {typeof payoff === 'number' && <span className="hint">Terminarían de pagar en ~{payoff} {payoff === 1 ? 'mes' : 'meses'}.</span>}
        </div>
        <div className="field">
          <label htmlFor="d-rate">Interés al mes (%)</label>
          <input id="d-rate" autoComplete="off" className="input" inputMode="decimal" placeholder="Ej. 2,5 (vacío si no cobra)" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))} />
        </div>
        <div className="field">
          <label htmlFor="d-due">¿Qué día vence la cuota?</label>
          <select id="d-due" className="input" value={due} onChange={(e) => setDue(e.target.value)}>
            <option value="">Sin día</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Día {n}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? <Spin label="Guardando deuda…" /> : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}

/** Deuda nueva: flujo guiado. Editar una existente: el formulario completo. */
function DebtForm(props: { hh: Household; data: HouseholdData; onClose: () => void; onToast: Notify; existing?: HouseholdData['debts'][number]; defaultOwner?: string }) {
  return props.existing ? <DebtEditForm {...props} /> : <DebtGuidedForm hh={props.hh} data={props.data} onClose={props.onClose} onToast={props.onToast} defaultOwner={props.defaultOwner} />
}

/** Cuánto se deben entre ustedes por los gastos compartidos del mes (quién puso más plata). */
function BetweenUs({ hh, data, month, onToast }: Pick<Props, 'hh' | 'data' | 'month' | 'onToast'>) {
  const split = useMemo(() => splitOf(hh.members), [hh.members])
  const m = useMemo(
    () => computeMetrics(data.expenses, data.prevExpenses, data.categories, hh.members, month),
    [data.expenses, data.prevExpenses, data.categories, hh.members, month],
  )
  if (hh.members.length < 2) return null
  const s = m.settle
  const meId = hh.me.user_id
  const mine = m.people.find((p) => p.userId === meId)
  const other = m.people.find((p) => p.userId !== meId)

  let main = 'Están a mano: nadie le debe plata al otro.'
  let help = 'Cada uno ha puesto lo que le corresponde en los gastos compartidos.'
  let level: 'ok' | 'warn' = 'ok'
  if (s && s.amount > 0) {
    const iOwe = s.from.userId === meId
    main = iOwe
      ? `Tú le debes ${money(s.amount)} a ${s.to.name}`
      : `${s.from.name} te debe ${money(s.amount)} a ti`
    help = iOwe
      ? `${s.to.name} pagó más de los gastos compartidos de ${monthName(month)}. Para quedar a mano, devuélvele esa plata.`
      : `Tú pagaste más de los gastos compartidos de ${monthName(month)}. Para quedar a mano, ${s.from.name} te la devuelve.`
    level = iOwe ? 'warn' : 'ok'
  } else if (m.shared === 0) {
    main = 'Aún no hay gastos compartidos este mes.'
    help = 'Cuando anoten un gasto **compartido**, aquí verán quién le debe dinero a quién.'
  }

  return (
    <section className={`card verdict ${level}`}>
      <strong>Entre ustedes dos</strong>
      <span className="owe-main">{main}</span>
      <span className="muted small-text">{help}</span>
      {mine && other && m.shared > 0 && (
        <span className="line-help">
          Gastos compartidos de {monthName(month)}: {money(m.shared)}. Tú pusiste {money(mine.paidShared)} y {other.name}{' '}
          puso {money(other.paidShared)}; a ti te toca {money(mine.fairShare)} ({percentOf(split, meId)} %).
        </span>
      )}
      <span className="line-help">
        Este saldo sale solo de los gastos compartidos del mes que estás viendo. Cambia el mes arriba para ver otros.
      </span>
      <SplitSetting hh={hh} data={data} split={split} onToast={onToast} custom={isCustomSplit(split)} />
    </section>
  )
}

/** Cómo se reparten los gastos compartidos: por defecto mitad y mitad, o el porcentaje que acuerden. */
function SplitSetting({ hh, data, split, custom, onToast }: Pick<Props, 'hh' | 'data' | 'onToast'> & { split: ReturnType<typeof splitOf>; custom: boolean }) {
  const meId = hh.me.user_id
  const other = hh.members.find((m) => m.user_id !== meId)
  const mine = percentOf(split, meId)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(mine))
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  async function apply(pct: number | null) {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.rpc('set_expense_split', { pct })
    setBusy(false)
    if (err) {
      console.error(err)
      setError('No se pudo cambiar el reparto. Intenta de nuevo.')
      return
    }
    setEditing(false)
    onToast(pct === null ? 'Reparto a mitad y mitad\nLos gastos compartidos se dividen por igual.' : `Reparto guardado\nTú pones el **${pct} %** de lo compartido y ${other?.display_name ?? 'tu pareja'} el **${100 - pct} %**.`)
    await data.refresh()
  }

  if (!other) return null
  const n = Number(value)
  const valid = Number.isInteger(n) && n >= 1 && n <= 99

  return (
    <div className="stack tight">
      <strong className="small-text">Reparto de lo compartido</strong>
      <span className="muted small-text">
        {custom ? `Tú ${mine} % · ${other.display_name} ${100 - mine} %` : 'Mitad y mitad (50 % cada uno)'}
      </span>
      {!editing ? (
        <button type="button" className="btn ghost small" onClick={() => { setValue(String(mine)); setEditing(true) }}>
          Cambiar el reparto
        </button>
      ) : (
        <>
          <span className="line-help">Útil si uno gana más y acordaron que ponga una parte mayor. Vale para todos los gastos, fijos y deudas compartidas.</span>
          <div className="chips" role="group" aria-label="Tu parte de lo compartido">
            {[30, 40, 50, 60, 70].map((p) => (
              <button key={p} type="button" className="chip" aria-pressed={value === String(p)} onClick={() => setValue(String(p))}>
                {p} %
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="split-pct">Tu parte (de 1 a 99 %)</label>
            <input id="split-pct" className="input" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            {valid && <span className="hint">{other.display_name} pondría el {100 - n} %.</span>}
          </div>
          <div className="row">
            <button type="button" className="btn small" disabled={busy || !valid} onClick={() => void apply(n)}>
              {busy ? <Spin label="Guardando reparto…" /> : 'Guardar reparto'}
            </button>
            {custom && (
              <button type="button" className="btn ghost small" disabled={busy} onClick={() => void apply(null)}>
                Volver a mitad y mitad
              </button>
            )}
            <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function DebtsPanel({ hh, data, month, onToast, scope }: Props) {
  const [adding, setAdding] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const who = resolveScope(scope, hh.members)
  const debts = scopeDebts(data.debts, who)
  const real = summarizeDebts(debts, data.debtPayments)
  // Para una persona, las deudas compartidas cuentan solo su parte en los totales y el análisis
  const mine = scopeDebtShares(data.debts, data.debtPayments, who, splitOf(hh.members))
  const s = summarizeDebts(mine.debts, mine.payments)
  const empty = debts.length === 0
  const person = hh.members.find((m) => m.user_id === who)

  const PAGE = 2
  const views = real.views
  const shown = showAll ? views : views.slice(0, PAGE)

  return (
    <>
      <SectionHead
        title={who === 'all' ? 'Deudas del hogar' : who === hh.me.user_id ? 'Tus deudas' : `Deudas de ${person?.display_name ?? 'tu pareja'}`}
        hint="Cuánto falta pagar y cuándo terminan"
      />

      {who === 'all' && <BetweenUs hh={hh} data={data} month={month} onToast={onToast} />}

      {s.remaining > 0 && (
        <section className="card">
          <span className="muted">Falta pagar en total</span>
          <span className="cat-big num">{money(s.remaining)}</span>
          <div className="tiles">
            <div className="tile">
              <span className="muted small-text">Cuotas al mes</span>
              <span className="amount-sm num">{money(s.monthly)}</span>
            </div>
            <div className="tile">
              <span className="muted small-text">Intereses</span>
              <span className="amount-sm num">~{money(s.interest)}</span>
            </div>
          </div>
          {s.freeInMonths !== null && s.freeInMonths > 0 && (
            <span className="muted small-text">
              Terminan de pagar todo en ~{s.freeInMonths} {s.freeInMonths === 1 ? 'mes' : 'meses'}
            </span>
          )}
        </section>
      )}

      {empty && (
        <section className="card wide">
          <strong>{person && data.debts.length > 0 ? `${who === hh.me.user_id ? 'No tienes' : `${person.display_name} no tiene`} deudas anotadas` : 'Todavía no hay deudas anotadas'}</strong>
          <span className="muted">
            {person && data.debts.length > 0 ? 'Cambia a Hogar para ver todas.' : 'Si tienen una tarjeta, un crédito o un préstamo, agrégalo para llevar el control.'}
          </span>
        </section>
      )}

      {views.length > 0 && (
        <>
          <SectionHead title="Cada deuda" hint="Toca una para ver todo, anotar un pago, editarla o borrarla" />
          <div className="fixed-grid wide">
            {shown.map((v) => (
              <DebtCard key={v.debt.id} v={v} hh={hh} data={data} onToast={onToast} />
            ))}
          </div>
          {views.length > PAGE && (
            <button type="button" className="btn ghost small wide" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Ver menos deudas' : `Ver más (${views.length - PAGE} deudas más)`}
            </button>
          )}
        </>
      )}

      <button type="button" className="btn small wide" onClick={() => setAdding(true)}>
        Agregar deuda
      </button>
      {adding && (
        <Modal label="Agregar una deuda" onClose={() => setAdding(false)}>
          <DebtForm hh={hh} data={data} onClose={() => setAdding(false)} onToast={onToast} defaultOwner={who === 'all' ? '' : who} />
        </Modal>
      )}
    </>
  )
}

/* ------------------------------- Pantalla ------------------------------ */
export default function Money(props: Props) {
  const [tab, setTab] = useState<MoneySection>(props.section ?? 'analysis')
  const { data } = props
  const who = resolveScope(props.scope, props.hh.members)
  const partner = who !== 'all' && who !== props.hh.me.user_id ? props.hh.members.find((m) => m.user_id === who) : undefined
  // El sueldo y el análisis personal son privados: de tu pareja no se pueden ver
  const privateNotice = partner && (
    <section className="card">
      <strong>Esto es privado</strong>
      <span className="muted">
        El sueldo, los ingresos y el análisis personal de {partner.display_name} solo los ve esa persona. Puedes mirar sus gastos fijos y sus deudas en las otras pestañas.
      </span>
    </section>
  )

  return (
    <main className="screen plata">
      <div className="row between">
        <h1 className="title">Mis finanzas</h1>
        <ScreenHelp screen="money" />
      </div>
      <ScopeBar hh={props.hh} scope={who} onScope={props.onScope} label="Ver las finanzas de" />

      {!data.financeReady ? (
        <section className="card">
          <strong>Falta activar esta sección</strong>
          <span className="muted">
            La base de datos aún no tiene las tablas de sueldo y deudas. Aplica la migración
            <strong>20261018050000_sueldo_deudas</strong> y recarga.
          </span>
          <button type="button" className="btn small" onClick={() => void data.refresh()}>
            Reintentar
          </button>
        </section>
      ) : (
        <>
          {data.financeStale && (
            <p className="notice" role="status">
              No se pudo actualizar sueldo y deudas; ves los últimos datos cargados.{' '}
              <button type="button" className="btn small" onClick={() => void data.refresh()}>
                Reintentar
              </button>
            </p>
          )}
          <div className="seg" role="group" aria-label="Sección">
            <button type="button" aria-pressed={tab === 'analysis'} onClick={() => setTab('analysis')}>
              Análisis
            </button>
            <button type="button" aria-pressed={tab === 'salary'} onClick={() => setTab('salary')}>
              Sueldo
            </button>
            <button type="button" aria-pressed={tab === 'fixed'} onClick={() => setTab('fixed')}>
              Fijos
            </button>
            <button type="button" aria-pressed={tab === 'debts'} onClick={() => setTab('debts')}>
              Deudas
            </button>
          </div>
          {tab === 'analysis' &&
            (privateNotice ?? (
              <AnalysisPanel {...props} onGoSalary={() => setTab('salary')} />
            ))}
          {tab === 'salary' &&
            (who === 'all' ? (
              <section className="card">
                <strong>El sueldo es personal</strong>
                <span className="muted">Cada uno ve solo el suyo. Cambia a «Yo» para ver y editar tu sueldo.</span>
                <button type="button" className="btn small wide" onClick={() => props.onScope(props.hh.me.user_id)}>
                  Ver mi sueldo
                </button>
              </section>
            ) : privateNotice ?? (
              <>
                <SalaryPanel {...props} />
                <SectionHead title="Ingresos extra" hint="Bonos, ventas o trabajos aparte" />
                <IncomesCard {...props} />
              </>
            ))}
          {tab === 'fixed' && <RecurringPanel {...props} />}
          {tab === 'debts' && <DebtsPanel {...props} />}
        </>
      )}
    </main>
  )
}
