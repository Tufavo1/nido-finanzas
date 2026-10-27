import type { Tables } from './database.types'

export type Member = Tables<'members'>

export const memberColor = (m: Pick<Member, 'color'> | undefined): string =>
  m?.color === 'amber' ? 'var(--amber)' : 'var(--blue)'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const monthName = (d: Date = new Date()): string => MONTHS[d.getMonth()] ?? ''

export const monthShort = (d: Date = new Date()): string => MONTHS_SHORT[d.getMonth()] ?? ''

/** '2026-10-17' -> '17 oct' */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1] ?? ''}`
}

/** Deja solo dígitos, máximo 9 (los montos son CLP enteros) */
export const digitsOnly = (s: string): string => s.replace(/\D/g, '').slice(0, 9)

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** Próxima fecha en que cae el día del mes indicado (hoy cuenta). Si el mes no tiene ese día, usa el último. */
export function nextOccurrence(day: number, from: Date = new Date()): Date {
  const at = (y: number, m: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()))
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const thisMonth = at(from.getFullYear(), from.getMonth())
  return thisMonth >= today ? thisMonth : at(from.getFullYear(), from.getMonth() + 1)
}

export function daysUntil(date: Date, from: Date = new Date()): number {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((date.getTime() - today.getTime()) / 86400000)
}

/** 'viernes 5 de noviembre' */
export const longDate = (d: Date): string => `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`

/** 'hoy', 'mañana', 'en 12 días' */
export function inDays(n: number): string {
  if (n === 0) return 'hoy'
  if (n === 1) return 'mañana'
  return `en ${n} días`
}

/** Encabezado de un día en la lista de movimientos: 'Hoy', 'Ayer' o 'Lunes 14 de octubre' */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  const diff = daysUntil(date, now)
  if (diff === 0) return 'Hoy'
  if (diff === -1) return 'Ayer'
  const text = longDate(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Muestra una cifra con puntos de miles mientras se escribe (1500000 → 1.500.000) */
export const dots = (s: string): string => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
