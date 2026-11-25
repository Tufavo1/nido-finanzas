// Copyright (c) 2026 Dinovance
// Marcas de la bandeja: posibles duplicados (H-04) y gastos confirmados que aún no se envían (H-05). Lógica pura.
import { installmentCase } from './installments'
import type { NativeDraft, SyncNowResult } from './nativeBridge'

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
  for (const d of [...drafts].filter((x) => x.kind === 'EXPENSE').sort((a, b) => a.createdAtMillis - b.createdAtMillis)) {
    const k = key(d)
    const earlier = first.get(k)
    if (earlier) marks.set(d.id, earlier)
    else first.set(k, d.id)
    if (d.possibleDuplicate && !marks.has(d.id)) marks.set(d.id, d.id)
  }
  return marks
}

/**
 * Gastos que la persona confirmó en la notificación y que todavía no llegaron al servidor. Una compra de la que solo se conoce
 * una cuota, o el cobro de una cuota anterior, no se envía sola: espera a la persona en la bandeja, así que no cuenta aquí.
 */
export const unsentDrafts = (drafts: NativeDraft[]): NativeDraft[] =>
  drafts.filter((d) => {
    const cuotas = installmentCase(d)
    return d.status === 'CONFIRMED' && d.kind === 'EXPENSE' && cuotas !== 'NO_TOTAL' && cuotas !== 'PRIOR_CHARGE'
  })

/** Lo que sigue sin enviar después de reintentar: lo que la app está guardando ahora mismo (`savingIds`) no cuenta */
export const stillUnsent = (drafts: NativeDraft[], savingIds: ReadonlySet<string>): NativeDraft[] => unsentDrafts(drafts).filter((d) => !savingIds.has(d.id))

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Aviso tras «Enviar ahora»: nunca un éxito mudo. null si no había nada que enviar. */
export function sendNowNotice({ before, remaining, failed }: { before: number; remaining: number; failed: boolean }): string | null {
  if (before === 0) return null
  if (failed || remaining >= before) return 'No se pudo enviar\nReintentaremos solos.'
  if (remaining > 0) return `Se envió ${plural(before - remaining, 'gasto', 'gastos')}\nQueda ${remaining} por enviar. Reintentaremos solos.`
  return 'Enviado\nTus gastos ya están en tu cuenta.'
}

export type NoticeTone = 'success' | 'info' | 'warn' | 'error'

/**
 * Aviso tras «Enviar ahora» según lo que respondió el teléfono. `waiting` = confirmados que esperaban enviarse;
 * `needsSignIn` = el último error del envío pide volver a entrar. Nunca muestra códigos ni texto del servidor.
 */
export function syncResultNotice(r: SyncNowResult, o: { waiting: number; needsSignIn: boolean }): { text: string; tone: NoticeTone } | null {
  const retry = { text: 'No se pudo enviar\nReintentaremos solos.', tone: 'error' as const }
  if (r.result === 'ALL_SENT') return { text: 'Enviado\nTus gastos ya están en tu cuenta.', tone: 'success' }
  if (r.result === 'IN_PROGRESS') return { text: 'Sigue enviándose\nTe avisaremos cuando llegue.', tone: 'info' }
  if (r.result === 'NEEDS_PERSON') {
    const n = r.needsPerson > 0 ? r.needsPerson : Math.max(o.waiting, 1)
    return { text: `Falta tu ayuda\nHay ${plural(n, 'gasto', 'gastos')} que no puedo enviar solo: ábre${n === 1 ? 'lo' : 'los'} y elige la categoría.`, tone: 'warn' }
  }
  if (r.sent > 0) {
    const left = r.failed + r.needsPerson
    const sent = r.sent === 1 ? 'Se envió 1 gasto' : `Se enviaron ${r.sent} gastos`
    if (left === 0) return { text: `${sent}\nTus gastos ya están en tu cuenta.`, tone: 'success' }
    return { text: `${sent}\n${left === 1 ? 'Queda 1' : `Quedan ${left}`} por enviar. Reintentaremos solos.`, tone: 'warn' }
  }
  if (r.result === 'NO_SESSION') return o.needsSignIn ? { text: 'No se pudo enviar\nVuelve a entrar para enviar tus gastos.', tone: 'error' } : retry
  if (r.result === 'REJECTED') return { text: 'No se pudo enviar\nAlgún gasto no fue aceptado. Ábrelo y revísalo.', tone: 'error' }
  if (r.result === 'NOTHING_TO_SEND') return o.waiting > 0 ? { text: 'No encontré gastos para enviar\nAbre la bandeja e inténtalo de nuevo.', tone: 'error' } : null
  return retry
}

/** Advertencia del borrado total: cuántos gastos guardados sin enviar se perderían. null si no se pierde ninguno. */
export const wipeUnsentWarning = (n: number): string | null =>
  n > 0 ? (n === 1 ? 'Se perderá 1 gasto guardado que aún no se envió.' : `Se perderán ${n} gastos guardados que aún no se enviaron.`) : null

export const unsentMessage = (n: number): string => `Tienes ${n} ${n === 1 ? 'gasto' : 'gastos'} por enviar`

/** Nombre visible de la app de origen; si no se conoce, el nombre del paquete */
export const sourceLabel = (pkg: string, names: ReadonlyMap<string, string>): string => names.get(pkg) ?? pkg

/**
 * Cuántos gastos faltan por enviar. El número del plugin (el que sabe de verdad) reemplaza al cálculo local,
 * pero solo se avisa si hay algo que necesite a la persona (lo que se guarda solo no asusta).
 */
export const unsentCount = (fromPlugin: number | null, local: number): number => (local === 0 ? 0 : (fromPlugin ?? local))
