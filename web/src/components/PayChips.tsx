// Copyright (c) 2026 Dinovance
import { debtPayChips } from '../lib/finance'
import { money } from '../lib/format'

/** Montos sugeridos al pagar una deuda: «Cuota $X» y «Pagar todo $Y». Los usan Registrar y el pago desde Deudas. */
export default function PayChips({ monthlyPayment, remaining, onPick }: { monthlyPayment: number; remaining: number; onPick: (amount: number) => void }) {
  const { fee, all } = debtPayChips(monthlyPayment, remaining)
  return (
    <div className="reg-quick" role="group" aria-label="Montos sugeridos">
      {fee !== null && (
        <button type="button" className="chip" onClick={() => onPick(fee)}>
          Cuota {money(fee)}
        </button>
      )}
      <button type="button" className="chip" onClick={() => onPick(all)}>
        Pagar todo {money(all)}
      </button>
    </div>
  )
}
