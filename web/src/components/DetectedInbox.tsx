// Copyright (c) 2026 Dinovance
import { useState } from 'react'
import CategoryPicker from './CategoryPicker'
import EmptyState from './EmptyState'
import { SkeletonList } from './Skeleton'
import { DUPLICATE_EXPLANATION, duplicateMarks, sourceLabel } from '../lib/draftFlags'
import { money } from '../lib/format'
import { suggestCategory } from '../lib/categorize'
import type { AutoSavedItem, NativeDraft } from '../lib/nativeBridge'
import { logError } from '../lib/safeLog'

interface Props {
  /** null = cargando */
  drafts: NativeDraft[] | null
  failed: boolean
  categories: { id: string; name: string }[]
  history: { note: string | null; category_id: string }[]
  onReview: (d: NativeDraft) => void
  /** Guarda el gasto con la categoría elegida; si falla lanza el error */
  onSaveWith: (d: NativeDraft, categoryId: string) => Promise<void>
  onIgnore: (d: NativeDraft) => void
  onRetry: () => void
  onSettings: () => void
  /** Borradores que la persona decidió conservar aunque parezcan repetidos */
  kept: ReadonlySet<string>
  onKeepBoth: (id: string) => void
  /** Nombre visible de cada app (paquete → nombre) para «Detectado desde» */
  appNames?: ReadonlyMap<string, string>
  /** Gastos que se guardaron solos en esta sesión */
  autoSaved?: AutoSavedItem[]
  onUndoAuto?: (id: string) => void
}

const dayFmt = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' })

/** «Gastos detectados»: lo que el teléfono encontró en tus avisos del banco, para que tú lo apruebes. */
export default function DetectedInbox({ drafts, failed, categories, history, onReview, onSaveWith, onIgnore, onRetry, onSettings, kept, onKeepBoth, appNames = new Map(), autoSaved = [], onUndoAuto }: Props) {
  const [picking, setPicking] = useState<NativeDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const marks = duplicateMarks(drafts ?? [])

  async function pick(d: NativeDraft, categoryId: string) {
    setPicking(null)
    setError(null)
    try {
      await onSaveWith(d, categoryId)
    } catch (e) {
      logError(e, 'DetectedInbox')
      setError('No pudimos guardar ese gasto. Revisa tu conexión y vuelve a intentarlo.')
    }
  }

  return (
    <main className="screen">
      <h1 className="title">Gastos detectados</h1>
      <p className="muted">Los encontramos en los avisos de tu banco. Ninguno se guarda sin que lo apruebes, salvo que actives el modo automático.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {drafts === null && <SkeletonList rows={3} label="Buscando gastos detectados…" />}
      {drafts !== null && failed && drafts.length === 0 && (
        <section className="card" role="alert">
          <strong>No pudimos leer los gastos detectados</strong>
          <span className="muted">Es algo del teléfono, no de tu cuenta. Inténtalo de nuevo.</span>
          <button type="button" className="btn small" onClick={onRetry}>
            Reintentar
          </button>
        </section>
      )}
      {drafts !== null && !failed && <EmptyState section="drafts" count={drafts.length} onCta={onSettings} />}
      {drafts?.map((d) => {
        const suggested = d.merchant ? suggestCategory(d.merchant, categories, history) : null
        const name = categories.find((c) => c.id === suggested)?.name
        const duplicate = marks.has(d.id) && !kept.has(d.id)
        return (
          <section className={duplicate ? 'card detected dup' : 'card detected'} key={d.id} aria-label={`${money(d.amountClp)} ${d.merchant ?? ''}`}>
            <div className="row between">
              <strong className="num">{money(d.amountClp)}</strong>
              <span className="muted small-text">{dayFmt.format(d.postedAtMillis)}</span>
            </div>
            <span>{d.merchant ?? 'Sin comercio'}</span>
            <span className="muted small-text">
              {d.kind === 'INCOME' ? 'Parece un abono, no un gasto.' : name ? `Categoría sugerida: ${name}` : 'Aún no sabemos la categoría.'}
              {d.sourcePackage ? ` Detectado desde ${sourceLabel(d.sourcePackage, appNames)}.` : ''}
              {d.installment ? ` Cuota ${d.installment.n} de ${d.installment.total}.` : ''}
            </span>
            {duplicate && (
              <div className="dup-note" role="note">
                <strong>Posible duplicado</strong>
                <span className="small-text">{DUPLICATE_EXPLANATION}</span>
                <div className="row">
                  <button type="button" className="btn ghost small" onClick={() => onKeepBoth(d.id)}>
                    Conservar ambos
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => onIgnore(d)}>
                    Descartar este
                  </button>
                </div>
              </div>
            )}
            <div className="row detected-actions">
              <button type="button" className="btn small" onClick={() => onReview(d)}>
                Revisar y guardar
              </button>
              <button type="button" className="btn ghost small" onClick={() => setPicking(d)}>
                Cambiar categoría
              </button>
              <button type="button" className="btn ghost small" onClick={() => onIgnore(d)}>
                Ignorar
              </button>
            </div>
          </section>
        )
      })}
      {autoSaved.length > 0 && (
        <section className="stack" aria-label="Guardados automáticamente">
          <h2 className="perm-title">Guardados automáticamente</h2>
          {autoSaved.map((a) => (
            <div className="card detected" key={a.id}>
              <div className="row between">
                <strong className="num">{money(a.amount)}</strong>
                <span className="sev sev-info">Guardado automático</span>
              </div>
              <span>{a.note || 'Sin detalle'}</span>
              <span className="muted small-text">{a.synced ? 'Ya está en tu cuenta.' : 'Está en tu teléfono y se enviará solo.'}</span>
              {onUndoAuto && (
                <button type="button" className="btn ghost small" onClick={() => onUndoAuto(a.id)}>
                  Deshacer
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {picking && <CategoryPicker categories={categories} selected={null} onPick={(id) => void pick(picking, id)} onClose={() => setPicking(null)} />}
    </main>
  )
}
