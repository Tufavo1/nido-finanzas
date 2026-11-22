// Copyright (c) 2026 Dinovance
import { Fragment, useState } from 'react'
import CategoryPicker from './CategoryPicker'
import EmptyState from './EmptyState'
import ScanButton from './ScanButton'
import { isNativeApp } from '../lib/nativeBridge'
import { SkeletonList } from './Skeleton'
import { DUPLICATE_EXPLANATION, duplicateMarks, sourceLabel } from '../lib/draftFlags'
import { money } from '../lib/format'
import { suggestCategory } from '../lib/categorize'
import type { AutoSavedItem, NativeDraft } from '../lib/nativeBridge'
import { logError } from '../lib/safeLog'
import { chosenId, matchDebt, moveChoice } from '../lib/debtMatch'
import type { DebtLite } from '../lib/debtMatch'

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
  /** Deudas activas, para emparejar los pagos de tarjeta */
  debts?: DebtLite[]
  /** Guarda el ingreso detectado; si falla lanza el error (el borrador queda) */
  onSaveIncome?: (d: NativeDraft) => Promise<void>
  /** Registra el pago en la deuda elegida; si falla lanza el error (el borrador queda) */
  onPayDebt?: (d: NativeDraft, debtId: string) => Promise<void>
  /** Lleva a Dinero para crear la deuda */
  onGoMoney?: () => void
}

const GROUPS = [
  { kind: 'EXPENSE', title: 'Gastos', cls: 'kind-expense' },
  { kind: 'INCOME', title: 'Ingresos', cls: 'kind-income' },
  { kind: 'DEBT_PAYMENT', title: 'Pagos de tarjeta', cls: 'kind-debt' },
] as const

const dayFmt = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' })

/** «Movimientos detectados»: lo que el teléfono encontró en tus avisos del banco, para que tú lo apruebes. */
export default function DetectedInbox({ drafts, failed, categories, history, onReview, onSaveWith, onIgnore, onRetry, onSettings, kept, onKeepBoth, appNames = new Map(), autoSaved = [], onUndoAuto, debts = [], onSaveIncome, onPayDebt, onGoMoney }: Props) {
  const [picking, setPicking] = useState<NativeDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  /** Deuda elegida por borrador (si no hay, la más probable) */
  const [choice, setChoice] = useState<Record<string, string>>({})
  const marks = duplicateMarks(drafts ?? [])
  const groups = GROUPS.map((g) => ({ ...g, items: (drafts ?? []).filter((d) => d.kind === g.kind) })).filter((g) => g.items.length > 0)
  const headed = groups.length > 1

  /** Guarda sin duplicar toques; un fallo se muestra y NO quita el borrador (lo decide quien guarda) */
  async function run(d: NativeDraft, job: (() => Promise<void>) | undefined) {
    if (!job || busy) return
    setBusy(d.id)
    setError(null)
    try {
      await job()
    } catch (e) {
      logError(e, 'DetectedInbox')
      setError('No pudimos guardarlo. Revisa tu conexión y vuelve a intentarlo.')
    } finally {
      setBusy(null)
    }
  }

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
      <h1 className="title">Movimientos detectados</h1>
      <p className="muted">Los encontramos en los avisos de tu banco. Ninguno se guarda sin que lo apruebes, salvo que actives el modo automático.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {drafts === null && <SkeletonList rows={3} label="Buscando movimientos detectados…" />}
      {drafts !== null && failed && drafts.length === 0 && (
        <section className="card" role="alert">
          <strong>No pudimos leer los movimientos detectados</strong>
          <span className="muted">Es algo del teléfono, no de tu cuenta. Inténtalo de nuevo.</span>
          <button type="button" className="btn small" onClick={onRetry}>
            Reintentar
          </button>
        </section>
      )}
      {drafts !== null && !failed && <EmptyState section="drafts" count={drafts.length} onCta={onSettings} action={isNativeApp() ? <ScanButton onPickApp={onSettings} /> : undefined} />}
      {groups.map((g) => (
        <Fragment key={g.kind}>
          {headed && <h2 className={`mov-title ${g.cls}`}>{g.title}</h2>}
          {g.items.map((d) => {
        if (d.kind === 'INCOME' || d.kind === 'DEBT_PAYMENT') {
          const income = d.kind === 'INCOME'
          const title = income ? `Ingreso de ${money(d.amountClp)}` : `Pago de tarjeta ${money(d.amountClp)}`
          const match = income ? null : matchDebt(d.account, debts)
          const off = busy !== null
          return (
            <section className={`card detected ${income ? "kind-income" : "kind-debt"}`} key={d.id} aria-label={title}>
              <div className="row between">
                <strong className="num">{title}</strong>
                <span className="muted small-text">{dayFmt.format(d.postedAtMillis)}</span>
              </div>
              {d.account && <span className="muted small-text">{d.account}</span>}
              {income ? (
                <>
                  <span>¿Es plata tuya que entró?</span>
                  <span className="muted small-text">Si es un movimiento entre tus cuentas, no es un ingreso.</span>
                  <div className="row detected-actions">
                    <button type="button" className="btn" disabled={off} onClick={() => void run(d, onSaveIncome && (() => onSaveIncome(d)))}>
                      Sí, es un ingreso
                    </button>
                    <button type="button" className="btn ghost small" disabled={off} onClick={() => onIgnore(d)}>
                      No, es entre mis cuentas
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="muted small-text">Los pagos de tu tarjeta no cuentan como gasto: tus compras ya están registradas.</span>
                  {match?.kind === 'one' && (
                    <div className="row detected-actions">
                      <button type="button" className="btn" disabled={off} onClick={() => void run(d, onPayDebt && (() => onPayDebt(d, match.debt.id)))}>
                        Registrar pago en «{match.debt.name}»
                      </button>
                      <button type="button" className="btn ghost small" disabled={off} onClick={() => onIgnore(d)}>
                        Ignorar
                      </button>
                    </div>
                  )}
                  {match?.kind === 'choose' && (
                    <div className="stack">
                      <strong className="small-text" id={`pick-${d.id}`}>
                        Elige a qué deuda va
                      </strong>
                      <div className="radio-list" role="radiogroup" aria-labelledby={`pick-${d.id}`}>
                        {match.debts.map((x, i) => {
                          const sel = chosenId(choice[d.id], match.debts) === x.id
                          return (
                            <button
                              type="button"
                              role="radio"
                              key={x.id}
                              className="radio-opt"
                              aria-checked={sel}
                              tabIndex={sel ? 0 : -1}
                              disabled={off}
                              onClick={() => setChoice((c) => ({ ...c, [d.id]: x.id }))}
                              onKeyDown={(e) => {
                                const n = moveChoice(i, e.key, match.debts.length)
                                if (n === null) return
                                e.preventDefault()
                                setChoice((c) => ({ ...c, [d.id]: match.debts[n]!.id }))
                                ;(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role=radio]')[n])?.focus()
                              }}
                            >
                              <span className="radio-dot" aria-hidden="true" />
                              {x.name}
                            </button>
                          )
                        })}
                      </div>
                      <div className="row detected-actions">
                        <button type="button" className="btn" disabled={off} onClick={() => void run(d, onPayDebt && (() => onPayDebt(d, chosenId(choice[d.id], match.debts) ?? '')))}>
                          Registrar pago
                        </button>
                        <button type="button" className="btn ghost small" disabled={off} onClick={() => onIgnore(d)}>
                          No es de mis deudas
                        </button>
                      </div>
                    </div>
                  )}
                  {match?.kind === 'none' && (
                    <>
                      <span>No tienes una deuda parecida. Puedes crearla en Dinero.</span>
                      <div className="row detected-actions">
                        {onGoMoney && (
                          <button type="button" className="btn" onClick={onGoMoney}>
                            Ir a Dinero
                          </button>
                        )}
                        <button type="button" className="btn ghost small" onClick={() => onIgnore(d)}>
                          Ignorar
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )
        }
        const suggested = d.merchant ? suggestCategory(d.merchant, categories, history) : null
        const name = categories.find((c) => c.id === suggested)?.name
        const duplicate = marks.has(d.id) && !kept.has(d.id)
        return (
          <section className={duplicate ? 'card detected kind-expense dup' : 'card detected kind-expense'} key={d.id} aria-label={`${money(d.amountClp)} ${d.merchant ?? ''}`}>
            <div className="row between">
              <strong className="num">{money(d.amountClp)}</strong>
              <span className="muted small-text">{dayFmt.format(d.postedAtMillis)}</span>
            </div>
            <span>{d.merchant ?? 'Sin comercio'}</span>
            {d.account && <span className="muted small-text">Con {d.account}</span>}
            <span className="muted small-text">
              {name ? `Categoría sugerida: ${name}` : 'Aún no sabemos la categoría.'}
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
              {suggested ? (
                <button type="button" className="btn" onClick={() => void pick(d, suggested)}>
                  Guardar
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => onReview(d)}>
                  Revisar y guardar
                </button>
              )}
              <button type="button" className="btn ghost small" onClick={() => onIgnore(d)}>
                Ignorar
              </button>
            </div>
            <details className="more">
              <summary>Más opciones</summary>
              <div className="row">
                {suggested && (
                  <button type="button" className="btn ghost small" onClick={() => onReview(d)}>
                    Revisar
                  </button>
                )}
                <button type="button" className="btn ghost small" onClick={() => setPicking(d)}>
                  Cambiar categoría
                </button>
              </div>
            </details>
          </section>
        )
      })}
        </Fragment>
      ))}
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
