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
