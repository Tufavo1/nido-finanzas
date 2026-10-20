import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import AnalysisPanel from '../components/AnalysisPanel'
import Icon from '../components/Icon'
import IncomesCard from '../components/IncomesCard'
import RecurringPanel from '../components/RecurringPanel'
import { analyzeSalary, monthIncome, myDebtShare, summarizeDebts } from '../lib/finance'
import type { DebtView, Finding } from '../lib/finance'
import { money, todayISO } from '../lib/format'
import { computeMetrics } from '../lib/metrics'
import { supabase } from '../lib/supabase'
import { digitsOnly, memberColor, monthName } from '../lib/ui'

interface Props {
  hh: Household
  data: HouseholdData
  month: Date
  onToast: (text: string) => void
}

const KINDS = [
  { key: 'tarjeta', label: 'Tarjeta' },
  { key: 'credito', label: 'Crédito' },
  { key: 'prestamo', label: 'Préstamo' },
  { key: 'otro', label: 'Otra' },
] as const

const MARK = { ok: '✓', warn: '!', bad: '✕' } as const
const LEVEL_WORD = { ok: 'Bien', warn: 'Ojo', bad: 'Mal' } as const

function Findings({ list }: { list: Finding[] }) {
  return (
    <div className="stack tight">
      {list.map((f, i) => (
        <div className={`find ${f.level}`} key={i}>
          <span className="find-mark" aria-label={LEVEL_WORD[f.level]}>
            {MARK[f.level]}
          </span>
          <div>
            <div className="strong">{f.title}</div>
            <div className="muted small-text">{f.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

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
  const [editing, setEditing] = useState(!salary)
  const [amount, setAmount] = useState(salary ? String(salary.amount) : '')
  const [payDay, setPayDay] = useState(salary ? String(salary.pay_day) : '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const metrics = computeMetrics(data.expenses, data.prevExpenses, data.categories, hh.members, month)
  const me = metrics.people.find((p) => p.userId === hh.me.user_id)
  const commitments = myDebtShare(data.debts, data.debtPayments, hh.me.user_id, hh.members.length)
  const isCurrent = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth()

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    const d = Number(payDay)
    if (!n || n <= 0) {
      setError('Ingresa un sueldo mayor a cero')
      return
    }
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      setError('El día de pago debe estar entre 1 y 31')
      return
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
      return
    }
    setEditing(false)
    onToast('Sueldo guardado')
    await data.refresh()
  }

  const a = salary
    ? analyzeSalary({ income: monthIncome(salary, data.incomes), spent: me?.trueCost ?? 0, commitments, month })
    : null

  return (
    <>
      <section className="card">
        <div className="row between">
          <strong>Tu sueldo mensual</strong>
          <span className="pill">🔒 Solo tú lo ves</span>
        </div>
        {!editing && salary ? (
          <>
            <span className="amount num">{money(salary.amount)}</span>
            <span className="muted small-text">Te pagan el día {salary.pay_day} de cada mes.</span>
            <button type="button" className="btn ghost small" onClick={() => setEditing(true)}>
              Cambiar
            </button>
          </>
        ) : (
          <form className="stack tight" onSubmit={(e) => void save(e)}>
            <span className="muted small-text">
              {hh.members.length > 1
                ? 'Tu pareja no puede ver este dato: ni el monto ni los resultados de esta pantalla.'
                : 'Este dato es privado y solo lo ves tú.'}
            </span>
            <div className="field">
              <label htmlFor="salary">Sueldo líquido (lo que te llega al banco)</label>
              <input
                id="salary"
                className="input"
                inputMode="numeric"
                placeholder="Ej. 1500000"
                value={amount}
                onChange={(e) => setAmount(digitsOnly(e.target.value))}
              />
              {amount && <span className="hint num">{money(Number(amount))}</span>}
            </div>
            <div className="field">
              <label htmlFor="payday">Día del mes en que te pagan</label>
              <input
                id="payday"
                className="input"
                inputMode="numeric"
                value={payDay}
                onChange={(e) => setPayDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              />
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="row">
              <button className="btn small" type="submit" disabled={busy}>
                Guardar
              </button>
              {salary && (
                <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      {a && salary && (
        <>
          <section className={`card verdict ${a.level}`}>
            <span className="muted small-text">
              {monthName(month)} {month.getFullYear()}
            </span>
            <strong className="verdict-title">{a.headline}</strong>
            <div className="stack tight">
              {data.incomes.length > 0 && (
                <div className="row between">
                  <span className="muted">Ingresos (sueldo + extras)</span>
                  <span className="num">{money(a.income)}</span>
                </div>
              )}
              <div className="row between">
                <span className="muted">Tus gastos (personales + tu mitad)</span>
                <span className="num">
                  {money(a.spent)} · {a.spentPct} %
                </span>
              </div>
              <Meter pct={a.spentPct} level={a.spentPct > 90 ? 'bad' : a.spentPct > 70 ? 'warn' : 'ok'} />
              {a.commitments > 0 && (
                <>
                  <div className="row between">
                    <span className="muted">Cuotas de deudas</span>
                    <span className="num">
                      {money(a.commitments)} · {a.debtPct} %
                    </span>
                  </div>
                  <Meter pct={a.debtPct} level={a.debtPct > 40 ? 'bad' : a.debtPct > 30 ? 'warn' : 'ok'} />
                </>
              )}
              <div className="row between">
                <strong>Te queda</strong>
                <strong className={a.free < 0 ? 'over num' : 'num'}>{money(a.free)}</strong>
              </div>
              {a.projectedFree !== null && (
                <div className="row between">
                  <span className="muted">Estimado al cierre</span>
                  <span className={a.projectedFree < 0 ? 'over num' : 'num'}>{money(a.projectedFree)}</span>
                </div>
              )}
              {isCurrent && a.safeDaily !== null && (
                <div className="row between">
                  <span className="muted">Puedes gastar por día</span>
                  <span className="num">{money(a.safeDaily)}</span>
                </div>
              )}
            </div>
          </section>

          {a.findings.length > 0 && (
            <section className="card">
              <strong>Cómo vas</strong>
              <Findings list={a.findings} />
            </section>
          )}
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
  onToast: (t: string) => void
}) {
  const d = v.debt
  const [paying, setPaying] = useState(false)
  const [value, setValue] = useState(String(d.monthly_payment || ''))
  const [confirm, setConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showPays, setShowPays] = useState(false)
  const [editPay, setEditPay] = useState<string | null>(null)
  const [pAmt, setPAmt] = useState('')
  const [pDate, setPDate] = useState('')
  const [payConfirm, setPayConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    onToast(`Pago de ${money(Math.min(n, v.remaining))} registrado`)
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
    onToast('Deuda borrada')
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
    onToast('Pago borrado')
    await data.refresh()
  }

  async function archive() {
    const { error: err } = await supabase.from('debts').update({ archived: true }).eq('id', d.id)
    if (err) {
      setError('No se pudo archivar')
      return
    }
    onToast('Deuda archivada')
    await data.refresh()
  }

  const done = v.remaining === 0
  if (editing) return <DebtForm hh={hh} data={data} existing={d} onClose={() => setEditing(false)} onToast={onToast} />
  return (
    <section className="card">
      <div className="row between">
        <div className="grow">
          <strong>{d.name}</strong>
          <div className="muted small-text">
            {KINDS.find((k) => k.key === d.kind)?.label ?? 'Otra'} ·{' '}
            {owner ? (
              <>
                <span className="dot inline" style={{ background: memberColor(owner) }} /> {owner.display_name}
              </>
            ) : (
              'De los dos'
            )}
            {d.due_day ? ` · vence el ${d.due_day}` : ''}
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label={`Editar deuda ${d.name}`} onClick={() => setEditing(true)}>
          <Icon name="edit" size={20} />
        </button>
        <button
          type="button"
          className={confirm ? 'icon-btn confirm' : 'icon-btn'}
          aria-label={confirm ? 'Confirmar borrado de la deuda' : 'Borrar deuda'}
          onClick={() => void removeDebt()}
        >
          {confirm ? <strong>¿Seguro?</strong> : <Icon name="trash" size={20} />}
        </button>
      </div>

      <div className="row between">
        <span className="amount num small">{money(v.remaining)}</span>
        <span className="muted small-text num">de {money(d.original_amount)}</span>
      </div>
      <Meter pct={v.progressPct} level="ok" />
      <div className="row between muted small-text">
        <span>{v.progressPct} % pagada</span>
        <span>
          {done
            ? 'Saldada 🎉'
            : v.months === null
              ? 'Sin fecha de término'
              : `~${v.months} ${v.months === 1 ? 'mes' : 'meses'} para terminar`}
        </span>
      </div>
      <div className="row between muted small-text">
        <span>Cuota {d.monthly_payment > 0 ? money(d.monthly_payment) : 'sin definir'}</span>
        <span>{d.monthly_rate > 0 ? `${d.monthly_rate} % mensual` : 'Sin interés'}</span>
      </div>
      {!done && d.monthly_payment > 0 && (
        <span className={v.paidThisMonth >= d.monthly_payment ? 'notice' : 'muted small-text'}>
          {v.paidThisMonth >= d.monthly_payment
            ? 'Cuota de este mes pagada ✓'
            : `Este mes han pagado ${money(v.paidThisMonth)} de ${money(d.monthly_payment)}`}
        </span>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {myPays.length > 0 && (
        <button type="button" className="link-btn" onClick={() => setShowPays((x) => !x)}>
          {showPays ? 'Ocultar pagos' : `Ver los ${myPays.length} pagos`}
        </button>
      )}
      {showPays && (
        <div>
          {myPays.map((p) =>
            editPay === p.id ? (
              <div className="stack tight item-edit" key={p.id}>
                <input className="input" inputMode="numeric" value={pAmt} onChange={(e) => setPAmt(digitsOnly(e.target.value))} aria-label="Monto del pago" />
                <input className="input" type="date" max={todayISO()} value={pDate} onChange={(e) => setPDate(e.target.value)} aria-label="Fecha del pago" />
                <div className="row">
                  <button type="button" className="btn small" disabled={busy} onClick={() => void savePayment(p.id)}>
                    Guardar
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
                  {hh.everyone.find((m) => m.user_id === p.paid_by)?.display_name ?? ''} · {p.paid_on.slice(8, 10)}/{p.paid_on.slice(5, 7)}
                </button>
                <span className="num">{money(p.amount)}</span>
                <button
                  type="button"
                  className={payConfirm === p.id ? 'icon-btn confirm' : 'icon-btn'}
                  aria-label={payConfirm === p.id ? 'Confirmar borrado del pago' : 'Borrar pago'}
                  onClick={() => void deletePayment(p.id)}
                >
                  {payConfirm === p.id ? <strong>¿Seguro?</strong> : <Icon name="trash" size={20} />}
                </button>
              </div>
            ),
          )}
        </div>
      )}
      {paying ? (
        <form className="row" onSubmit={(e) => void pay(e)}>
          <input
            className="input"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(digitsOnly(e.target.value))}
            aria-label="Monto del pago"
          />
          <button className="btn small" type="submit" disabled={busy}>
            Pagar
          </button>
          <button type="button" className="btn ghost small" onClick={() => setPaying(false)}>
            Cancelar
          </button>
        </form>
      ) : done ? (
        <button type="button" className="btn ghost small" onClick={() => void archive()}>
          Archivar
        </button>
      ) : (
        <button type="button" className="btn small" onClick={() => setPaying(true)}>
          Registrar un pago
        </button>
      )}
    </section>
  )
}

function DebtForm({
  hh,
  data,
  onClose,
  onToast,
  existing,
}: {
  hh: Household
  data: HouseholdData
  onClose: () => void
  onToast: (t: string) => void
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
  const [error, setError] = useState<string | null>(null)

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
    onToast(existing ? 'Deuda actualizada' : 'Deuda agregada')
    onClose()
    await data.refresh()
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)}>
      <strong>{existing ? 'Editar deuda' : 'Nueva deuda'}</strong>
      <div className="field">
        <label htmlFor="d-name">Nombre</label>
        <input id="d-name" className="input" maxLength={60} placeholder="Ej. Tarjeta Banco" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="chips" role="group" aria-label="Tipo de deuda">
        {KINDS.map((k) => (
          <button key={k.key} type="button" className="chip" aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="De quién es">
        <button type="button" aria-pressed={owner === ''} onClick={() => setOwner('')}>
          De los dos
        </button>
        {hh.members.map((m) => (
          <button key={m.user_id} type="button" aria-pressed={owner === m.user_id} onClick={() => setOwner(m.user_id)}>
            {m.user_id === hh.me.user_id ? 'Mía' : m.display_name}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="d-total">{existing ? 'Monto total de la deuda' : 'Cuánto deben hoy'}</label>
        <input id="d-total" className="input" inputMode="numeric" value={total} onChange={(e) => setTotal(digitsOnly(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="d-fee">Cuota mensual (opcional)</label>
        <input id="d-fee" className="input" inputMode="numeric" value={fee} onChange={(e) => setFee(digitsOnly(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="d-rate">Interés mensual en % (opcional)</label>
        <input id="d-rate" className="input" inputMode="decimal" placeholder="Ej. 2,5" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))} />
      </div>
      <div className="field">
        <label htmlFor="d-due">Día de vencimiento (opcional)</label>
        <input id="d-due" className="input" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value.replace(/\D/g, '').slice(0, 2))} />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn small" type="submit" disabled={busy}>
          Guardar deuda
        </button>
        <button className="btn ghost small" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function DebtsPanel({ hh, data, onToast }: Props) {
  const [adding, setAdding] = useState(false)
  const s = summarizeDebts(data.debts, data.debtPayments)

  return (
    <>
      {s.remaining > 0 && (
        <section className="card">
          <span className="muted">Deuda total pendiente</span>
          <span className="amount num">{money(s.remaining)}</span>
          <div className="row between">
            <span className="muted small-text">Cuotas al mes {money(s.monthly)}</span>
            <span className="muted small-text">Intereses ~{money(s.interest)}</span>
          </div>
          {s.freeInMonths !== null && s.freeInMonths > 0 && (
            <span className="muted small-text">
              Con las cuotas actuales quedan libres en ~{s.freeInMonths} {s.freeInMonths === 1 ? 'mes' : 'meses'}.
            </span>
          )}
        </section>
      )}

      <section className="card">
        <strong>Dónde van bien y dónde mal</strong>
        <Findings list={s.findings} />
      </section>

      {s.views.map((v) => (
        <DebtCard key={v.debt.id} v={v} hh={hh} data={data} onToast={onToast} />
      ))}

      {adding ? (
        <DebtForm hh={hh} data={data} onClose={() => setAdding(false)} onToast={onToast} />
      ) : (
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          Agregar una deuda
        </button>
      )}
    </>
  )
}

/* ------------------------------- Pantalla ------------------------------ */
export default function Money(props: Props) {
  const [tab, setTab] = useState<'analysis' | 'salary' | 'fixed' | 'debts'>('analysis')
  const { data } = props

  return (
    <main className="screen">
      <h1 className="title">Mi plata</h1>

      {!data.financeReady ? (
        <section className="card">
          <strong>Falta activar esta sección</strong>
          <span className="muted">
            La base de datos aún no tiene las tablas de sueldo y deudas. Aplica la migración
            «20261018050000_sueldo_deudas» y recarga.
          </span>
          <button type="button" className="btn small" onClick={() => void data.refresh()}>
            Reintentar
          </button>
        </section>
      ) : (
        <>
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
          {tab === 'analysis' && <AnalysisPanel {...props} onGoSalary={() => setTab('salary')} />}
          {tab === 'salary' && (
            <>
              <SalaryPanel {...props} />
              <IncomesCard {...props} />
            </>
          )}
          {tab === 'fixed' && <RecurringPanel {...props} />}
          {tab === 'debts' && <DebtsPanel {...props} />}
        </>
      )}
    </main>
  )
}
