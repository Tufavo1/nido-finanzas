import ScreenHelp from '../components/ScreenHelp'
import { useToastError } from '../lib/useToastError'
import type { Notify } from '../components/Toast'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Icon from '../components/Icon'
import { money, todayISO } from '../lib/format'
import { digitsOnly, dots } from '../lib/ui'
import { draftFromNotice, finalAmount, initialDraft, resolveSpentOn, saveBlocker, saveLabel } from '../lib/register'
import type { TargetKind } from '../lib/register'
import { suggestCategory, suggestShared } from '../lib/categorize'
import { debtView } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { notifyPartner } from '../lib/push'
import { newId, saveOnce } from '../lib/idempotency'
import Spin from '../components/Spin'
import RecurringCreateForm from '../components/RecurringCreateForm'
import GoalCreateForm from '../components/GoalCreateForm'
import DebtGuidedForm from '../components/DebtGuidedForm'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const

/** `pay` es la pantalla principal (monto primero); las demás son formularios que se abren desde «Crear otra cosa» */
type Mode = 'pay' | 'notice' | 'debt' | 'category' | 'goal' | 'fixed'

/**
 * Registrar, con el monto primero: se abre directo en el teclado. La persona escribe cuánto y de qué fue;
 * la categoría y si es compartido se eligen solos según lo que ya anotó antes (y se pueden cambiar con un toque).
 * Fecha, quién pagó y descuento quedan en «Más opciones» porque casi nunca cambian.
 */
export default function Register({
  hh,
  data,
  onSaved,
  onToast,
  notice,
}: {
  hh: Household
  data: HouseholdData
  onSaved: (message?: string) => void
  onToast: Notify
  /** Aviso del banco con que otra app abrió Contigo (compartir o automatización) */
  notice?: string | null
}) {
  // Gastos recientes: de ahí se aprende qué categoría usa la persona para cada comercio
  const history = useMemo(() => [...data.expenses, ...data.prevExpenses], [data.expenses, data.prevExpenses])
  // Si la app se abrió con un aviso del banco, el gasto parte ya armado
  const [pre] = useState(() => (notice ? draftFromNotice(notice, data.categories, history, new Date()) : null))
  const ready = pre?.ok ? pre : null
  const [noticeText, setNoticeText] = useState(notice ?? '')
  const [noticeError, setNoticeError] = useState<string | null>(pre && !pre.ok ? pre.error : null)
  const [mode, setMode] = useState<Mode>(notice && !ready ? 'notice' : 'pay')

  const [kind, setKind] = useState<TargetKind>('expense')
  const [digits, setDigits] = useState(ready?.digits ?? '')
  const [note, setNote] = useState(ready?.note ?? '')
  const [date, setDate] = useState(ready?.date ?? '')
  // Categoría y compartido: mientras la persona no los toque, los decide la app
  const [pickedCat, setPickedCat] = useState<string | null>(null)
  const [pickedShared, setPickedShared] = useState<boolean | null>(null)
  const [paidBy, setPaidBy] = useState(hh.me.user_id)
  const [debtId, setDebtId] = useState('')
  const [goalId, setGoalId] = useState('')
  const [discount, setDiscount] = useState('')
  const [more, setMore] = useState(false)
  const [others, setOthers] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [busy, setBusy] = useState(false)
  // Identificador de lo que se está anotando: si hay que reenviar, la base reconoce que es lo mismo y no lo duplica
  const [draftId, setDraftId] = useState(newId)
  const setError = useToastError(onToast)

  const multi = hh.members.length > 1
  const isExpense = kind === 'expense'
  const today = todayISO()
  const now = new Date()

  const suggestedCat = useMemo(() => suggestCategory(note, data.categories, history), [note, data.categories, history])
  const catId = pickedCat ?? suggestedCat ?? ''
  const shared = pickedShared ?? suggestShared(catId, history) ?? true
  const hasDiscount = discount.trim() !== ''
  const gross = digits ? Number(digits) : 0
  const pct = hasDiscount ? Math.min(100, Math.max(0, Number(discount.replace(',', '.')) || 0)) : 0
  // Lo que realmente se pagó, ya con el descuento aplicado
  const amount = finalAmount(gross, isExpense && hasDiscount, discount)

  const myDebts = data.debts
    .filter((d) => d.owner_id === hh.me.user_id || d.owner_id === null)
    .map((d) => debtView(d, data.debtPayments, now))
    .filter((v) => v.remaining > 0)
  const debt = kind === 'debt' ? myDebts.find((v) => v.debt.id === debtId) : undefined
  const goal = kind === 'goal' ? data.goals.find((g) => g.id === goalId) : undefined
  const blocker = saveBlocker({ ...initialDraft(catId, paidBy), digits, note, date, hasDiscount, discount, shared }, today, kind, debt?.remaining)
  const missingTarget = (kind === 'debt' && !debt) || (kind === 'goal' && !goal)
  const canSave = !busy && blocker === null && !missingTarget
  const catName = data.categories.find((c) => c.id === catId)?.name
  // Las categorías van en una fila que se desliza: la elegida siempre queda a la vista
  const catRow = useRef<HTMLDivElement>(null)
  useEffect(() => {
    catRow.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [catId])

  function press(k: (typeof KEYS)[number]) {
    setDigits((d) => {
      if (k === 'back') return d.slice(0, -1)
      const next = (d + k).replace(/^0+/, '')
      return next.length > 9 ? d : next
    })
  }

  /** Gasto, pago de deuda o aporte: al cambiar, si solo hay una deuda o meta queda elegida */
  function chooseKind(k: TargetKind) {
    setKind(k)
    if (k === 'debt' && !myDebts.some((v) => v.debt.id === debtId)) setDebtId(myDebts.length === 1 ? myDebts[0]!.debt.id : '')
    if (k === 'goal' && !data.goals.some((g) => g.id === goalId)) setGoalId(data.goals.length === 1 ? data.goals[0]!.id : '')
  }

  /** Descarta lo anotado y deja la pantalla como recién abierta */
  function reset() {
    setKind('expense')
    setDigits('')
    setNote('')
    setDate('')
    setPickedCat(null)
    setPickedShared(null)
    setPaidBy(hh.me.user_id)
    setDebtId('')
    setGoalId('')
    setDiscount('')
    setMore(false)
    setOthers(false)
    setNoticeText('')
    setNoticeError(null)
    setDraftId(newId())
    setMode('pay')
  }

  /** Lee el aviso pegado y deja el gasto listo: solo falta revisar y guardar */
  function readNotice(text: string) {
    const d = draftFromNotice(text, data.categories, history, new Date())
    if (!d.ok) {
      setNoticeError(d.error)
      return
    }
    setNoticeError(null)
    setKind('expense')
    setDigits(d.digits)
    setNote(d.note)
    setDate(d.date)
    setDiscount('')
    setPickedCat(null)
    setPickedShared(null)
    setMore(d.date !== '')
    setMode('pay')
    onToast(d.catId ? 'Aviso leído\nRevisa que esté bien y **guarda**.' : 'Aviso leído\nElige la **categoría** y guarda.')
  }

  async function pasteNotice() {
    try {
      const text = await navigator.clipboard.readText()
      setNoticeText(text.slice(0, 1000))
      if (text.trim()) readNotice(text)
    } catch {
      setNoticeError('No pudimos leer lo copiado. Mantén apretado el cuadro y elige «Pegar».')
    }
  }

  async function addCategory() {
    const name = newName.trim()
    if (!name) {
      setError('Escribe un nombre para la categoría')
      return
    }
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('categories').insert({
      household_id: hh.household.id,
      name,
      monthly_budget: Number(newBudget || '0'),
      position: data.categories.reduce((mx, c) => Math.max(mx, c.position), 0) + 1,
    })
    if (err) {
      setError(err.code === '23505' ? 'Ya existe una categoría con ese nombre' : 'No se pudo crear la categoría')
      setBusy(false)
      return
    }
    await data.refresh()
    setBusy(false)
    setNewName('')
    setNewBudget('')
    onSaved(`Categoría creada\nYa puedes **registrar** gastos en **${name}**.`)
  }

  async function save() {
    const spentOn = resolveSpentOn(date, today)
    if (blocker || spentOn === null || missingTarget) return
    setBusy(true)
    setError(null)
    if (kind === 'debt' && debt) {
      const { ok } = await saveOnce(() =>
        supabase.from('debt_payments').insert({
          id: draftId,
          household_id: hh.household.id,
          debt_id: debt.debt.id,
          amount,
          paid_by: hh.me.user_id, // un pago de deuda siempre va a nombre de quien lo registra
          paid_on: spentOn,
        }),
      )
      if (!ok) {
        setError('No se pudo registrar el pago. Intenta de nuevo.')
        setBusy(false)
        return
      }
      setDraftId(newId())
      await data.refresh()
      onSaved(`Pago registrado\nSe abonaron **${money(amount)}** a **${debt.debt.name}**.`)
      return
    }
    if (kind === 'goal' && goal) {
      const { ok } = await saveOnce(() =>
        supabase.from('contributions').insert({
          id: draftId,
          household_id: hh.household.id,
          goal_id: goal.id,
          user_id: hh.me.user_id,
          amount,
          contributed_on: spentOn,
        }),
      )
      if (!ok) {
        setError('No se pudo registrar el aporte. Intenta de nuevo.')
        setBusy(false)
        return
      }
      notifyPartner('contribution', draftId)
      setDraftId(newId())
      await data.refresh()
      onSaved(`Aporte registrado\nSumaste **${money(amount)}** a **${goal.name}**.`)
      return
    }
    const { ok } = await saveOnce(() =>
      supabase.from('expenses').insert({
        id: draftId,
        household_id: hh.household.id,
        category_id: catId,
        amount,
        // Un gasto personal es de quien lo anota; solo uno compartido puede pagarlo la otra persona
        paid_by: shared ? paidBy : hh.me.user_id,
        shared,
        note: note.trim(),
        spent_on: spentOn,
      }),
    )
    if (!ok) {
      setError('No se pudo guardar. Intenta de nuevo.')
      setBusy(false)
      return
    }
    notifyPartner('expense', draftId)
    setDraftId(newId())
    await data.refresh()
    onSaved(`Gasto registrado\nSe anotaron **${money(amount)}** en ${catName ? `**${catName}**` : 'tus gastos'}.`)
  }

  const dirty = digits !== '' || note !== '' || kind !== 'expense'
  const kinds: { key: TargetKind; label: string }[] = [
    { key: 'expense', label: 'Gasto' },
    ...(myDebts.length > 0 ? [{ key: 'debt' as const, label: 'Pagar deuda' }] : []),
    ...(data.goals.length > 0 ? [{ key: 'goal' as const, label: 'Aportar a meta' }] : []),
  ]

  return (
    <main className="screen reg">
      <h1 className="sr-only">Registrar</h1>
      <div className="reg-nav">
        {mode !== 'pay' ? (
          <button type="button" className="btn ghost small" onClick={() => setMode('pay')}>
            Volver
          </button>
        ) : dirty ? (
          <button type="button" className="btn ghost small" disabled={busy} onClick={reset}>
            Limpiar
          </button>
        ) : (
          <span />
        )}
        <span />
        <span className="reg-help"><ScreenHelp screen="add" /></span>
      </div>

      {mode === 'pay' && (
        <>
          {kinds.length > 1 && (
            <div className="seg reg-kind" role="group" aria-label="Qué vas a registrar">
              {kinds.map((k) => (
                <button key={k.key} type="button" aria-pressed={kind === k.key} onClick={() => chooseKind(k.key)}>
                  {k.label}
                </button>
              ))}
            </div>
          )}

          <div className="reg-top">
            <div className="reg-amount">
              <span className="muted small-text">{kind === 'debt' ? 'Monto a pagar' : kind === 'goal' ? 'Monto a aportar' : '¿Cuánto fue?'}</span>
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

          {kind === 'debt' && (
            <div className="reg-rows" role="group" aria-label="Qué deuda pagas">
              {myDebts.map((v) => (
                <button key={v.debt.id} type="button" className="reg-row" aria-pressed={debtId === v.debt.id} onClick={() => setDebtId(v.debt.id)}>
                  <span className="reg-row-name">{v.debt.name}</span>
                  <span className="reg-row-sub">Debes {money(v.remaining)}</span>
                </button>
              ))}
            </div>
          )}
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
          {debt && gross > debt.remaining && (
            <p className="reg-fb bad" role="alert">
              No puedes pagar más de lo que debes. Esta deuda tiene un saldo de {money(debt.remaining)}.
            </p>
          )}
          {kind === 'goal' && (
            <div className="reg-rows" role="group" aria-label="A qué meta aportas">
              {data.goals.map((g) => (
                <button key={g.id} type="button" className="reg-row" aria-pressed={goalId === g.id} onClick={() => setGoalId(g.id)}>
                  <span className="reg-row-name">{g.name}</span>
                  <span className="reg-row-sub">Meta {money(g.target_amount)}</span>
                </button>
              ))}
            </div>
          )}

          {isExpense && (
            <>
              <div className="reg-note field">
                <label htmlFor="reg-note" className="sr-only">¿De qué fue?</label>
                <input
                  id="reg-note"
                  className="input"
                  placeholder="¿De qué fue? Ej. Lider, bencina, almuerzo"
                  maxLength={120}
                  required
                  enterKeyHint="done"
                  autoComplete="off"
                  aria-invalid={gross > 0 && !note.trim()}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {data.categories.length === 0 ? (
                <p className="muted">Aún no hay categorías. Crea una en «Crear otra cosa».</p>
              ) : (
                <div className="chips reg-catrow" ref={catRow} role="group" aria-label={pickedCat === null && suggestedCat ? 'Categoría (elegida sola, toca otra para cambiarla)' : 'Categoría'}>
                  {data.categories.map((c) => (
                    <button key={c.id} type="button" className="chip" aria-pressed={catId === c.id} onClick={() => setPickedCat(c.id)}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}

              {multi && (
                <div className="seg" role="group" aria-label="De quién es el gasto">
                  <button type="button" aria-pressed={shared} onClick={() => setPickedShared(true)}>
                    <Icon name="users" size={18} /> Compartido
                  </button>
                  <button type="button" aria-pressed={!shared} onClick={() => setPickedShared(false)}>
                    <Icon name="user" size={18} /> Personal
                  </button>
                </div>
              )}
            </>
          )}

          <div className="keypad reg-keys" role="group" aria-label="Teclado numérico">
            {KEYS.map((k) => (
              <button key={k} type="button" className="key" onClick={() => press(k)} aria-label={k === 'back' ? 'Borrar' : k}>
                {k === 'back' ? <Icon name="back" /> : k}
              </button>
            ))}
          </div>

          <button className="btn reg-save" type="button" disabled={!canSave} onClick={() => void save()}>
            {busy ? <Spin label="Guardando…" /> : kind === 'debt' && !debt ? 'Elige la deuda' : kind === 'goal' && !goal ? 'Elige la meta' : saveLabel(blocker, amount, kind)}
          </button>

          <div className="reg-links">
            <button type="button" className="btn ghost small" aria-expanded={more} onClick={() => setMore((v) => !v)}>
              {more ? 'Menos opciones' : 'Más opciones'}
            </button>
            {isExpense && (
              <button type="button" className="btn ghost small" onClick={() => setMode('notice')}>
                <Icon name="bell" size={18} /> Aviso del banco
              </button>
            )}
          </div>

          {more && (
            <section className="reg-card">
              <div className="reg-meta">
                <label htmlFor="spent-on" className="muted small-text">¿Qué día fue? (si no, se anota hoy)</label>
                <input id="spent-on" className="input" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha del gasto" />
              </div>
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
              {isExpense && (
                <div className="reg-meta">
                  <label htmlFor="reg-disc" className="muted small-text">¿Tuvo descuento? Escribe el porcentaje</label>
                  <div className="reg-pct">
                    <input
                      id="reg-disc"
                      className="input"
                      inputMode="decimal"
                      placeholder="0"
                      maxLength={5}
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value.replace(/[^\d.,]/g, ''))}
                    />
                    <span>%</span>
                  </div>
                </div>
              )}
            </section>
          )}

          <button type="button" className="btn ghost" aria-expanded={others} onClick={() => setOthers((v) => !v)}>
            {others ? 'Ocultar' : 'Crear otra cosa'}
          </button>
          {others && (
            <div className="reg-rows">
              <button type="button" className="reg-row" onClick={() => setMode('fixed')}>
                <span className="reg-row-name">Gasto fijo</span>
                <span className="reg-row-sub">Arriendo, luz, internet</span>
              </button>
              <button type="button" className="reg-row" onClick={() => setMode('debt')}>
                <span className="reg-row-name">Deuda</span>
                <span className="reg-row-sub">Para tu plan de pago</span>
              </button>
              <button type="button" className="reg-row" onClick={() => setMode('goal')}>
                <span className="reg-row-name">Meta</span>
                <span className="reg-row-sub">Un objetivo para ahorrar</span>
              </button>
              <button type="button" className="reg-row" onClick={() => setMode('category')}>
                <span className="reg-row-name">Categoría</span>
                <span className="reg-row-sub">Un grupo nuevo de gastos</span>
              </button>
            </div>
          )}
        </>
      )}

      {mode === 'notice' && (
        <section className="reg-ask">
          <h2 className="reg-q">Pega el aviso de tu compra</h2>
          <button type="button" className="btn wide reg-ok" onClick={() => void pasteNotice()}>
            Pegar lo que copié
          </button>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); readNotice(noticeText) }}>
            <div className="field">
              <label htmlFor="bn-text" className="strong">O escríbelo aquí</label>
              <textarea
                id="bn-text"
                className="input reg-notice"
                rows={4}
                maxLength={1000}
                placeholder="Ej. Compra por $12.990 en LIDER con tu tarjeta…"
                value={noticeText}
                onChange={(e) => { setNoticeText(e.target.value); setNoticeError(null) }}
              />
              <span className="hint">Se lee en tu teléfono: el mensaje no se envía a ningún lado.</span>
            </div>
            {noticeError && <p className="error" role="alert">{noticeError}</p>}
            <button type="submit" className="btn ghost wide" disabled={!noticeText.trim()}>
              Leer aviso
            </button>
          </form>
        </section>
      )}

      {mode === 'category' && (
        <section className="reg-ask">
          <h2 className="reg-q">¿Cómo se llama la categoría?</h2>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void addCategory() }}>
            <div className="field">
              <label htmlFor="nc-name" className="strong">Nombre</label>
              <input id="nc-name" className="input" maxLength={40} placeholder="Ej. Mascotas, Educación" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="nc-budget" className="strong">Límite al mes (opcional)</label>
              <input id="nc-budget" className="input" inputMode="numeric" placeholder="Ej. 80000" value={dots(newBudget)} onChange={(e) => setNewBudget(digitsOnly(e.target.value))} />
              <span className="hint">Te avisamos cuando te acerques a este monto.</span>
            </div>
            <button className="btn reg-save" type="submit" disabled={busy || !newName.trim()}>
              {busy ? <Spin label="Creando categoría…" /> : 'Crear categoría'}
            </button>
          </form>
        </section>
      )}

      {mode === 'fixed' && (
        <section className="reg-ask">
          <h2 className="reg-q">Nuevo gasto fijo</h2>
          <RecurringCreateForm hh={hh} data={data} onToast={onToast} onSaved={() => onSaved()} />
        </section>
      )}

      {mode === 'goal' && (
        <section className="reg-ask">
          <h2 className="reg-q">Nueva meta</h2>
          <GoalCreateForm hh={hh} data={data} onToast={onToast} onSaved={() => onSaved()} />
        </section>
      )}

      {mode === 'debt' && (
        <section className="reg-ask">
          <DebtGuidedForm embedded hh={hh} data={data} onClose={() => setMode('pay')} onToast={onToast} onSaved={() => onSaved()} />
        </section>
      )}
    </main>
  )
}
