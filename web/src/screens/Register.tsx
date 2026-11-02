import ScreenHelp from '../components/ScreenHelp'
import { useToastError } from '../lib/useToastError'
import type { Notify } from '../components/Toast'
import { useEffect, useRef, useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Icon from '../components/Icon'
import { money, todayISO } from '../lib/format'
import { finalAmount, initialDraft, resolveSpentOn, saveBlocker, saveLabel } from '../lib/register'
import type { TargetKind } from '../lib/register'
import { debtView } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { notifyPartner } from '../lib/push'
import Spin from '../components/Spin'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const

export default function Register({
  hh,
  data,
  onSaved,
  onToast,
}: {
  hh: Household
  data: HouseholdData
  onSaved: (message: string) => void
  onToast: Notify
}) {
  const [digits, setDigits] = useState('')
  const [catId, setCatId] = useState<string>(data.categories[0]?.id ?? '')
  const [paidBy, setPaidBy] = useState(hh.me.user_id)
  const multi = hh.members.length > 1
  // 1: ¿en qué se gastó o qué se paga? · 2: ¿personal o compartido? · 3: ¿descuento? · 4: monto y guardar
  // Si en el paso 1 se elige una deuda o una meta, se salta directo al 4 (no hay compartido ni descuento).
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [kind, setKind] = useState<TargetKind>('expense')
  const [debtId, setDebtId] = useState('')
  const [goalId, setGoalId] = useState('')
  const [shared, setShared] = useState(true)
  const [more, setMore] = useState(false)
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)
  // Al cambiar de paso, el lector de pantalla y el teclado arrancan en la pregunta nueva
  const askRef = useRef<HTMLElement>(null)
  useEffect(() => {
    askRef.current?.querySelector<HTMLElement>('h2, .reg-amount')?.focus()
  }, [step])

  const [hasDiscount, setHasDiscount] = useState(false)
  const [discount, setDiscount] = useState('')

  const isExpense = kind === 'expense'
  const gross = digits ? Number(digits) : 0
  const pct = hasDiscount ? Math.min(100, Math.max(0, Number(discount.replace(',', '.')) || 0)) : 0
  // Lo que realmente se pagó, ya con el descuento aplicado
  const amount = finalAmount(gross, isExpense && hasDiscount, discount)
  const today = todayISO()
  const now = new Date()
  const myDebts = data.debts
    .filter((d) => d.owner_id === hh.me.user_id || d.owner_id === null)
    .map((d) => debtView(d, data.debtPayments, now))
    .filter((v) => v.remaining > 0)
  const debt = kind === 'debt' ? myDebts.find((v) => v.debt.id === debtId) : undefined
  const goal = kind === 'goal' ? data.goals.find((g) => g.id === goalId) : undefined
  const blocker = saveBlocker({ ...initialDraft(catId, paidBy), digits, note, date, hasDiscount, discount, shared }, today, kind, debt?.remaining)
  const label = (isExpense ? '' : kind === 'debt' ? debt?.debt.name : goal?.name) ?? ''

  function press(k: (typeof KEYS)[number]) {
    setDigits((d) => {
      if (k === 'back') return d.slice(0, -1)
      const next = (d + k).replace(/^0+/, '')
      return next.length > 9 ? d : next
    })
  }

  async function save() {
    const spentOn = resolveSpentOn(date, today)
    if (blocker || spentOn === null) return
    if ((kind === 'debt' && !debt) || (kind === 'goal' && !goal)) return
    setBusy(true)
    setError(null)
    if (kind === 'debt' && debt) {
      const paid = amount
      const { error: e1 } = await supabase.from('debt_payments').insert({
        household_id: hh.household.id,
        debt_id: debt.debt.id,
        amount: paid,
        paid_by: hh.me.user_id, // un pago de deuda siempre va a nombre de quien lo registra
        paid_on: spentOn,
      })
      if (e1) {
        setError('No se pudo registrar el pago. Intenta de nuevo.')
        setBusy(false)
        return
      }
      await data.refresh()
      onSaved(`Pago registrado\nSe abonaron **${money(paid)}** a **${debt.debt.name}**.`)
      return
    }
    if (kind === 'goal' && goal) {
      const { data: c, error: e2 } = await supabase.from('contributions').insert({
        household_id: hh.household.id,
        goal_id: goal.id,
        user_id: hh.me.user_id,
        amount,
        contributed_on: spentOn,
      }).select('id').single()
      if (e2) {
        setError('No se pudo registrar el aporte. Intenta de nuevo.')
        setBusy(false)
        return
      }
      if (c) notifyPartner('contribution', c.id)
      await data.refresh()
      onSaved(`Aporte registrado\nSumaste **${money(amount)}** a **${goal.name}**.`)
      return
    }
    const { data: created, error: err } = await supabase.from('expenses').insert({
      household_id: hh.household.id,
      category_id: catId,
      amount,
      // Un gasto personal es de quien lo anota; solo uno compartido puede pagarlo la otra persona
      paid_by: shared ? paidBy : hh.me.user_id,
      shared,
      note: note.trim(),
      spent_on: spentOn,
    }).select('id').single()
    if (err) {
      setError('No se pudo guardar. Intenta de nuevo.')
      setBusy(false)
      return
    }
    if (created) notifyPartner('expense', created.id)
    await data.refresh()
    onSaved(`Gasto registrado\nSe anotaron **${money(amount)}** en ${data.categories.find((c) => c.id === catId)?.name ? `**${data.categories.find((c) => c.id === catId)?.name}**` : 'tus gastos'}.`)
  }

  const catName = data.categories.find((c) => c.id === catId)?.name

  const first = 1
  function back() {
    if (step === 4 && !isExpense) setStep(1)
    else setStep((n) => (n > first ? ((n - 1) as 1 | 2 | 3 | 4) : n))
  }

  /** Descarta lo anotado y vuelve al primer paso */
  function cancel() {
    const d = initialDraft(data.categories[0]?.id, hh.me.user_id)
    setDigits(d.digits)
    setNote(d.note)
    setDate(d.date)
    setMore(d.more)
    setHasDiscount(d.hasDiscount)
    setDiscount(d.discount)
    setShared(d.shared)
    setPaidBy(d.paidBy)
    setCatId(d.catId)
    setStep(d.step)
    setKind('expense')
    setDebtId('')
    setGoalId('')
  }

  function chooseShared(v: boolean) {
    setShared(v)
    setStep(3)
  }

  function chooseDiscount(v: boolean) {
    setHasDiscount(v)
    if (!v) setDiscount('')
    if (!v) setStep(4)
  }

  function chooseCategory(id: string) {
    setKind('expense')
    setCatId(id)
    setStep(2)
  }

  function chooseDebt(id: string) {
    setKind('debt')
    setDebtId(id)
    setHasDiscount(false)
    setDiscount('')
    setStep(4)
  }

  function chooseGoal(id: string) {
    setKind('goal')
    setGoalId(id)
    setHasDiscount(false)
    setDiscount('')
    setStep(4)
  }

  const canSave = !busy && blocker === null
  // Pasos que le faltan a la persona: un gasto tiene 4; un pago o aporte solo 2 (elegir y monto)
  const stepList = isExpense ? [1, 2, 3, 4] : [1, 4]
  const stepNo = Math.max(1, stepList.indexOf(step) + 1)

  return (
    <main className="screen reg">
      <h1 className="sr-only">Registrar</h1>
      <div className="reg-nav">
        {step > first ? (
          <button type="button" className="btn ghost small" onClick={back}>
            Volver
          </button>
        ) : (
          <span />
        )}
        <div className="reg-progress">
          <div className="reg-steps" aria-hidden="true">
            {stepList.map((n) => (
              <span key={n} className={n === step ? 'on' : n < step ? 'done' : ''} />
            ))}
          </div>
          <span className="reg-stepsleft" role="status">
            {stepNo === stepList.length ? `Último paso (${stepNo} de ${stepList.length})` : `Paso ${stepNo} de ${stepList.length}`}
          </span>
        </div>
        <span className="reg-help"><ScreenHelp screen="add" /></span>
      </div>

      {step > first && (
        <div className="reg-sum" role="group" aria-label="Lo que elegiste (toca uno para cambiarlo)">
          <button type="button" className="chip" onClick={() => setStep(1)}>
            <span aria-hidden="true">{kind === 'debt' ? '💳' : kind === 'goal' ? '🎯' : '🛒'}</span>{' '}
            {kind === 'debt' ? `Pago a ${label}` : kind === 'goal' ? `Aporte a ${label}` : (catName ?? 'Gasto')}
          </button>
          {isExpense && step > 2 && (
            <button type="button" className="chip" onClick={() => setStep(2)}>
              {shared ? '👥 Compartido' : '👤 Personal'}
            </button>
          )}
          {isExpense && step > 3 && (
            <button type="button" className="chip" onClick={() => { setHasDiscount(pct > 0); setStep(3) }}>
              {pct > 0 ? `🏷️ ${pct}% desc.` : '🏷️ Sin descuento'}
            </button>
          )}
        </div>
      )}

      {step === 1 && (
        <section className="reg-ask" ref={askRef}>
          <h2 className="reg-q" tabIndex={-1}>¿En qué se gastó o qué vas a pagar?</h2>

          <section className="reg-group" aria-labelledby="reg-g-exp">
            <h3 className="reg-gtitle" id="reg-g-exp"><span aria-hidden="true">🛒</span> Un gasto</h3>
            {data.categories.length === 0 && <p className="muted">Aún no hay categorías para elegir.</p>}
            <div className="reg-catgrid">
              {data.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="reg-pctbtn reg-catbtn"
                  aria-pressed={isExpense && catId === c.id}
                  onClick={() => chooseCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </section>

          {myDebts.length > 0 && (
            <section className="reg-group" aria-labelledby="reg-g-debt">
              <h3 className="reg-gtitle" id="reg-g-debt"><span aria-hidden="true">💳</span> Pagar una deuda</h3>
              <div className="reg-rows">
                {myDebts.map((v) => (
                  <button
                    key={v.debt.id}
                    type="button"
                    className="reg-row"
                    aria-pressed={kind === 'debt' && debtId === v.debt.id}
                    onClick={() => chooseDebt(v.debt.id)}
                  >
                    <span className="reg-row-name">{v.debt.name}</span>
                    <span className="reg-row-sub">Debes {money(v.remaining)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {data.goals.length > 0 && (
            <section className="reg-group" aria-labelledby="reg-g-goal">
              <h3 className="reg-gtitle" id="reg-g-goal"><span aria-hidden="true">🎯</span> Aportar a una meta</h3>
              <div className="reg-rows">
                {data.goals.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="reg-row"
                    aria-pressed={kind === 'goal' && goalId === g.id}
                    onClick={() => chooseGoal(g.id)}
                  >
                    <span className="reg-row-name">{g.name}</span>
                    <span className="reg-row-sub">Meta {money(g.target_amount)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="reg-ask" ref={askRef}>
          <h2 className="reg-q" tabIndex={-1}>¿Es un gasto personal o compartido?</h2>
          <button type="button" className="reg-big" onClick={() => chooseShared(true)}>
            <span className="reg-emoji" aria-hidden="true">👥</span>
            <strong>COMPARTIDO</strong>
            <span>Lo pagamos entre los dos</span>
          </button>
          <button type="button" className="reg-big" onClick={() => chooseShared(false)}>
            <span className="reg-emoji" aria-hidden="true">👤</span>
            <strong>PERSONAL</strong>
            <span>Es solo mío</span>
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="reg-ask" ref={askRef}>
          <h2 className="reg-q" tabIndex={-1}>¿Tiene descuento?</h2>
          {!hasDiscount ? (
            <>
              <button type="button" className="reg-big" onClick={() => chooseDiscount(false)}>
                <span className="reg-emoji" aria-hidden="true">✅</span>
                <strong>NO, precio normal</strong>
                <span>Pagué el precio completo</span>
              </button>
              <button type="button" className="reg-big" onClick={() => chooseDiscount(true)}>
                <span className="reg-emoji" aria-hidden="true">🏷️</span>
                <strong>SÍ, con descuento</strong>
                <span>Me rebajaron el precio</span>
              </button>
            </>
          ) : (
            <>
              <p className="reg-hint">Toca el descuento que te hicieron:</p>
              <div className="reg-pcts">
                {[10, 20, 30, 50].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="reg-pctbtn"
                    aria-pressed={pct === p}
                    onClick={() => {
                      setDiscount(String(p))
                      setStep(4)
                    }}
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <div className="reg-other">
                <label htmlFor="disc-other" className="reg-hint">¿Fue otro porcentaje? Escríbelo aquí:</label>
                <div className="reg-pct">
                  <input
                    id="disc-other"
                    className="input"
                    inputMode="decimal"
                    placeholder="Ej: 15"
                    maxLength={5}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value.replace(/[^\d.,]/g, ''))}
                  />
                  <span>%</span>
                </div>
                <button type="button" className="btn reg-ok" disabled={pct <= 0} onClick={() => setStep(4)}>
                  {pct > 0 ? `✔ Continuar con ${pct}%` : 'Escribe el número para continuar'}
                </button>
              </div>
              <button type="button" className="btn ghost" onClick={() => chooseDiscount(false)}>
                No tiene descuento
              </button>
            </>
          )}
        </section>
      )}

      {step === 4 && (
        <>
          <div className="reg-top" ref={askRef as React.RefObject<HTMLDivElement>}>
            <div className="reg-amount" tabIndex={-1}>
              <span className="muted small-text">{kind === 'debt' ? 'Monto a pagar' : kind === 'goal' ? 'Monto a aportar' : 'Monto del gasto'}</span>
              <div className={gross > 0 ? 'amount big num' : 'amount big num reg-empty'} aria-live="polite">
                {money(gross)}
              </div>
              {isExpense && pct > 0 && gross > 0 && (
                <span className="muted small-text">
                  Queda en <strong>{money(amount)}</strong> con {pct}% de descuento
                </span>
              )}
            </div>
          </div>
          {debt && (
            <div className="reg-quick" role="group" aria-label="Montos sugeridos">
              {debt.debt.monthly_payment > 0 && (
                <button type="button" className="chip" onClick={() => setDigits(String(Math.min(debt.debt.monthly_payment, debt.remaining)))}>
                  Cuota {money(Math.min(debt.debt.monthly_payment, debt.remaining))}
                </button>
              )}
              <button type="button" className="chip" onClick={() => setDigits(String(debt.remaining))}>
                Pagar todo {money(debt.remaining)}
              </button>
            </div>
          )}
          <div className="keypad reg-keys" role="group" aria-label="Teclado numérico">
            {KEYS.map((k) => (
              <button key={k} type="button" className="key" onClick={() => press(k)} aria-label={k === 'back' ? 'Borrar' : k}>
                {k === 'back' ? <Icon name="back" /> : k}
              </button>
            ))}
          </div>

          {debt && gross > debt.remaining && (
            <p className="reg-fb bad" role="alert">
              No puedes pagar más de lo que debes. Esta deuda tiene un saldo de {money(debt.remaining)}.
            </p>
          )}
          {isExpense && <div className="reg-note field">
            <label htmlFor="reg-note" className="strong">¿De qué es este gasto?</label>
            <input
              id="reg-note"
              className="input"
              placeholder="Ej. Pan y leche, bencina, almuerzo"
              maxLength={120}
              required
              aria-invalid={gross > 0 && !note.trim()}
              aria-describedby="reg-note-hint"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <span id="reg-note-hint" className={gross > 0 && !note.trim() ? 'reg-fb bad' : 'reg-fb muted small-text'}>
              {gross > 0 && !note.trim() ? 'Falta contar de qué es para poder guardar' : 'Obligatorio: ayuda a reconocer el gasto después'}
            </span>
          </div>}

          <button className="btn reg-save" type="button" disabled={!canSave} onClick={() => void save()}>
            {busy ? <Spin label="Guardando…" /> : saveLabel(blocker, amount, kind)}
          </button>

          <button type="button" className="btn ghost" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {more ? 'Ocultar' : (multi && isExpense && shared ? 'Cambiar quién pagó o si es de otra fecha' : '¿Fue en una fecha anterior?')}
          </button>
          {more && (
            <section className="reg-card">
              {multi && isExpense && shared && (
                <div className="reg-line">
                  <span className="reg-label">Pagó</span>
                  <div className="seg" role="group" aria-label="Quién pagó">
                    {hh.members.map((m) => (
                      <button key={m.user_id} type="button" aria-pressed={paidBy === m.user_id} onClick={() => setPaidBy(m.user_id)}>
                        {m.display_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="reg-meta">
                <label htmlFor="spent-on" className="muted small-text">¿Qué día fue? (si no, se anota hoy)</label>
                <input
                  id="spent-on"
                  className="input"
                  type="date"
                  max={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Fecha del gasto"
                />
              </div>
            </section>
          )}
        </>
      )}

      {step > first && (
        <button type="button" className="btn ghost" disabled={busy} onClick={cancel}>
          Cancelar registro
        </button>
      )}
    </main>
  )
}
