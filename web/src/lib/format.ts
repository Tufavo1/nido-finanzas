const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

export const money = (n: number): string => clp.format(n)

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const todayISO = (): string => toISO(new Date())

/** Primer día del mes y primer día del mes siguiente, para filtrar con gte / lt */
export function monthRange(ref: Date = new Date()): { start: string; end: string } {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
  return { start: toISO(start), end: toISO(end) }
}

export const daysLeftInMonth = (ref: Date = new Date()): number => {
  const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
  return last - ref.getDate()
}
