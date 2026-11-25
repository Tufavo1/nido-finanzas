import { money } from './format'
import type { Scope } from './scope'

/** El nombre de la persona cuando se mira a la pareja; null si se mira el hogar o a uno mismo (se habla de «tú») */
export function otherName(scope: Scope, meId: string, members: { user_id: string; display_name: string }[]): string | null {
  if (scope === 'all' || scope === meId) return null
  return members.find((m) => m.user_id === scope)?.display_name ?? null
}

/** «el total de …» bajo las categorías de Inicio */
export function totalOwnerText(scope: Scope, other: string | null): string {
  if (scope === 'all') return 'gastos del hogar'
  return other ? `la parte de ${other}` : 'tu parte'
}

/** Pista de «Últimos gastos» de Inicio */
export function latestHint(scope: Scope, other: string | null): string {
  if (scope === 'all') return 'Lo último que anotaron'
  return other ? `Lo último que le corresponde a ${other}` : 'Lo último que te corresponde'
}

/** Estado del cupo de una tarjeta, hablando de quien se mira */
export function cardLimitText(st: { over: number; free: number; pct: number }, other: string | null): string {
  if (st.over > 0) return other ? `${other} se pasó del cupo por ${money(st.over)}.` : `Te pasaste del cupo por ${money(st.over)}.`
  return other ? `Le quedan ${money(st.free)} de cupo a ${other} (${st.pct} % usado).` : `Te quedan ${money(st.free)} de cupo (${st.pct} % usado).`
}
