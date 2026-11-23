// Copyright (c) 2026 Dinovance
import { amountChoices, clpLabel } from '../lib/nativeSettings'

interface Props {
  /** Nombre del grupo para el lector de pantalla */
  label: string
  value: number
  disabled?: boolean
  onPick: (n: number) => void
}

/** Montos listos para tocar (en vez de escribir): el actual queda marcado. */
export default function AmountChoices({ label, value, disabled = false, onPick }: Props) {
  return (
    <div className="seg seg-wrap" role="group" aria-label={label}>
      {amountChoices(value).map((n) => (
        <button key={n} type="button" aria-pressed={n === value} disabled={disabled} onClick={() => n !== value && onPick(n)}>
          {clpLabel(n)}
        </button>
      ))}
    </div>
  )
}
