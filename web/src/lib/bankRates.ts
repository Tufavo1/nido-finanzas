import { BANKS, PRODUCTS } from './bankData'
import type { Bank, RateEntry, RateProduct } from './bankData'
import { payoffPlan } from './finance'

/** Compara la tasa de una deuda con lo que publican los bancos. Todo en % mensual, que es como se anotan las deudas. */

/** Hace cuántos días un dato se considera viejo */
const STALE_DAYS = 60

export interface MonthlyRange {
  /** null: el banco solo publica el máximo */
  min: number | null
  max: number
}

/** Tasa mensual de una publicada en anual: dividida en 12, como la cotizan los bancos */
const toMonthly = (n: number, unit: RateEntry['unit']) => (unit === 'anual' ? n / 12 : n)

export function monthlyRange(e: RateEntry): MonthlyRange {
  return { min: e.min === undefined ? null : toMonthly(e.min, e.unit), max: toMonthly(e.max, e.unit) }
}

export const productLabel = (p: RateProduct): string => PRODUCTS.find((x) => x.key === p)?.label ?? p

/** Qué producto del banco se parece a una deuda: por el tipo que se eligió y, en créditos, por el nombre */
export function productForDebt(d: { kind: string; name: string }): RateProduct | null {
  if (/hipotec|dividendo|vivienda/i.test(d.name)) return 'hipotecario'
  if (d.kind === 'tarjeta') return 'tarjeta'
  // «Préstamo de Mamá»: plata prestada por una persona, no un crédito de banco
  if (/^pr[eé]stamo de /i.test(d.name)) return null
  if (d.kind === 'credito' || d.kind === 'prestamo') return 'consumo'
  return null
}

export type Freshness = 'vigente' | 'viejo' | 'sin-fecha'

export function freshness(vigencia: string | null | undefined, now: Date = new Date()): Freshness {
  if (!vigencia) return 'sin-fecha'
  const days = (now.getTime() - Date.parse(vigencia)) / 86_400_000
  return days > STALE_DAYS ? 'viejo' : 'vigente'
}

export interface BankOffer {
  bank: Bank
  /** Lo que aplica a ese monto (o todo, si el monto no cae en ningún tramo) */
  entries: RateEntry[]
  range: MonthlyRange
  /** Solo hay topes, no una tasa ofrecida */
  capOnly: boolean
  /** Viene de una tasa anual: el mensual es aproximado */
  approx: boolean
  freshness: Freshness
}

/** Lo que publica cada banco para un producto, y para un monto si se indica */
export function offersFor(product: RateProduct, amount?: number, now: Date = new Date()): BankOffer[] {
  const out: BankOffer[] = []
  for (const bank of BANKS) {
    const all = bank.rates.filter((r) => r.product === product)
    if (all.length === 0) continue
    const fits = amount === undefined ? [] : all.filter((r) => amount >= (r.from ?? 0) && amount <= (r.to ?? Infinity))
    const entries = fits.length > 0 ? fits : all
    const ranges = entries.map(monthlyRange)
    out.push({
      bank,
      entries,
      range: { min: ranges.some((r) => r.min !== null) ? Math.min(...ranges.map((r) => r.min ?? r.max)) : null, max: Math.max(...ranges.map((r) => r.max)) },
      capOnly: entries.every((r) => r.cap || r.min === undefined),
      approx: entries.some((r) => r.unit === 'anual'),
      freshness: freshness(bank.vigencia[product], now),
    })
  }
  return out
}

export type Verdict = 'sobre' | 'dentro' | 'bajo'

export interface DebtComparison {
  product: RateProduct
  rate: number
  offers: BankOffer[]
  verdict: Verdict
  /** Lo más bajo que ofrece algún banco (su tasa mínima publicada) */
  lowest: { bank: Bank; rate: number } | null
  /** Intereses que se ahorrarían pagando lo mismo cada mes con la tasa más baja publicada */
  saving: { interest: number; months: number } | null
}

export function compareDebt(opts: { product: RateProduct; rate: number; amount: number; payment: number; now?: Date }): DebtComparison | null {
  const { product, rate, amount, payment } = opts
  const meta = PRODUCTS.find((p) => p.key === product)
  if (!meta?.comparable || rate <= 0) return null
  const offers = offersFor(product, amount, opts.now)
  if (offers.length === 0) return null

  let lowest: DebtComparison['lowest'] = null
  // Solo cuenta lo que un banco realmente ofrece: un tope máximo no es una tasa a la que puedas llegar
  for (const o of offers) {
    if (o.range.min !== null && (!lowest || o.range.min < lowest.rate)) lowest = { bank: o.bank, rate: o.range.min }
  }
  const ceiling = Math.max(...offers.map((o) => o.range.max))
  const verdict: Verdict = rate > ceiling ? 'sobre' : lowest && rate <= lowest.rate ? 'bajo' : 'dentro'

  let saving: DebtComparison['saving'] = null
  if (lowest && lowest.rate < rate && payment > 0 && amount > 0) {
    const now = payoffPlan(amount, payment, rate)
    const better = payoffPlan(amount, payment, lowest.rate)
    if (now && better && now.interest > better.interest) saving = { interest: now.interest - better.interest, months: now.months - better.months }
  }
  return { product, rate, offers, verdict, lowest, saving }
}
