// Copyright (c) 2026 Dinovance
// Marcas de la bandeja: posibles duplicados (H-04) y gastos confirmados que aún no se envían (H-05). Lógica pura.
import type { NativeDraft } from './nativeBridge'

/** El teléfono puede marcar un borrador como «posible duplicado» (campo opcional del plugin). */
export type FlaggedDraft = NativeDraft & { possibleDuplicate?: boolean }

export const DUPLICATE_EXPLANATION = 'Se parece a otro gasto detectado hace poco (mismo monto y mismo lugar). Puede ser una compra repetida de verdad: tú decides.'

const key = (d: NativeDraft): string => `${d.amountClp}|${(d.merchant ?? '').trim().toLowerCase()}`

/**
 * Qué borradores parecen repetidos. Devuelve id → id del borrador con el que se parecen
 * (o su propio id si solo viene la marca del teléfono). El más antiguo de cada grupo no se marca.
 */
export function duplicateMarks(drafts: FlaggedDraft[]): Map<string, string> {
  const marks = new Map<string, string>()
  const first = new Map<string, string>()
  for (const d of [...drafts].sort((a, b) => a.createdAtMillis - b.createdAtMillis)) {
    const k = key(d)
    const earlier = first.get(k)
    if (earlier) marks.set(d.id, earlier)
    else first.set(k, d.id)
    if (d.possibleDuplicate && !marks.has(d.id)) marks.set(d.id, d.id)
  }
  return marks
}

/** Gastos que la persona confirmó en la notificación y que todavía no llegaron al servidor */
export const unsentDrafts = (drafts: NativeDraft[]): NativeDraft[] => drafts.filter((d) => d.status === 'CONFIRMED')

export const unsentMessage = (n: number): string => `Tienes ${n} ${n === 1 ? 'gasto' : 'gastos'} por enviar`

/** Nombre visible de la app de origen; si no se conoce, el nombre del paquete */
export const sourceLabel = (pkg: string, names: ReadonlyMap<string, string>): string => names.get(pkg) ?? pkg

/**
 * Cuántos gastos faltan por enviar. El número del plugin (el que sabe de verdad) reemplaza al cálculo local,
 * pero solo se avisa si hay algo que necesite a la persona (lo que se guarda solo no asusta).
 */
export const unsentCount = (fromPlugin: number | null, local: number): number => (local === 0 ? 0 : (fromPlugin ?? local))
