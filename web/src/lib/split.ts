import type { Tables } from './database.types'

/**
 * Cómo se reparte lo compartido. Un número son partes iguales entre esa cantidad de personas;
 * un mapa trae la fracción (0 a 1) de cada una cuando acordaron otro reparto.
 */
export type Split = number | Record<string, number>

type SplitMember = Pick<Tables<'members'>, 'user_id'> & { share_pct?: number | null }

/** El reparto del hogar: el acordado si las dos personas lo tienen y suman 100; si no, partes iguales. */
export function splitOf(members: SplitMember[]): Split {
  const n = Math.max(members.length, 1)
  if (members.length !== 2) return n
  const pcts = members.map((m) => m.share_pct)
  if (!pcts.every((p): p is number => typeof p === 'number' && p >= 1 && p <= 99)) return n
  if (pcts[0]! + pcts[1]! !== 100) return n
  return Object.fromEntries(members.map((m, i) => [m.user_id, pcts[i]! / 100]))
}

/** Parte de lo compartido que le toca a una persona (0 a 1) */
export function fraction(split: Split, userId: string): number {
  if (typeof split === 'number') return 1 / Math.max(split, 1)
  return split[userId] ?? 1 / Math.max(Object.keys(split).length, 1)
}

/** Lo que le toca a una persona de un monto compartido */
export function portion(amount: number, split: Split, userId: string): number {
  if (typeof split === 'number') return amount / Math.max(split, 1)
  return amount * fraction(split, userId)
}

/** Se acordó un reparto distinto de mitad y mitad */
export const isCustomSplit = (split: Split): split is Record<string, number> => typeof split !== 'number'

/** «60 %» de esta persona; 50 si es por igual */
export function percentOf(split: Split, userId: string): number {
  return Math.round(fraction(split, userId) * 100)
}
