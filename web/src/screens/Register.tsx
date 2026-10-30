import ScreenHelp from '../components/ScreenHelp'
import { useToastError } from '../lib/useToastError'
import type { Notify } from '../components/Toast'
import { useState } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import Icon from '../components/Icon'
import { money, todayISO } from '../lib/format'
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
  // 1: ¿personal o compartido? · 2: ¿descuento? · 3: ¿en qué se gastó? · 4: monto y guardar
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [shared, setShared] = useState(true)
  const [more, setMore] = useState(false)
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO)
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  const [hasDiscount, setHasDiscount] = useState(false)
  const [discount, setDiscount] = useState('')

  const gross = digits ? Number(digits) : 0
  const pct = hasDiscount ? Math.min(100, Math.max(0, Number(discount.replace(',', '.')) || 0)) : 0
  // Lo que realmente se pagó, ya con el descuento aplicado
  const amount = Math.round(gross * (1 - pct / 100))
  const today = todayISO()

  function press(k: (typeof KEYS)[number]) {
    setDigits((d) => {
      if (k === 'back') return d.slice(0, -1)
      const next = (d + k).replace(/^0+/, '')
      return next.length > 9 ? d : next
    })
  }

  async function save() {
    if (amount <= 0 || !catId || !date || date > today) return
    setBusy(true)
    setError(null)
    const { data: created, error: err } = await supabase.from('expenses').insert({
      household_id: hh.household.id,
      category_id: catId,
      amount,
      paid_by: paidBy,
      shared,
      note: note.trim() || null,
      spent_on: date,
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
    if (step === 3 && !hasDiscount) setStep(2)
    else setStep((n) => (n > first ? ((n - 1) as 1 | 2 | 3 | 4) : n))
  }

  function chooseShared(v: boolean) {
    setShared(v)
    setStep(2)
  }

  function chooseDiscount(v: boolean) {
    setHasDiscount(v)
    if (!v) setDiscount('')
    if (!v) setStep(3)
  }

  const canSave = !busy && amount > 0 && !!catId && !!date && date <= today

  return (
    <main className="screen reg">
      <div className="reg-nav">
        {step > first ? (
          <button type="button" className="btn ghost small" onClick={back}>
            Volver
          </button>
        ) : (
          <span />
        )}
        <div className="reg-steps" aria-label={`Paso ${step - first + 1} de ${5 - first}`}>
          {[1, 2, 3, 4].filter((n) => n >= first).map((n) => (
            <span key={n} className={n === step ? 'on' : n < step ? 'done' : ''} />
          ))}
        </div>
        <span className="reg-help"><ScreenHelp screen="add" /></span>
      </div>

      {step > first && (
        <div className="reg-sum" role="group" aria-label="Lo que elegiste">
          {(
            <button type="button" className="chip" onClick={() => setStep(1)}>
              {shared ? '👥 Compartido' : '👤 Personal'}
            </button>
          )}
          {step > 2 && (
            <button type="button" className="chip" onClick={() => { setHasDiscount(pct > 0); setStep(2) }}>
              {pct > 0 ? `🏷️ ${pct}% desc.` : '🏷️ Sin descuento'}
            </button>
          )}
          {step > 3 && catName && (
            <button type="button" className="chip" onClick={() => setStep(3)}>
              🛒 {catName}
            </button>
          )}
        </div>
      )}

      {step === 1 && (
        <section className="reg-ask">
          <h2 className="reg-q">¿Es un gasto personal o compartido?</h2>
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

      {step === 2 && (
        <section className="reg-ask">
          <h2 className="reg-q">¿Tiene descuento?</h2>
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
              <p className="reg-hint">Toque el descuento que le hicieron:</p>
              <div className="reg-pcts">
                {[10, 20, 30, 50].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="reg-pctbtn"
                    aria-pressed={pct === p}
                    onClick={() => {
                      setDiscount(String(p))
                      setStep(3)
                    }}
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <div className="reg-other">
                <label htmlFor="disc-other" className="reg-hint">¿Fue otro porcentaje? Escríbalo aquí:</label>
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
                <button type="button" className="btn reg-ok" disabled={pct <= 0} onClick={() => setStep(3)}>
                  {pct > 0 ? `✔ Continuar con ${pct}%` : 'Escriba el número y continúe'}
                </button>
              </div>
              <button type="button" className="btn ghost" onClick={() => chooseDiscount(false)}>
                No tiene descuento
              </button>
            </>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="reg-ask">
          <h2 className="reg-q">¿En qué se gastó?</h2>
          {data.categories.length === 0 && <p className="muted">Aún no hay categorías para elegir.</p>}
          <div className="reg-catgrid" role="group" aria-label="Categoría">
            {data.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="reg-pctbtn reg-catbtn"
                aria-pressed={catId === c.id}
                onClick={() => {
                  setCatId(c.id)
                  setStep(4)
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 4 && (
        <>
          <div className="reg-top">
            <div className="reg-amount">
              <span className="muted small-text">{catName ? `Nuevo gasto en ${catName}` : 'Nuevo gasto'}</span>
              <div className={gross > 0 ? 'amount big num' : 'amount big num reg-empty'} aria-live="polite">
                {money(gross)}
              </div>
              {pct > 0 && gross > 0 && (
                <span className="muted small-text">
                  Queda en <strong>{money(amount)}</strong> con {pct}% de descuento
                </span>
              )}
            </div>
          </div>
          <div className="keypad reg-keys">
            {KEYS.map((k) => (
              <button key={k} type="button" className="key" onClick={() => press(k)} aria-label={k === 'back' ? 'Borrar' : k}>
                {k === 'back' ? <Icon name="back" /> : k}
              </button>
            ))}
          </div>

          <button className="btn reg-save" type="button" disabled={!canSave} onClick={() => void save()}>
            {busy ? <Spin label="Guardando gasto…" /> : amount > 0 ? `Guardar ${money(amount)}` : 'Escribe el monto'}
          </button>

          <button type="button" className="btn ghost" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {more ? 'Ocultar' : (multi ? 'Más: quién pagó, fecha, nota' : 'Más: fecha y nota')}
          </button>
          {more && (
            <section className="reg-card">
              {multi && (
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
                <input
                  id="spent-on"
                  className="input"
                  type="date"
                  max={today}
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Fecha del gasto"
                />
                <input
                  className="input"
                  placeholder="Nota (opcional)"
                  maxLength={120}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  aria-label="Nota"
                />
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}
