// Copyright (c) 2026 Dinovance
import { Fragment, useState } from 'react'
import CategoryPicker from './CategoryPicker'
import RoutedMovement from './RoutedMovement'
import type { MonthEffect } from '../lib/monthLeft'
import EmptyState from './EmptyState'
import ScanButton from './ScanButton'
import { isNativeApp } from '../lib/nativeBridge'
import { SkeletonList } from './Skeleton'
import { DUPLICATE_EXPLANATION, duplicateMarks, sourceLabel } from '../lib/draftFlags'
import { money } from '../lib/format'
import { suggestCategory } from '../lib/categorize'
import type { AutoSavedItem, NativeDraft } from '../lib/nativeBridge'
import { logError } from '../lib/safeLog'
import type { DebtLite } from '../lib/debtMatch'
import { detectedNote } from '../lib/detectedNote'
import { cuotasText, installmentCase, installmentInfo, purchaseLabel, totalHint } from '../lib/installments'
import { DIAGNOSTIC_REASONS } from '../lib/bankConsent'

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
  /** «Es una cuota de una compra que ya anoté»: descarta el aviso sin crear ningún gasto */
  onPriorCharge?: (d: NativeDraft) => void
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
  /** Aviso sobre deudas de la pareja que no se pueden pagar desde aquí */
  debtsNote?: string
  /** Guarda el ingreso detectado; si falla lanza el error (el borrador queda) */
  onSaveIncome?: (d: NativeDraft) => Promise<void>
  /** Registra el pago en la deuda elegida; si falla lanza el error (el borrador queda) */
  onPayDebt?: (d: NativeDraft, debtId: string) => Promise<void>
  /** Crea la deuda (nombre y saldo) y registra el pago contra ella; si falla lanza (el borrador queda) */
  onPayNewDebt?: (d: NativeDraft, name: string, balance: number) => Promise<void>
  /** Lo que queda del mes si se guarda así (null = sin dato de sueldo) */
  monthLeft?: (d: NativeDraft, effect: MonthEffect, debtId?: string) => number | null
}

const GROUPS = [
  { kind: 'EXPENSE', title: 'Gastos', cls: 'kind-expense' },
  { kind: 'INCOME', title: 'Ingresos', cls: 'kind-income' },
  { kind: 'DEBT_PAYMENT', title: 'Pagos de tarjeta', cls: 'kind-debt' },
  { kind: 'TRANSFER_OUT', title: 'Transferencias', cls: 'kind-debt' },
] as const

const dayFmt = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' })

/** «Movimientos detectados»: lo que el teléfono encontró en tus avisos del banco, para que tú lo apruebes. */
export default function DetectedInbox({ drafts, failed, categories, history, onReview, onSaveWith, onIgnore, onPriorCharge, onRetry, onSettings, kept, onKeepBoth, appNames = new Map(), autoSaved = [], onUndoAuto, debts = [], debtsNote, onSaveIncome, onPayDebt, onPayNewDebt, monthLeft }: Props) {
  const [picking, setPicking] = useState<NativeDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
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
        if (d.kind === 'INCOME') {
          const title = `Ingreso extra de ${money(d.amountClp)}`
          const off = busy !== null
          const left = monthLeft?.(d, 'income') ?? null
          return (
            <section className="card detected kind-income" key={d.id} aria-label={title}>
              <div className="row between">
                <strong className="num">{title}</strong>
                <span className="muted small-text">{dayFmt.format(d.postedAtMillis)}</span>
              </div>
              {d.account && <span className="muted small-text">{d.account}</span>}
              <span>Se guarda en «Ingresos extra» y suma a tu mes.</span>
              <span className="muted small-text">Si es un movimiento entre tus cuentas, no es un ingreso.</span>
              {left !== null && (
                <span className="muted small-text" role="status">
                  Después de guardar te quedan {money(left)} este mes.
                </span>
              )}
              <div className="row detected-actions">
                <button type="button" className="btn" disabled={off} onClick={() => void run(d, onSaveIncome && (() => onSaveIncome(d)))}>
                  Guardar en Ingresos extra
                </button>
                <button type="button" className="btn ghost small" disabled={off} onClick={() => onIgnore(d)}>
                  Es entre mis cuentas
                </button>
              </div>
            </section>
          )
        }
        if (d.kind === 'DEBT_PAYMENT' || d.kind === 'TRANSFER_OUT') {
          return (
            <RoutedMovement
              key={d.id}
              d={d}
              dayLabel={dayFmt.format(d.postedAtMillis)}
              debts={debts}
              debtsNote={debtsNote}
              categories={categories}
              history={history}
              off={busy !== null}
              run={(job) => void run(d, job)}
              onPayDebt={onPayDebt}
              onPayNewDebt={onPayNewDebt}
              onSaveAsExpense={onSaveWith}
              onIgnore={onIgnore}
              monthLeft={monthLeft}
            />
          )
        }
        const cuotas = installmentCase(d)
        if (cuotas === 'PRIOR_CHARGE') {
          const title = `Cuota de ${money(d.amountClp)}`
          return (
            <section className="card detected kind-expense" key={d.id} aria-label={`${title} ${d.merchant ?? ''}`}>
              <div className="row between">
                <strong>{DIAGNOSTIC_REASONS['INSTALLMENT_CHARGE']?.title}</strong>
                <span className="muted small-text">{dayFmt.format(d.postedAtMillis)}</span>
              </div>
              <span className="num">
                {title}
                {d.merchant ? ` · ${d.merchant}` : ''}
              </span>
              {d.installment && <span className="muted small-text">Cuota {d.installment.n} de {d.installment.total}.</span>}
              <span className="muted small-text">{DIAGNOSTIC_REASONS['INSTALLMENT_CHARGE']?.detail}</span>
              <div className="row detected-actions">
                <button type="button" className="btn" onClick={() => (onPriorCharge ?? onIgnore)(d)}>
                  Es una cuota de una compra que ya anoté
                </button>
                <button type="button" className="btn ghost small" onClick={() => onIgnore(d)}>
                  Ignorar
                </button>
              </div>
            </section>
          )
        }
        const info = installmentInfo(d)
        const noTotal = cuotas === 'NO_TOTAL'
        const suggested = noTotal ? null : d.merchant ? suggestCategory(d.merchant, categories, history) : null
        const name = categories.find((c) => c.id === suggested)?.name
        const duplicate = marks.has(d.id) && !kept.has(d.id)
        return (
          <section className={duplicate ? 'card detected kind-expense dup' : 'card detected kind-expense'} key={d.id} aria-label={`${money(d.amountClp)} ${d.merchant ?? ''}`}>
            <div className="row between">
              <strong className="num">{noTotal ? `Cuota de ${money(d.amountClp)}` : money(d.amountClp)}</strong>
              <span className="muted small-text">{dayFmt.format(d.postedAtMillis)}</span>
            </div>
            <span>{d.merchant ?? 'Sin comercio'}</span>
            {info && (
              <span className="small-text" role="note">
                {noTotal ? (info.value ? totalHint(info.value) : `Compra en ${cuotasText(info.count, undefined)}. Escribe el total de la compra.`) : purchaseLabel(info, d.amountClp)}
              </span>
            )}
            {d.account && <span className="muted small-text">Con {d.account}</span>}
            {d.medium === 'CREDIT' && <span className="muted small-text">Es con tarjeta de crédito: no baja tu saldo de débito, sube lo usado de la tarjeta.</span>}
            <span className="muted small-text" style={{ whiteSpace: 'pre-line' }}>
              {detectedNote({ category: name ?? null, source: d.sourcePackage ? sourceLabel(d.sourcePackage, appNames) : null, installment: d.installment ?? null })}
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
            {!noTotal && (
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
            )}
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
                <span className="sev sev-info">{a.kind === 'income' ? 'Ingreso extra' : 'Guardado automático'}</span>
              </div>
              <span>{a.kind === 'income' ? 'Ingreso extra' : a.note || 'Sin detalle'}</span>
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
