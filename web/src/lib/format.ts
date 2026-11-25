const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

/** Pesos chilenos; un negativo lleva el signo delante del símbolo (-$12.990) y un redondeo a cero no muestra signo */
export const money = (n: number): string => {
  const r = Math.round(n) + 0 // + 0 convierte -0 en 0
  return r < 0 ? `-${clp.format(-r)}` : clp.format(r)
}

/** Número con coma decimal (es-CL): hasta `max` decimales y, si pides `min`, al menos esos (sin ceros de más por defecto) */
export function decimalEs(n: number, max = 2, min = 0): string {
  const fixed = n.toFixed(max)
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
  const [int = '0', dec = ''] = trimmed.split('.')
  return (dec.length < min ? `${int}.${dec.padEnd(min, '0')}` : trimmed).replace('.', ',')
}

/** Porcentaje o tasa con coma y espacio antes del %: 3,41 % */
export const pctText = (n: number, max = 2, min = 0): string => `${decimalEs(n, max, min)} %`

const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** La base cuenta los días en America/Santiago: «hoy» sale de esa zona, no de la del aparato. Una sola fuente para toda la app. */
const SANTIAGO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Fecha AAAA-MM-DD en America/Santiago */
export const santiagoDay = (d: Date = new Date()): string => SANTIAGO_DAY.format(d)

export const todayISO = (): string => santiagoDay()

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
