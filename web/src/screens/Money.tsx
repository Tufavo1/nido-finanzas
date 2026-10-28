import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import AnalysisPanel from '../components/AnalysisPanel'
import IncomesCard from '../components/IncomesCard'
import Modal from '../components/Modal'
import Collapsibles from '../components/Collapsibles'
import SectionHead from '../components/SectionHead'
import RecurringPanel from '../components/RecurringPanel'
import SalaryCalculator from '../components/SalaryCalculator'
import DebtSimulator from '../components/DebtSimulator'
import { monthKey as monthKeyOf, myShare } from '../lib/analysis'
import SavingsCheck from '../components/SavingsCheck'
import { savedInMonth } from '../lib/goals'
import { isCustomSplit, percentOf, splitOf } from '../lib/split'
import ScopeBar from '../components/ScopeBar'
import { resolveScope, scopeDebts, scopeDebtShares } from '../lib/scope'
import type { Scope } from '../lib/scope'
import { monthlyFixedTotal, pendingFixedThisMonth } from '../lib/upcoming'
import { analyzeSalary, monthIncome, monthsToPayoff, myDebtShare, summarizeDebts, typicalMonth } from '../lib/finance'
import type { DebtView, Finding } from '../lib/finance'
import { money, todayISO } from '../lib/format'
import { computeMetrics } from '../lib/metrics'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { Rich } from '../lib/rich'
import { daysUntil, digitsOnly, inDays, longDate, memberColor, monthName, nextOccurrence, dots } from '../lib/ui'
import type { Notify } from '../components/Toast'
import type { MoneySection } from '../lib/engine'
import Spin from '../components/Spin'
import DebtInsights from '../components/DebtInsights'
import BankRates from '../components/BankRates'
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
            <div className="strong"><Rich text={f.title} /></div>
            <div className="muted small-text"><Rich text={f.detail} /></div>
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
  const setError = useToastError(onToast)

  const metrics = useMemo(
    () => computeMetrics(data.expenses, data.prevExpenses, data.categories, hh.members, month),
    [data.expenses, data.prevExpenses, data.categories, hh.members, month],
  )
  const me = metrics.people.find((p) => p.userId === hh.me.user_id)
  const split = useMemo(() => splitOf(hh.members), [hh.members])
  const commitments = myDebtShare(data.debts, data.debtPayments, hh.me.user_id, split)
  const isCurrent = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth()

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

  const a = salary
    ? analyzeSalary({
        income: monthIncome(salary, data.incomes),
        spent: me?.trueCost ?? 0,
        commitments,
        month,
        pendingFixed: pendingFixedThisMonth(data.recurring, hh.me.user_id, split),
        fixedBooked: data.expenses.reduce((s, e) => (e.recurring_id ? s + myShare(e, hh.me.user_id, split) : s), 0),
        saved: savedInMonth(data.contributions, hh.me.user_id, monthKeyOf(month)),
      })
    : null

  // Un mes completo con todos los fijos y las cuotas, para que el número no dependa de cuándo se creó cada cosa
  const typical =
    a && salary && isCurrent
      ? typicalMonth({
          income: a.income,
          monthlyFixed: monthlyFixedTotal(data.recurring, hh.me.user_id, split),
          commitments,
          spent: a.spent,
          fixedBooked: data.expenses.reduce((t, e) => (e.recurring_id ? t + myShare(e, hh.me.user_id, split) : t), 0),
          pendingFixed: a.pendingFixed,
          month,
        })
      : null

  return (
    <Collapsibles>
      <SectionHead title="Tu sueldo" hint="Lo que te depositan cada mes" />

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
              Cambiar mi sueldo o mi día de pago
            </button>
          </>
        ) : (
          <form className="stack tight" onSubmit={(e) => void save(e)}>
            <span className="muted small-text">
              {hh.members.length > 1
                ? 'Es un dato privado: tu pareja no ve ni el monto ni los resultados de esta pantalla.'
                : 'Es un dato privado: solo lo ves tú.'}
            </span>
            <div className="field">
              <label htmlFor="salary">Sueldo líquido mensual</label>
              <span className="line-help">Lo que te depositan, ya sin descuentos de AFP, salud ni impuestos. No incluyas bonos ocasionales.</span>
              <input
                id="salary" autoComplete="off"
                className="input"
                inputMode="numeric"
                placeholder="Ej. 1500000"
                value={dots(amount)}
                onChange={(e) => setAmount(digitsOnly(e.target.value))}
              />
              {amount && <span className="hint num">Son unos {money(Math.round(Number(amount) / 30))} por día.</span>}
            </div>
            <div className="field">
              <label htmlFor="payday">Día del mes en que te pagan</label>
              <div className="chips" role="group" aria-label="Días de pago comunes">
                {[1, 5, 10, 15, 25, 30].map((n) => (
                  <button key={n} type="button" className="chip" aria-pressed={payDay === String(n)} onClick={() => setPayDay(String(n))}>
                    Día {n}
                  </button>
                ))}
              </div>
              <span className="line-help">Elige uno o escribe otro número del 1 al 31.</span>
              {Number(payDay) >= 1 && Number(payDay) <= 31 && (
                <span className="hint">
                  Tu próximo pago: {longDate(nextOccurrence(Number(payDay)))} ({inDays(daysUntil(nextOccurrence(Number(payDay))))}).
                </span>
              )}
              <input
                id="payday"
                className="input"
                inputMode="numeric"
                value={payDay}
                onChange={(e) => setPayDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              />
            </div>
            <div className="row">
              <button className="btn small" type="submit" disabled={busy}>
                {busy ? <Spin label="Guardando sueldo…" /> : 'Guardar mi sueldo'}
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

      <SalaryCalculator onUse={applyCalculated} busy={busy} />

      {a && salary && (
        <>
          <SectionHead title="Cómo te queda el mes" hint="Tu sueldo frente a gastos, deudas y ahorro" />
          <SavingsCheck hh={hh} data={data} month={month} onToast={onToast} />
          <section className={`card verdict ${a.level}`}>
            <span className="muted small-text">
              Tu situación en {monthName(month)} {month.getFullYear()}
            </span>
            <span className="level-word">{a.level === 'ok' ? 'Vas bien' : a.level === 'warn' ? 'Ten cuidado' : 'Atención'}</span>
            <strong className="verdict-title">{a.headline}</strong>
            <div className="stack tight">
              {data.incomes.length > 0 && (
                <div className="row between">
                  <span className="muted">Ingresos del mes (sueldo + extras)</span>
                  <span className="num">{money(a.income)}</span>
                </div>
              )}
              <div className="row between">
                <span className="muted">Lo que has gastado</span>
                <span className="num">
                  {money(a.spent)} · {a.spentPct} %
                </span>
              </div>
              <span className="line-help">Tus gastos personales más tu parte de los compartidos.</span>
              <Meter pct={a.spentPct} level={a.spentPct > 90 ? 'bad' : a.spentPct > 70 ? 'warn' : 'ok'} />
              {a.commitments > 0 && (
                <>
                  <div className="row between">
                    <span className="muted">Cuotas de deudas</span>
                    <span className="num">
                      {money(a.commitments)} · {a.debtPct} %
                    </span>
                  </div>
                  <span className="line-help">Lo que te toca pagar este mes por tus deudas.</span>
                  <Meter pct={a.debtPct} level={a.debtPct > 40 ? 'bad' : a.debtPct > 30 ? 'warn' : 'ok'} />
                </>
              )}
              {a.saved > 0 && (
                <>
                  <div className="row between">
                    <span className="muted">Ahorro que apartaste</span>
                    <span className="num">
                      {money(a.saved)} · {a.income > 0 ? Math.round((a.saved * 100) / a.income) : 0} %
                    </span>
                  </div>
                  <span className="line-help">Lo que guardaste en tus metas este mes. Sale de tu sueldo igual que un gasto.</span>
                  <Meter pct={a.income > 0 ? Math.round((a.saved * 100) / a.income) : 0} level="ok" />
                </>
              )}
              <div className="row between">
                <strong>Hoy te sobra</strong>
                <strong className={a.free < 0 ? 'over num' : 'num'}>{money(a.free)}</strong>
              </div>
              {a.free < 0 && <span className="line-help">Número negativo: ya gastaste más de lo que entró.</span>}
              {isCurrent && a.pendingFixed > 0 && (
                <>
                  <div className="row between">
                    <span className="muted">Gastos fijos que aún vencen</span>
                    <span className="num">− {money(a.pendingFixed)}</span>
                  </div>
                  <span className="line-help">Son pagos que todavía no salen este mes (arriendo, suscripciones…), pero ya están comprometidos.</span>
                  <div className="row between">
                    <strong>Libre de verdad</strong>
                    <strong className={a.realFree < 0 ? 'over num' : 'num'}>{money(a.realFree)}</strong>
                  </div>
                  <span className="line-help">Esto es lo único que puedes gastar sin dejar un pago sin cubrir.</span>
                </>
              )}
              {a.projectedFree !== null && (
                <div className="row between">
                  <span className="muted">Te sobraría a fin de mes</span>
                  <span className={a.projectedFree < 0 ? 'over num' : 'num'}>{money(a.projectedFree)}</span>
                </div>
              )}
              {isCurrent && a.safeDaily !== null && (
                <div className="row between">
                  <span className="muted">Puedes gastar cada día</span>
                  <span className="num">{money(a.safeDaily)}</span>
                </div>
              )}
              {isCurrent && a.safeDaily !== null && (
                <span className="line-help">Si gastas hasta esto por día, llegas a fin de mes sin problemas.</span>
              )}
            </div>
          </section>

          {typical && (typical.fixed > 0 || typical.commitments > 0) && (
            <section className={`card verdict ${typical.left < 0 ? 'bad' : 'ok'}`}>
              <strong>Cómo es un mes completo</strong>
              <span className="muted small-text">
                Con todos tus gastos fijos y tus deudas, y con lo que gastas día a día, esto es lo que te queda cada mes.
              </span>
              <div className="stack tight">
                <div className="row between">
                  <span className="muted">Ganas</span>
                  <span className="num">{money(typical.income)}</span>
                </div>
                <div className="row between">
                  <span className="muted">Gastos fijos de cada mes</span>
                  <span className="num">− {money(typical.fixed)}</span>
                </div>
                <div className="row between">
                  <span className="muted">Cuotas de deudas</span>
                  <span className="num">− {money(typical.commitments)}</span>
                </div>
                <div className="row between">
                  <span className="muted">Gastos del día a día</span>
                  <span className="num">− {money(typical.variable)}</span>
                </div>
                <span className="line-help">Es lo que llevas gastado este mes sin contar los fijos, calculado para el mes completo.</span>
                <div className="row between">
                  <strong>Te queda en un mes normal</strong>
                  <strong className={typical.left < 0 ? 'over num' : 'num'}>{money(typical.left)}</strong>
                </div>
                {typical.left < 0 && (
                  <span className="line-help">Con tus fijos y tus deudas, un mes normal te deja en rojo. Conviene bajar algún gasto o subir los ingresos.</span>
                )}
                {typical.unbookedFixed > 0 && (
                  <span className="hint">
                    Este mes todavía no se anotaron {money(typical.unbookedFixed)} de tus gastos fijos, porque los creaste después de su día de pago. Por eso no están en lo que has gastado ni en lo que te sobra hoy. Si ya los pagaste, anótalos como un gasto normal.
                  </span>
                )}
              </div>
            </section>
          )}

          {a.findings.length > 0 && (
            <section className="card">
              <strong>Qué significa esto para ti</strong>
              <Findings list={a.findings} />
            </section>
          )}
        </>
      )}
    </Collapsibles>
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
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      setEditing(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
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
      <span className="fixed-next">
        {nextDue && dueLeft !== null ? (
          <>
            <span className="fixed-date">
              <span className="muted small-text">Próximo vencimiento</span>
              <strong>{nextDue.getDate()} de {longDate(nextDue).split(' de ')[1]}</strong>
            </span>
            <span className={dueLeft <= 3 ? 'pill fixed-when soon' : 'pill fixed-when'}>{inDays(dueLeft)}</span>
          </>
        ) : (
          <span className="fixed-date">
            <span className="muted small-text">Cuota mensual</span>
            <strong>{d.monthly_payment > 0 ? money(d.monthly_payment) : 'Sin definir'}</strong>
          </span>
        )}
      </span>
    </button>
  )
  if (!open) return card
  if (editing)
    return (
      <>
        {card}
        {createPortal(
          <div className="sheet-back" role="presentation" onClick={close}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <DebtForm hh={hh} data={data} existing={d} onClose={() => setEditing(false)} onToast={onToast} />
            </div>
          </div>,
          document.body,
        )}
      </>
    )
  return (
    <>
    {card}
    {createPortal(
    <div className="sheet-back" role="presentation" onClick={close}>
    <section className="sheet card fixed-sheet" role="dialog" aria-modal="true" aria-label={`Detalle de ${d.name}`} onClick={(e) => e.stopPropagation()}>
      <div className="row between">
        <div className="grow">
          <strong className="fixed-title">{d.name}</strong>
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
        <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
          ✕
        </button>
      </div>

      <div className="owe">
        <span className="muted small-text">{done ? 'Ya no se debe nada' : 'Todavía falta pagar'}</span>
        <span className="amount num small">{money(v.remaining)}</span>
        <span className="muted small-text num">La deuda era de {money(d.original_amount)}</span>
        {v.accrued > 0 && !done && (
          <span className="muted small-text num">Incluye {money(v.accrued)} de interés que se fue sumando mes a mes desde que la anotaron.</span>
        )}
      </div>
      <Meter pct={v.progressPct} level="ok" />
      <div className="row between muted small-text">
        <span>Llevan pagado el {v.progressPct} %</span>
        <span>
          {done
            ? 'Saldada 🎉'
            : v.months === null
              ? 'Sin fecha de término'
              : `Faltan ~${v.months} ${v.months === 1 ? 'mes' : 'meses'}`}
        </span>
      </div>
      <div className="row between muted small-text">
        <span>Cuota mensual: {d.monthly_payment > 0 ? money(d.monthly_payment) : 'sin definir'}</span>
        <span>{d.monthly_rate > 0 ? `Interés: ${d.monthly_rate} % al mes` : 'Sin interés'}</span>
      </div>
      {!done && <DebtSimulator remaining={v.remaining} payment={d.monthly_payment} ratePct={d.monthly_rate} />}
      {!done && d.monthly_payment > 0 && (
        <span className={v.paidThisMonth >= d.monthly_payment ? 'notice' : 'muted small-text'}>
          {v.paidThisMonth >= d.monthly_payment
            ? 'La cuota de este mes ya está pagada ✓'
            : `Este mes han pagado ${money(v.paidThisMonth)} de la cuota de ${money(d.monthly_payment)}`}
        </span>
      )}
      {myPays.length > 0 && (
        <button type="button" className="link-btn" onClick={() => setShowPays((x) => !x)}>
          {showPays ? 'Ocultar los pagos' : `Ver los pagos anotados (${myPays.length})`}
        </button>
      )}
      {showPays && (
        <div>
          {myPays.map((p) =>
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
      {paying ? (
        <form className="stack tight" onSubmit={(e) => void pay(e)}>
          <div className="field">
            <label htmlFor={`pay-${d.id}`}>¿Cuánto pagaste?</label>
            <input
              id={`pay-${d.id}`}
              className="input"
              inputMode="numeric"
              value={dots(value)}
              onChange={(e) => setValue(digitsOnly(e.target.value))}
            />
            <span className="hint">Esto solo anota el pago en la app; no mueve plata de tu banco.</span>
          </div>
          <div className="row">
            <button className="btn small" type="submit" disabled={busy}>
              {busy ? <Spin label="Registrando pago…" /> : 'Guardar el pago'}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setPaying(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : done ? (
        <button type="button" className="btn ghost small" onClick={() => void archive()}>
          Guardar en el archivo (ya está pagada)
        </button>
      ) : (
        <button type="button" className="btn small" onClick={() => setPaying(true)}>
          Anotar un pago
        </button>
      )}
      <div className="fixed-actions">
        <button type="button" className="txt-btn" onClick={() => setEditing(true)}>
          Editar
        </button>
        <button type="button" className={confirm ? 'txt-btn warn' : 'txt-btn'} onClick={() => void removeDebt()}>
          {confirm ? 'Toca otra vez para borrar' : 'Borrar'}
        </button>
      </div>
    </section>
    </div>,
    document.body,
    )}
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

  return (
    <form className="card" onSubmit={(e) => void submit(e)}>
      <strong>{existing ? 'Editar deuda' : 'Agregar una deuda'}</strong>
      <div className="field">
        <label htmlFor="d-name">1. Nombre de la deuda</label>
        <span className="line-help">Escribe algo que la reconozcas al verla: el banco, la tienda o la persona.</span>
        <input id="d-name" className="input" maxLength={60} placeholder="Ej. Tarjeta Banco Estado, Crédito del auto, Préstamo de mamá" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <span id="d-kind" className="strong">2. ¿Qué tipo de deuda es?</span>
        <div className="chips" role="group" aria-labelledby="d-kind">
          {KINDS.map((k) => (
            <button key={k.key} type="button" className="chip" aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
              {k.label}
            </button>
          ))}
        </div>
        <span className="line-help">{KINDS.find((k) => k.key === kind)?.help}</span>
      </div>
      <div className="field">
        <span id="d-owner" className="strong">3. ¿Quién la debe?</span>
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
        <span className="line-help">
          {owner === ''
            ? 'Las cuotas se reparten por igual entre los dos.'
            : owner === hh.me.user_id
              ? 'La cuota cuenta solo en tus cálculos.'
              : 'La cuota cuenta solo en los cálculos de esa persona.'}
        </span>
      </div>
      <div className="field">
        <label htmlFor="d-total">{existing ? '4. Monto total de la deuda' : '4. Saldo: lo que se debe hoy'}</label>
        <span className="line-help">Lo que falta pagar ahora, no lo que pidieron al principio. En una tarjeta, el monto total facturado.</span>
        <input id="d-total" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 800000" value={dots(total)} onChange={(e) => setTotal(digitsOnly(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="d-fee">5. Cuota mensual (opcional)</label>
        <span className="line-help">Lo que pagan cada mes por esta deuda. Con ella calculamos en cuántos meses terminan.</span>
        <input id="d-fee" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 65000" value={dots(fee)} onChange={(e) => setFee(digitsOnly(e.target.value))} />
        {Number(fee) > 0 && Number(total) > 0 && (
          <span className="hint">
            {(() => {
              const m = monthsToPayoff(Number(total), Number(fee), Number(rate.replace(',', '.') || '0') || 0)
              return m === null
                ? 'Con esa cuota y ese interés la deuda no baja: conviene subir la cuota.'
                : `Pagando ${money(Number(fee))} al mes terminarían en ~${m} ${m === 1 ? 'mes' : 'meses'}.`
            })()}
          </span>
        )}
      </div>
      <div className="field">
        <label htmlFor="d-rate">6. Interés mensual en % (opcional)</label>
        <span className="line-help">Aparece en el contrato o en la cartola como tasa mensual. Si no cobra interés, déjalo vacío.</span>
        <input id="d-rate" autoComplete="off" className="input" inputMode="decimal" placeholder="Ej. 2,5" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))} />
      </div>
      <div className="field">
        <label htmlFor="d-due">7. Día de vencimiento (opcional)</label>
        <span className="line-help">El día del mes en que hay que pagar la cuota. Te avisamos cuando se acerque.</span>
        <input id="d-due" className="input" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value.replace(/\D/g, '').slice(0, 2))} />
      </div>
      <div className="row">
        <button className="btn small" type="submit" disabled={busy}>
          {busy ? <Spin label="Guardando deuda…" /> : 'Guardar deuda'}
        </button>
        <button className="btn ghost small" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
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
  const who = resolveScope(scope, hh.members)
  const debts = scopeDebts(data.debts, who)
  const real = summarizeDebts(debts, data.debtPayments)
  // Para una persona, las deudas compartidas cuentan solo su parte en los totales y el análisis
  const mine = scopeDebtShares(data.debts, data.debtPayments, who, splitOf(hh.members))
  const s = summarizeDebts(mine.debts, mine.payments)
  const empty = debts.length === 0
  const person = hh.members.find((m) => m.user_id === who)

  return (
    <Collapsibles>
      {!adding && (
        <div className="panel-actions">
          <button type="button" className="btn small" onClick={() => setAdding(true)}>
            + Agregar una deuda
          </button>
        </div>
      )}
      {adding && (
        <Modal label="Agregar una deuda" onClose={() => setAdding(false)}>
          <DebtForm hh={hh} data={data} onClose={() => setAdding(false)} onToast={onToast} defaultOwner={who === 'all' ? '' : who} />
        </Modal>
      )}

      {!empty && <SectionHead title="Lo que dice el análisis" hint="Lo más importante de tus deudas, de un vistazo" />}

      <DebtInsights debts={mine.debts} payments={mine.payments} part="findings" />

      {empty ? null : (
        <section className="card wide">
          <strong>Cómo van con sus deudas</strong>
          <Findings list={s.findings} />
        </section>
      )}

      <SectionHead title="Resumen de deudas" hint="Cuánto falta y cuándo terminan de pagar" />

      {who === 'all' && <BetweenUs hh={hh} data={data} month={month} onToast={onToast} />}

      {s.remaining > 0 && (
        <section className="card">
          <strong>{who === 'all' ? 'Resumen de lo que se debe' : who === hh.me.user_id ? 'Resumen de lo que te toca pagar' : `Resumen de lo que le toca pagar a ${person?.display_name ?? 'tu pareja'}`}</strong>
          <span className="muted small-text">Falta pagar en total</span>
          <span className="amount num">{money(s.remaining)}</span>
          <div className="row between">
            <span className="muted small-text">Cuotas al mes: {money(s.monthly)}</span>
            <span className="muted small-text">Intereses: ~{money(s.interest)}</span>
          </div>
          {s.freeInMonths !== null && s.freeInMonths > 0 && (
            <span className="muted small-text">
              Si siguen pagando las cuotas de ahora, terminan de pagar todo en ~{s.freeInMonths}{' '}
              {s.freeInMonths === 1 ? 'mes' : 'meses'}.
            </span>
          )}
        </section>
      )}

      <DebtInsights debts={mine.debts} payments={mine.payments} />

      {empty && (
        <section className="card wide">
          <strong>{person && data.debts.length > 0 ? `${who === hh.me.user_id ? 'No tienes' : `${person.display_name} no tiene`} deudas anotadas` : 'Todavía no hay deudas anotadas'}</strong>
          <span className="muted">
            {person && data.debts.length > 0
              ? 'Aquí se muestran las deudas de esta persona y las que son de los dos. Cambia a Hogar para ver todas.'
              : 'Si no deben nada, no hagas nada. Si tienen una tarjeta, un crédito o un préstamo, agrégalo para llevar el control.'}
          </span>
        </section>
      )}

      {real.views.length > 0 && (
        <>
          <SectionHead title="Tus deudas" hint="Toca una para ver todo, anotar un pago, editarla o borrarla" />
          <div className="fixed-grid wide">
            {real.views.map((v) => (
              <DebtCard key={v.debt.id} v={v} hh={hh} data={data} onToast={onToast} />
            ))}
          </div>
        </>
      )}

      <SectionHead title="Cómo pagar menos interés" hint="Tasas de bancos para comparar" />

      <BankRates debts={debts} payments={data.debtPayments} />

    </Collapsibles>
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
      <h1 className="title">Mis finanzas</h1>
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
          {tab === 'analysis' && (privateNotice ?? <AnalysisPanel {...props} onGoSalary={() => setTab('salary')} />)}
          {tab === 'salary' &&
            (privateNotice ?? (
              <>
                <SalaryPanel {...props} />
                <Collapsibles openFirst={false}>
                  <SectionHead title="Ingresos extra" hint="Bonos, ventas o trabajos aparte" />
                  <IncomesCard {...props} />
                </Collapsibles>
              </>
            ))}
          {tab === 'fixed' && <RecurringPanel {...props} />}
          {tab === 'debts' && <DebtsPanel {...props} />}
        </>
      )}
    </main>
  )
}
