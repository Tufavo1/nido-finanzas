// Copyright (c) 2026 Dinovance
// Empareja la cuenta de un aviso de «Pagaste a tu tarjeta» con las deudas de la persona. Lógica pura.

export interface DebtLite {
  id: string
  name: string
  archived?: boolean
}

export type DebtMatch<D extends DebtLite = DebtLite> =
  /** Una sola deuda claramente parecida: se ofrece registrar el pago de un toque */
  | { kind: 'one'; debt: D }
  /** Varias parecidas, o ninguna clara: la persona elige (siempre hay al menos una) */
  | { kind: 'choose'; debts: D[] }
  /** No hay deudas activas */
  | { kind: 'none' }

const STOP = new Set(['banco', 'tarjeta', 'cuenta', 'credito', 'debito', 'con', 'de', 'la', 'el', 'tu', 'mi', 'a', 'y', 'en', 'del'])
const MAX_CHOICES = 6

/** Minúsculas, sin tildes y solo letras/números separados por espacio */
export const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const tokens = (s: string): string[] => normalize(s).split(' ').filter((t) => t !== '')

/** Palabras de producto que comparten muchos emisores: solas no identifican la deuda */
const GENERIC = new Set(['mastercard', 'visa', 'premium', 'oro', 'gold', 'platinum', 'black', 'classic', 'clasica', 'amex', 'american', 'express', 'master', 'signature', 'infinite', 'titanium'])

interface Score {
  /** Marca propia del emisor (cmr, falabella…) o dígitos coincidentes */
  strong: number
  /** Palabras genéricas coincidentes */
  weak: number
  /** Los últimos 4 dígitos del aviso contradicen a los de la deuda */
  clash: boolean
}

function score(accountTokens: string[], debtName: string): Score {
  const debt = tokens(debtName)
  const set = new Set(debt)
  const out: Score = { strong: 0, weak: 0, clash: false }
  const aDigits = accountTokens.filter((t) => /^\d{4}$/.test(t))
  const dDigits = debt.filter((t) => /^\d{4}$/.test(t))
  if (aDigits.length > 0 && dDigits.length > 0 && !aDigits.some((t) => set.has(t))) out.clash = true
  for (const t of accountTokens) {
    if (STOP.has(t)) continue
    if (/^\d{4}$/.test(t)) {
      if (set.has(t)) out.strong += 3
    } else if (set.has(t)) {
      if (GENERIC.has(t)) out.weak += 1
      else out.strong += 1
    }
  }
  return out
}

export function matchDebt<D extends DebtLite>(account: string | null | undefined, debts: readonly D[]): DebtMatch<D> {
  const active = debts.filter((d) => !d.archived)
  if (active.length === 0) return { kind: 'none' }
  const at = account ? tokens(account) : []
  const scored = active
    .map((d) => ({ d, ...score(at, d.name) }))
    .filter((x) => !x.clash && x.strong + x.weak > 0)
    .sort((x, y) => y.strong * 10 + y.weak - (x.strong * 10 + x.weak))
  const [top, second] = scored
  // Pago de un toque: una sola deuda con marca o dígitos propios, y claramente mejor que las demás
  if (top && top.strong > 0 && (!second || top.strong * 10 + top.weak > second.strong * 10 + second.weak)) return { kind: 'one', debt: top.d }
  if (scored.length > 1) return { kind: 'choose', debts: scored.map((x) => x.d).slice(0, MAX_CHOICES) }
  return { kind: 'choose', debts: active.slice(0, MAX_CHOICES) }
}

/** Flechas del teclado sobre una lista de opciones (radio): arriba/izquierda atrás, abajo/derecha adelante, con vuelta; null si la tecla no mueve. */
export function moveChoice(index: number, key: string, len: number): number | null {
  if (len <= 0) return null
  if (key === 'ArrowDown' || key === 'ArrowRight') return (index + 1) % len
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (index - 1 + len) % len
  if (key === 'Home') return 0
  if (key === 'End') return len - 1
  return null
}

/** La opción elegida; si no hay una válida, la más probable (la primera de la lista). */
export const chosenId = (choice: string | undefined, debts: readonly DebtLite[]): string | null => (choice && debts.some((d) => d.id === choice) ? choice : (debts[0]?.id ?? null))
