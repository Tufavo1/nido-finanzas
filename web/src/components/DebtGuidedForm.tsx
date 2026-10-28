import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { BANKS } from '../lib/bankData'
import type { RateProduct } from '../lib/bankData'
import { offersFor } from '../lib/bankRates'
import { installment, monthsToPayoff, payoffPlan } from '../lib/finance'
import { money } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import { digitsOnly, dots } from '../lib/ui'
import Spin from './Spin'
import type { Notify } from './Toast'

type Who = '' | string | 'otra'
type Link = 'institucion' | 'persona'
type TypeKey = 'tarjeta' | 'consumo' | 'hipotecario' | 'auto' | 'linea'

const TYPES: { key: TypeKey; label: string; kind: 'tarjeta' | 'credito' | 'otro'; product: RateProduct | null; years: boolean; help: string }[] = [
  { key: 'tarjeta', label: 'Tarjeta de crédito', kind: 'tarjeta', product: 'tarjeta', years: false, help: 'Compras o avances que están pagando en cuotas.' },
  { key: 'consumo', label: 'Crédito de consumo', kind: 'credito', product: 'consumo', years: false, help: 'Un préstamo en pesos que se paga en cuotas.' },
  { key: 'hipotecario', label: 'Crédito hipotecario', kind: 'credito', product: 'hipotecario', years: true, help: 'El crédito de la casa o el departamento (dividendo).' },
  { key: 'auto', label: 'Crédito automotriz', kind: 'credito', product: null, years: false, help: 'El crédito con que compraron el auto.' },
  { key: 'linea', label: 'Línea de crédito', kind: 'otro', product: null, years: false, help: 'El cupo que se usa cuando la cuenta queda en cero.' },
]

const MONTH_CHIPS = [6, 12, 24, 36, 48, 60]
const YEAR_CHIPS = [15, 20, 25, 30]
const fmtRate = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
const num = (s: string) => Number(s.replace(',', '.') || '0')

/** Alta de una deuda en pasos: a quién se le debe, qué tipo es, y solo los datos que ese tipo necesita. */
export default function DebtGuidedForm({ hh, data, onClose, onToast, defaultOwner = '' }: { hh: Household; data: HouseholdData; onClose: () => void; onToast: Notify; defaultOwner?: string }) {
  const [who, setWho] = useState<Who>('')
  const [link, setLink] = useState<Link | null>(null)
  const [inst, setInst] = useState('')
  const [person, setPerson] = useState('')
  const [type, setType] = useState<TypeKey | null>(null)
  const [total, setTotal] = useState('')
  const [term, setTerm] = useState('')
  const [fee, setFee] = useState<string | null>(null)
  const [rate, setRate] = useState<string | null>(null)
  const [interest, setInterest] = useState(false)
  const [owner, setOwner] = useState(defaultOwner)
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  const bank = BANKS.find((b) => b.id === who) ?? null
  const isPerson = who === 'otra' && link === 'persona'
  const typeInfo = TYPES.find((t) => t.key === type) ?? null
  const amount = num(total)
  const termCount = Number(term) || 0
  const months = typeInfo?.years ? termCount * 12 : termCount

  // Los bancos con tasas publicadas ofrecen un punto de partida para el interés
  const suggestion = useMemo(() => {
    if (!bank || !typeInfo?.product) return null
    return offersFor(typeInfo.product, amount > 0 ? amount : undefined).find((o) => o.bank.id === bank.id) ?? null
  }, [bank, typeInfo, amount])

  const rateStr = rate ?? (suggestion && !isPerson ? fmtRate(suggestion.range.max) : '')
  const rateNum = isPerson && !interest ? 0 : num(rateStr)
  const calcFee = !isPerson && months > 0 && amount > 0 ? installment(amount, months, rateNum) : 0
  const feeStr = fee ?? (calcFee > 0 ? String(calcFee) : '')
  const feeNum = Number(feeStr) || 0

  const plan = amount > 0 && feeNum > 0 ? payoffPlan(amount, feeNum, rateNum) : null
  const payoffMonths = amount > 0 && feeNum > 0 ? monthsToPayoff(amount, feeNum, rateNum) : undefined

  // Qué pasos ya están resueltos, para ir mostrando el resto de a poco
  const knowsWho = who !== '' && (who !== 'otra' || link !== null)
  const hasName = isPerson ? person.trim().length > 0 : who === 'otra' ? inst.trim().length > 0 : true
  const ready = knowsWho && hasName && (isPerson || type !== null)

  function pickWho(v: Who) {
    setWho(v)
    setLink(null)
    setType(null)
    setRate(null)
    setFee(null)
    setTerm('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const dueDay = due ? Number(due) : null
    if (!ready) return setError('Completa los pasos de arriba')
    if (!amount || amount <= 0) return setError('Ingresa cuánto se debe hoy')
    if (Number.isNaN(rateNum) || rateNum < 0 || rateNum > 30) return setError('El interés mensual debe estar entre 0 y 30 %')
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) return setError('El día de vencimiento va de 1 a 31')
    const name = isPerson ? `Préstamo de ${person.trim()}` : `${bank ? bank.name : inst.trim()} · ${typeInfo?.label ?? ''}`
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('debts').insert({
      household_id: hh.household.id,
      name: name.slice(0, 60),
      kind: isPerson ? 'prestamo' : (typeInfo?.kind ?? 'otro'),
      owner_id: owner || null,
      original_amount: amount,
      monthly_payment: feeNum,
      monthly_rate: rateNum,
      due_day: dueDay,
    })
    setBusy(false)
    if (err) {
      setError('No se pudo guardar la deuda')
      return
    }
    onToast('Deuda agregada\nYa aparece en tu plan de **pago**.')
    onClose()
    await data.refresh()
  }

  const range = suggestion?.range

  return (
    <form className="card" onSubmit={(e) => void submit(e)}>
      <strong>Agregar una deuda</strong>

      <div className="field">
        <label htmlFor="g-who">1. ¿Con quién tienes la deuda?</label>
        <select id="g-who" className="input" value={who} onChange={(e) => pickWho(e.target.value)}>
          <option value="">Elige una opción…</option>
          {BANKS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value="otra">Otra (otro banco, una tienda o una persona)</option>
        </select>
        {bank && <span className="line-help">Con {bank.name} la app ya conoce sus tasas y te las sugiere.</span>}
      </div>

      {who === 'otra' && (
        <div className="field">
          <span id="g-link" className="strong">¿Es con un banco o con una persona?</span>
          <div className="chips" role="group" aria-labelledby="g-link">
            <button type="button" className="chip" aria-pressed={link === 'institucion'} onClick={() => { setLink('institucion'); setType(null) }}>
              Un banco, tienda o institución
            </button>
            <button type="button" className="chip" aria-pressed={link === 'persona'} onClick={() => { setLink('persona'); setType(null) }}>
              Una persona (familiar o amigo)
            </button>
          </div>
        </div>
      )}

      {who === 'otra' && link === 'institucion' && (
        <div className="field">
          <label htmlFor="g-inst">¿Cuál es? </label>
          <input id="g-inst" className="input" maxLength={40} placeholder="Ej. Banco Estado, Líder, Ripley, Cooperativa" value={inst} onChange={(e) => setInst(e.target.value)} />
        </div>
      )}

      {isPerson && (
        <div className="field">
          <label htmlFor="g-person">¿A quién le debes?</label>
          <input id="g-person" className="input" maxLength={40} placeholder="Ej. Mamá, Juan, mi hermano" value={person} onChange={(e) => setPerson(e.target.value)} />
        </div>
      )}

      {knowsWho && !isPerson && hasName && (
        <div className="field">
          <span id="g-type" className="strong">2. ¿Qué tipo de deuda es?</span>
          <div className="chips" role="group" aria-labelledby="g-type">
            {TYPES.filter((t) => !bank || t.product !== null).map((t) => (
              <button key={t.key} type="button" className="chip" aria-pressed={type === t.key} onClick={() => { setType(t.key); setRate(null); setFee(null); setTerm('') }}>
                {t.label}
              </button>
            ))}
          </div>
          {typeInfo && <span className="line-help">{typeInfo.help}</span>}
        </div>
      )}

      {ready && (
        <>
          <div className="field">
            <label htmlFor="g-total">{isPerson ? '2. ¿Cuánto le debes hoy?' : '3. ¿Cuánto falta pagar hoy?'}</label>
            <span className="line-help">
              {typeInfo?.key === 'tarjeta' ? 'La deuda que tienes en cuotas, o el monto facturado.' : 'Lo que falta pagar ahora, no lo que pidieron al principio.'}
            </span>
            <input id="g-total" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 800000" value={dots(total)} onChange={(e) => setTotal(digitsOnly(e.target.value))} />
          </div>

          {isPerson ? (
            <>
              <div className="field">
                <span id="g-int" className="strong">3. ¿Te cobra interés?</span>
                <div className="seg" role="group" aria-labelledby="g-int">
                  <button type="button" aria-pressed={!interest} onClick={() => setInterest(false)}>
                    No
                  </button>
                  <button type="button" aria-pressed={interest} onClick={() => setInterest(true)}>
                    Sí
                  </button>
                </div>
                <span className="line-help">Entre familiares y amigos casi siempre es no.</span>
              </div>
              {interest && (
                <div className="field">
                  <label htmlFor="g-rate">Interés mensual en %</label>
                  <input id="g-rate" autoComplete="off" className="input" inputMode="decimal" placeholder="Ej. 2" value={rateStr} onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))} />
                </div>
              )}
              <div className="field">
                <label htmlFor="g-fee">4. ¿Le pagas una cuota fija cada mes? (opcional)</label>
                <span className="line-help">Si pagan cuando puedan, déjalo vacío: la deuda queda anotada sin plazo.</span>
                <input id="g-fee" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 50000" value={dots(feeStr)} onChange={(e) => setFee(digitsOnly(e.target.value))} />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <span id="g-term" className="strong">
                  {typeInfo?.years ? '4. ¿En cuántos años termina?' : typeInfo?.key === 'linea' ? '4. ¿En cuántos meses quieren pagarla?' : '4. ¿Cuántas cuotas te faltan?'}
                </span>
                <div className="chips" role="group" aria-labelledby="g-term">
                  {(typeInfo?.years ? YEAR_CHIPS : MONTH_CHIPS).map((n) => (
                    <button key={n} type="button" className="chip" aria-pressed={term === String(n)} onClick={() => { setTerm(String(n)); setFee(null) }}>
                      {n} {typeInfo?.years ? 'años' : 'cuotas'}
                    </button>
                  ))}
                </div>
                <input className="input" aria-label={typeInfo?.years ? 'Años que faltan' : 'Cuotas que faltan'} autoComplete="off" inputMode="numeric" placeholder={typeInfo?.years ? 'Otro plazo en años' : 'Otro número de cuotas'} value={term} onChange={(e) => { setTerm(digitsOnly(e.target.value).slice(0, 3)); setFee(null) }} />
              </div>

              <div className="field">
                <label htmlFor="g-rate">5. Interés mensual en %</label>
                {range ? (
                  <>
                    <span className="line-help">
                      {bank?.name} publica {range.min !== null ? `entre ${fmtRate(range.min)} % y ${fmtRate(range.max)} %` : `hasta ${fmtRate(range.max)} %`} al mes para este monto
                      {suggestion?.approx ? ' (la tasa anual dividida en 12)' : ''}. Pusimos el máximo; si conoces la tuya, cámbiala.
                    </span>
                    <div className="chips" role="group" aria-label="Tasa sugerida">
                      {range.min !== null && (
                        <button type="button" className="chip" aria-pressed={rateStr === fmtRate(range.min)} onClick={() => { setRate(fmtRate(range.min!)); setFee(null) }}>
                          Mínima {fmtRate(range.min)} %
                        </button>
                      )}
                      <button type="button" className="chip" aria-pressed={rateStr === fmtRate(range.max)} onClick={() => { setRate(fmtRate(range.max)); setFee(null) }}>
                        Máxima {fmtRate(range.max)} %
                      </button>
                    </div>
                  </>
                ) : (
                  <span className="line-help">Aparece en el contrato o la cartola como tasa mensual. Si no la sabes, déjala vacía.</span>
                )}
                <input id="g-rate" autoComplete="off" className="input" inputMode="decimal" placeholder="Ej. 2,5" value={rateStr} onChange={(e) => { setRate(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5)); setFee(null) }} />
              </div>

              <div className="field">
                <label htmlFor="g-fee">6. Cuota mensual</label>
                <span className="line-help">
                  {calcFee > 0 ? `Calculada con el saldo, las cuotas y el interés: ${money(calcFee)}. Cámbiala si tu cuota real es distinta.` : 'Lo que pagas cada mes. Si eliges las cuotas arriba, la calculamos sola.'}
                </span>
                <input id="g-fee" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 65000" value={dots(feeStr)} onChange={(e) => setFee(digitsOnly(e.target.value))} />
              </div>
            </>
          )}

          {amount > 0 && feeNum > 0 && (
            <div className="verdict ok">
              {payoffMonths === null ? (
                <span className="hint">Con esa cuota y ese interés la deuda no baja: conviene subir la cuota.</span>
              ) : (
                <span className="hint">
                  Pagando {money(feeNum)} al mes terminarías en ~{payoffMonths} {payoffMonths === 1 ? 'mes' : 'meses'}
                  {plan && plan.interest > 0 ? ` y pagarías ~${money(plan.interest)} en intereses.` : '.'}
                </span>
              )}
            </div>
          )}

          <div className="field">
            <span id="g-owner" className="strong">{isPerson ? '5.' : '7.'} ¿Quién la debe?</span>
            <div className="seg" role="group" aria-labelledby="g-owner">
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
              {owner === '' ? 'Las cuotas se reparten según lo acordado entre los dos.' : owner === hh.me.user_id ? 'La cuota cuenta solo en tus cálculos.' : 'La cuota cuenta solo en los cálculos de esa persona.'}
            </span>
          </div>

          <div className="field">
            <label htmlFor="g-due">{isPerson ? '6.' : '8.'} Día de vencimiento (opcional)</label>
            <span className="line-help">El día del mes en que hay que pagar la cuota. Te avisamos cuando se acerque.</span>
            <input id="g-due" className="input" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </div>
        </>
      )}

      <div className="row">
        <button className="btn small" type="submit" disabled={busy || !ready}>
          {busy ? <Spin label="Guardando deuda…" /> : 'Guardar deuda'}
        </button>
        <button className="btn ghost small" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
