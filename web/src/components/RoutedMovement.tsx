// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import CategoryPicker from './CategoryPicker'
import { suggestCategory } from '../lib/categorize'
import { matchDebt, moveChoice, preselectDebt } from '../lib/debtMatch'
import type { DebtLite } from '../lib/debtMatch'
import { money } from '../lib/format'
import type { MonthEffect } from '../lib/monthLeft'
import type { NativeDraft } from '../lib/nativeBridge'
import { digitsOnly, dots } from '../lib/ui'

type Target = 'debt' | 'new' | 'expense'

interface Props {
  d: NativeDraft
  dayLabel: string
  debts: DebtLite[]
  categories: { id: string; name: string }[]
  history: { note: string | null; category_id: string }[]
  /** Hay un guardado en curso: todo se apaga para no duplicar toques */
  off: boolean
  /** Ejecuta el guardado mostrando el error sin quitar el borrador (lo decide quien lo recibe) */
  run: (job: (() => Promise<void>) | undefined) => void
  onPayDebt?: (d: NativeDraft, debtId: string) => Promise<void>
  onPayNewDebt?: (d: NativeDraft, name: string, balance: number) => Promise<void>
  onSaveAsExpense: (d: NativeDraft, categoryId: string) => Promise<void>
  onIgnore: (d: NativeDraft) => void
  /** Lo que queda del mes si se guarda así; null = sin dato de sueldo, no se muestra */
  monthLeft?: (d: NativeDraft, effect: MonthEffect, debtId?: string) => number | null
}

/** Opciones de una sola elección (radio) con flechas del teclado; cada opción mide 52 px. */
export function Choices<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T | null; options: { value: T; text: string }[]; onChange: (v: T) => void; disabled: boolean }) {
  const id = `ch-${label.replace(/\W+/g, '').slice(0, 12)}-${options.map((o) => o.value).join('').slice(0, 12)}`
  return (
    <div className="stack tight">
      <strong className="small-text" id={id}>
        {label}
      </strong>
      <div className="radio-list" role="radiogroup" aria-labelledby={id}>
        {options.map((o, i) => {
          const sel = value === o.value
          return (
            <button
              type="button"
              role="radio"
              key={o.value}
              className="radio-opt"
              aria-checked={sel}
              tabIndex={sel || (value === null && i === 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => {
                const n = moveChoice(i, e.key, options.length)
                if (n === null) return
                e.preventDefault()
                onChange(options[n]!.value)
                ;(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role=radio]')[n])?.focus()
              }}
            >
              <span className="radio-dot" aria-hidden="true" />
              {o.text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * «Pagaste a tu tarjeta» y «Transferiste a …»: pregunta a dónde va (una deuda, una deuda nueva o un gasto) y guarda con UN solo botón.
 * Lo que no se eligió queda fuera de la vista. Nunca se guarda solo.
 */
export default function RoutedMovement({ d, dayLabel, debts, categories, history, off, run, onPayDebt, onPayNewDebt, onSaveAsExpense, onIgnore, monthLeft }: Props) {
  const transfer = d.kind === 'TRANSFER_OUT'
  // La transferencia se compara por el destinatario; el pago de tarjeta, por la cuenta del aviso
  const match = matchDebt(transfer ? (d.merchant ?? d.account) : d.account, debts)
  const guess = preselectDebt(match)
  const [target, setTarget] = useState<Target>(transfer ? 'expense' : debts.length > 0 ? 'debt' : 'new')
  const [debtId, setDebtId] = useState<string | null>(guess)
  const [name, setName] = useState(d.account ?? (transfer ? (d.merchant ?? '') : ''))
  const [balance, setBalance] = useState('')
  const suggested = d.merchant ? suggestCategory(d.merchant, categories, history) : null
  const [cat, setCat] = useState<string | null>(suggested)
  const [picking, setPicking] = useState(false)
  const catName = categories.find((c) => c.id === cat)?.name

  const title = transfer ? `Transferencia ${money(d.amountClp)}` : `Pago de tarjeta ${money(d.amountClp)}`
  const balanceNum = Number(balance) || 0
  const effect: MonthEffect = target === 'expense' ? 'expense' : target === 'new' ? 'newdebt' : 'debt'
  const ready = target === 'debt' ? debtId !== null : target === 'new' ? name.trim() !== '' && balanceNum > 0 : cat !== null
  const left = ready || target === 'expense' ? (monthLeft?.(d, effect, debtId ?? undefined) ?? null) : null
  const hintId = `hint-${d.id}`

  function save() {
    if (!ready) return
    if (target === 'debt') run(onPayDebt && (() => onPayDebt(d, debtId!)))
    else if (target === 'new') run(onPayNewDebt && (() => onPayNewDebt(d, name.trim(), balanceNum)))
    else run(() => onSaveAsExpense(d, cat!))
  }

  const topOptions: { value: Target; text: string }[] = transfer
    ? [
        { value: 'expense', text: 'Es un gasto' },
        { value: 'debt', text: 'Pago de una deuda' },
      ]
    : [
        { value: 'debt', text: debts.length > 0 ? 'Pago de tarjeta o deuda' : 'Pago de tarjeta o deuda (aún no tienes)' },
        { value: 'new', text: 'Crear una deuda nueva' },
        { value: 'expense', text: 'Solo es un gasto' },
      ]
  const inDebtPath = target === 'debt' || (transfer && target === 'new')

  return (
    <section className="card detected kind-debt" aria-label={title}>
      <div className="row between">
        <strong className="num">{title}</strong>
        <span className="muted small-text">{dayLabel}</span>
      </div>
      {transfer ? <span>{d.merchant ? `A ${d.merchant}` : 'Sin destinatario'}</span> : d.account && <span className="muted small-text">{d.account}</span>}
      <Choices
        label={transfer ? '¿Es un gasto o el pago de una deuda?' : '¿A qué corresponde?'}
        value={transfer && target === 'new' ? 'debt' : target}
        options={topOptions}
        disabled={off}
        onChange={(v) => setTarget(v === 'debt' && transfer && target === 'new' ? 'new' : v)}
      />

      {inDebtPath && debts.length > 0 && target === 'debt' && (
        <Choices label="¿Cuál deuda?" value={debtId} options={debts.map((x) => ({ value: x.id, text: x.name }))} disabled={off} onChange={(v) => setDebtId(v)} />
      )}
      {transfer && inDebtPath && (
        <button type="button" className="btn ghost small" disabled={off} onClick={() => setTarget(target === 'new' ? 'debt' : 'new')}>
          {target === 'new' ? 'Elegir una deuda que ya tengo' : 'Crear una deuda nueva'}
        </button>
      )}
      {target === 'new' && (
        <div className="stack tight">
          <div className="field">
            <label htmlFor={`dn-${d.id}`}>Nombre de la deuda</label>
            <input id={`dn-${d.id}`} className="input" maxLength={60} autoComplete="off" value={name} disabled={off} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`db-${d.id}`}>¿Cuánto debes en total, antes de este pago?</label>
            <input id={`db-${d.id}`} className="input" inputMode="numeric" autoComplete="off" placeholder="Ej. 250.000" value={dots(balance)} disabled={off} onChange={(e) => setBalance(digitsOnly(e.target.value))} />
          </div>
        </div>
      )}
      {target === 'expense' && (
        <div className="stack tight">
          <span className="muted small-text">
            {catName ? `Categoría: ${catName}` : 'Elige una categoría para guardarlo como gasto.'}
          </span>
          <button type="button" className="btn ghost small" disabled={off} onClick={() => setPicking(true)}>
            {catName ? 'Cambiar categoría' : 'Elegir categoría'}
          </button>
        </div>
      )}

      {left !== null && (
        <span className="muted small-text" role="status">
          {left < 0 ? `Después de guardar te faltarían ${money(-left)} este mes.` : `Después de guardar te quedan ${money(left)} este mes.`}
        </span>
      )}
      {!ready && (
        <span className="muted small-text" id={hintId}>
          {target === 'debt' ? 'Elige una deuda para guardar.' : target === 'new' ? 'Escribe el nombre y cuánto debes.' : 'Elige una categoría para guardar.'}
        </span>
      )}
      <div className="row detected-actions">
        <button type="button" className="btn" disabled={off || !ready} aria-describedby={ready ? undefined : hintId} onClick={save}>
          Guardar
        </button>
        <button type="button" className="btn ghost small" disabled={off} onClick={() => onIgnore(d)}>
          Ignorar
        </button>
      </div>
      {picking && (
        <CategoryPicker
          categories={categories}
          selected={cat}
          onPick={(id) => {
            setCat(id)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  )
}
