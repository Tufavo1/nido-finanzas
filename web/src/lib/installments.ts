// Copyright (c) 2026 Dinovance
// Compras en cuotas detectadas: qué es cada aviso, qué se ve y cuándo se puede guardar. Lógica pura.
import { money } from './format'

export type InstallmentRole = 'PURCHASE' | 'PRIOR_CHARGE'

/** Los tres datos de cuotas que manda el teléfono (todos opcionales: un teléfono viejo no los trae) */
export interface InstallmentFields {
  installmentRole?: InstallmentRole
  installmentCount?: number
  installmentValueClp?: number
}

interface Source extends InstallmentFields {
  amountClp: number
  installment: { n: number; total: number } | null
}

/**
 * NONE: no es de cuotas. TOTAL: compra con el total en el aviso (el monto ya es el total). NO_TOTAL: el aviso solo trae
 * una cuota; hay que pedir el total. PRIOR_CHARGE: cobro de una cuota de una compra ya anotada (no es un gasto nuevo).
 */
export type InstallmentCase = 'NONE' | 'TOTAL' | 'NO_TOTAL' | 'PRIOR_CHARGE'

export function installmentCase(d: Source): InstallmentCase {
  if (d.installmentRole === 'PRIOR_CHARGE') return 'PRIOR_CHARGE'
  if (d.installmentRole !== 'PURCHASE') return 'NONE'
  const onlyOneCuota = d.installment !== null || (d.installmentValueClp !== undefined && d.installmentValueClp === d.amountClp)
  return onlyOneCuota ? 'NO_TOTAL' : 'TOTAL'
}

/** «3 cuotas de $10.000» o «3 cuotas» si no se sabe el valor */
export function cuotasText(count: number, valueClp: number | undefined): string {
  const base = `${count} ${count === 1 ? 'cuota' : 'cuotas'}`
  return valueClp ? `${base} de ${money(valueClp)}` : base
}

/** Datos de cuotas listos para la pantalla; null si no es una compra en cuotas con cantidad conocida */
export interface InstallmentInfo {
  kind: Exclude<InstallmentCase, 'NONE' | 'PRIOR_CHARGE'>
  count: number
  /** Valor de una cuota (en el caso sin total es el monto del aviso) */
  value: number | null
}

export function installmentInfo(d: Source): InstallmentInfo | null {
  const kind = installmentCase(d)
  if (kind === 'NONE' || kind === 'PRIOR_CHARGE') return null
  const count = d.installmentCount ?? d.installment?.total
  if (!count) return null
  return { kind, count, value: d.installmentValueClp ?? (kind === 'NO_TOTAL' ? d.amountClp : null) }
}

/** Etiqueta de la compra con el total del aviso: «Compra en cuotas: 3 cuotas de $10.000 · total $30.000» */
export function purchaseLabel(info: InstallmentInfo, totalClp: number): string {
  return `Compra en cuotas: ${cuotasText(info.count, info.value ?? undefined)} · total ${money(totalClp)}`
}

/** Pista del caso sin total */
export const totalHint = (value: number): string => `El aviso solo trae la cuota de ${money(value)}. Escribe el total de la compra.`

/** Lo que mínimo debería costar la compra: cuota × cantidad */
export const expectedTotal = (info: InstallmentInfo): number | null => (info.value ? info.value * info.count : null)

/** El total está por debajo de cuota × cantidad (pero no de una cuota): se pide confirmación */
export function isLowTotal(info: InstallmentInfo, total: number): boolean {
  const expected = expectedTotal(info)
  return expected !== null && total >= (info.value ?? 0) && total > 0 && total < expected
}

/**
 * Problema para guardar una compra de la que solo se conoce la cuota. El total nunca puede ser menor que una cuota;
 * si es menor que cuota × cantidad solo se guarda con la confirmación de la persona.
 */
export function totalBlocker(info: InstallmentInfo, total: number, confirmedLow: boolean): string | null {
  if (!Number.isInteger(total) || total <= 0) return 'Escribe el total de la compra, en pesos y sin decimales.'
  if (info.value && total < info.value) return `El total no puede ser menor que una cuota (${money(info.value)}).`
  if (isLowTotal(info, total) && !confirmedLow) return `Es menos que ${cuotasText(info.count, info.value ?? undefined)} (${money(expectedTotal(info) ?? 0)}). Confirma que el total es correcto.`
  return null
}
