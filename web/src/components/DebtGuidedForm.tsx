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
  const multi = hh.members.length > 1
  const [step, setStep] = useState(0)

  // Una pregunta por pantalla; los pasos dependen de lo que se va respondiendo
  const steps: string[] = ['who']
  if (who === 'otra') steps.push('link')
  if (who === 'otra' && link === 'institucion') steps.push('inst')
  if (isPerson) steps.push('person')
  if (!isPerson) steps.push('type')
  steps.push('total')
  if (isPerson) steps.push('interest', 'fee')
  else steps.push('term', 'rate', 'fee')
  if (multi) steps.push('owner')
  steps.push('due')
  const cur = steps[Math.min(step, steps.length - 1)]!
  const last = cur === steps[steps.length - 1]

  const okByStep: Record<string, boolean> = {
    who: who !== '',
    link: link !== null,
    inst: inst.trim().length > 0,
    person: person.trim().length > 0,
    type: type !== null,
    total: amount > 0,
    interest: true,
    term: true,
    rate: true,
    fee: true,
    owner: true,
    due: true,
  }
  const canNext = okByStep[cur] ?? true

  const title: Record<string, string> = {
    who: '¿Con quién tienes la deuda?',
    link: '¿Es con un banco o con una persona?',
    inst: '¿Cuál es?',
    person: '¿A quién le debes?',
    type: '¿Qué tipo de deuda es?',
    total: isPerson ? '¿Cuánto le debes hoy?' : '¿Cuánto falta pagar hoy?',
    interest: '¿Te cobra interés?',
    term: typeInfo?.years ? '¿En cuántos años termina?' : '¿Cuántas cuotas te faltan?',
    rate: '¿Qué interés al mes tiene?',
    fee: isPerson ? '¿Le pagas una cuota fija al mes?' : '¿Cuánto es la cuota al mes?',
    owner: '¿Quién la debe?',
    due: '¿Qué día vence la cuota?',
  }

  function next(e: FormEvent) {
    e.preventDefault()
    if (!canNext) return
    if (last) void submit(e)
    else setStep((v) => v + 1)
  }

  return (
    <div className="card cat-sheet">
      <form className="stack cat-detail" onSubmit={next}>
        <div className="row between">
          <strong className="cat-title">Agregar deuda</strong>
          <button className="btn ghost small" type="button" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="stack tight">
          <span className="muted small-text">Paso {Math.min(step, steps.length - 1) + 1} de {steps.length}</span>
          <div className="bar" aria-hidden="true">
            <span style={{ width: `${((Math.min(step, steps.length - 1) + 1) * 100) / steps.length}%`, background: 'var(--accent)' }} />
          </div>
        </div>

        <h2 className="cat-verdict" id="g-q">{title[cur]}</h2>

        {cur === 'who' && (
          <div className="field">
            <select id="g-who" aria-labelledby="g-q" className="input" value={who} onChange={(e) => pickWho(e.target.value)}>
              <option value="">Elige una opción…</option>
              {BANKS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value="otra">Otra (otro banco, tienda o persona)</option>
            </select>
            {bank && <span className="line-help">Con {bank.name} te sugerimos sus tasas.</span>}
          </div>
        )}

        {cur === 'link' && (
          <div className="stack tight" role="group" aria-labelledby="g-q">
            <button type="button" className="chip" aria-pressed={link === 'institucion'} onClick={() => { setLink('institucion'); setType(null) }}>
              Un banco, tienda o institución
            </button>
            <button type="button" className="chip" aria-pressed={link === 'persona'} onClick={() => { setLink('persona'); setType(null) }}>
              Una persona (familiar o amigo)
            </button>
          </div>
        )}

        {cur === 'inst' && (
          <input id="g-inst" aria-labelledby="g-q" className="input" maxLength={40} placeholder="Ej. Ripley, Cooperativa" value={inst} onChange={(e) => setInst(e.target.value)} />
        )}

        {cur === 'person' && (
          <input id="g-person" aria-labelledby="g-q" className="input" maxLength={40} placeholder="Ej. Mamá, Juan" value={person} onChange={(e) => setPerson(e.target.value)} />
        )}

        {cur === 'type' && (
          <div className="stack tight" role="group" aria-labelledby="g-q">
            {TYPES.filter((t) => !bank || t.product !== null).map((t) => (
              <button key={t.key} type="button" className="chip" aria-pressed={type === t.key} onClick={() => { setType(t.key); setRate(null); setFee(null); setTerm('') }}>
                {t.label}
              </button>
            ))}
            {typeInfo && <span className="line-help">{typeInfo.help}</span>}
          </div>
        )}

        {cur === 'total' && (
          <input id="g-total" aria-labelledby="g-q" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 800000" value={dots(total)} onChange={(e) => setTotal(digitsOnly(e.target.value))} />
        )}

        {cur === 'interest' && (
          <div className="stack tight">
            <div className="seg" role="group" aria-labelledby="g-q">
              <button type="button" aria-pressed={!interest} onClick={() => setInterest(false)}>
                No
              </button>
              <button type="button" aria-pressed={interest} onClick={() => setInterest(true)}>
                Sí
              </button>
            </div>
            {interest && (
              <input id="g-rate" aria-label="Interés mensual en %" autoComplete="off" className="input" inputMode="decimal" placeholder="Ej. 2 (% al mes)" value={rateStr} onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))} />
            )}
          </div>
        )}

        {cur === 'term' && (
          <div className="stack tight">
            <div className="chips" role="group" aria-labelledby="g-q">
              {(typeInfo?.years ? YEAR_CHIPS : MONTH_CHIPS).map((n) => (
                <button key={n} type="button" className="chip" aria-pressed={term === String(n)} onClick={() => { setTerm(String(n)); setFee(null) }}>
                  {n} {typeInfo?.years ? 'años' : 'cuotas'}
                </button>
              ))}
            </div>
            <input className="input" aria-label={typeInfo?.years ? 'Años que faltan' : 'Cuotas que faltan'} autoComplete="off" inputMode="numeric" placeholder={typeInfo?.years ? 'Otro plazo en años' : 'Otro número de cuotas'} value={term} onChange={(e) => { setTerm(digitsOnly(e.target.value).slice(0, 3)); setFee(null) }} />
            <span className="line-help">Si no lo sabes, sigue: es opcional.</span>
          </div>
        )}

        {cur === 'rate' && (
          <div className="stack tight">
            {range && (
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
            )}
            <input id="g-rate" aria-labelledby="g-q" autoComplete="off" className="input" inputMode="decimal" placeholder="Ej. 2,5 (% al mes)" value={rateStr} onChange={(e) => { setRate(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5)); setFee(null) }} />
            <span className="line-help">{range ? `${bank?.name} publica hasta ${fmtRate(range.max)} % al mes. Pusimos el máximo.` : 'Está en tu contrato o cartola. Si no lo sabes, sigue.'}</span>
          </div>
        )}

        {cur === 'fee' && (
          <div className="stack tight">
            <input id="g-fee" aria-labelledby="g-q" autoComplete="off" className="input" inputMode="numeric" placeholder="Ej. 65000" value={dots(feeStr)} onChange={(e) => setFee(digitsOnly(e.target.value))} />
            {calcFee > 0 && <span className="line-help">Calculada para ti: {money(calcFee)}. Cámbiala si tu cuota real es distinta.</span>}
            {amount > 0 && feeNum > 0 && (
              <span className="hint">
                {payoffMonths === null
                  ? 'Con esa cuota la deuda no baja: conviene subirla.'
                  : `Terminarías en ~${payoffMonths} ${payoffMonths === 1 ? 'mes' : 'meses'}${plan && plan.interest > 0 ? ` y pagarías ~${money(plan.interest)} de interés` : ''}.`}
              </span>
            )}
          </div>
        )}

        {cur === 'owner' && (
          <div className="stack tight">
            <div className="seg" role="group" aria-labelledby="g-q">
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

        {cur === 'due' && (
          <select id="g-due" aria-labelledby="g-q" className="input" value={due} onChange={(e) => setDue(e.target.value)}>
            <option value="">No sé / sin día</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Día {n}
              </option>
            ))}
          </select>
        )}

        <div className="stack tight">
          <button className="btn" type="submit" disabled={busy || !canNext}>
            {busy ? <Spin label="Guardando deuda…" /> : last ? 'Guardar deuda' : 'Siguiente'}
          </button>
          {step > 0 && (
            <button className="btn ghost" type="button" onClick={() => setStep((v) => Math.max(0, v - 1))}>
              Atrás
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
