const pluralMonths = (n: number): string => (n === 1 ? 'mes' : 'meses')

/** Plazo en la tarjeta de la lista. Una tarjeta no tiene fecha de término: lo usado se paga cuando se quiera. */
export function debtEndShort(kind: string, months: number | null, done: boolean): string {
  if (done) return 'Saldada 🎉'
  if (kind === 'tarjeta') return 'Cupo usado'
  return months === null ? 'Sin fecha de término' : `Faltan ~${months} ${pluralMonths(months)}`
}

/** «Terminan de pagar» del detalle; null si no corresponde (tarjeta) */
export function debtEndTile(kind: string, months: number | null, done: boolean): string | null {
  if (done) return 'Saldada 🎉'
  if (kind === 'tarjeta') return null
  return months === null ? 'Sin fecha' : `En ~${months} ${pluralMonths(months)}`
}
