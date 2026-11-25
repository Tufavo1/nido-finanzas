// Copyright (c) 2026 Dinovance
import { enqueueNative } from './nativeSerial'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Household } from '../App'
import type { Notify } from '../components/Toast'
import { candidateToDraft } from './candidates'
import type { ExpenseDraft } from './candidates'
import type { CaptureConfig } from './captureConfig'
import type { HouseholdData } from './data'
import { money } from './format'
import { draftExpenseId } from './draftExpenseId'
import { newId } from './idempotency'
import { draftCategoryId, expenseRow, planDrafts, withoutSavedDrafts } from './inbox'
import { ContigoNative, isNativeApp, ownerKeyOf, parseAutoSaved, parseSyncNowResult, pendingToSendCount, readDrafts, readRecentApps } from './nativeBridge'
import type { AutoSavedItem, NativeDraft, SyncNowResult } from './nativeBridge'
import type { OfflineQueue } from './offlineQueue'
import { syncNeedsSignIn } from './bankAuto'
import { sendNowNotice, stillUnsent, syncResultNotice, unsentCount, unsentDrafts } from './draftFlags'
import { enqueueWithNotice } from './queueNotice'
import { deleteExpense, insertExpenseRow } from './saveExpense'
import { debtPaymentRow, incomeRow, newDebtRow, saveMovement } from './movements'
import { deleteIncomeRow, insertDebtPaymentRow, insertDebtRow, insertIncomeRow } from './saveMovement'
import { useAppResume } from './useAppResume'
import { onRescanned, rescanNow } from './rescan'
import { logError } from './safeLog'

/** Tiempo para tocar «Deshacer» (CA-09-2) */
export const UNDO_MS = 10_000

interface Args {
  hh: Household
  data: HouseholdData
  config: CaptureConfig
  queue: OfflineQueue
  notify: Notify
}

/**
 * Gastos detectados por el teléfono: los vacía al abrir y al reanudar la app, guarda solos los que corresponde
 * (ya confirmados o modo automático) y deja el resto en la bandeja. Guardar usa un id idempotente por borrador.
 */
export function useDetected({ hh, data, config, queue, notify }: Args) {
  const native = isNativeApp()
  const [drafts, setDrafts] = useState<NativeDraft[] | null>(native ? null : [])
  const [failed, setFailed] = useState(false)
  const [autoSaved, setAutoSaved] = useState<AutoSavedItem[]>([])
  const [pending, setPending] = useState<number | null>(null)
  const [appNames, setAppNames] = useState<ReadonlyMap<string, string>>(new Map())
  const [openId, setOpenId] = useState<string | null>(null)
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set())
  const [stuck, setStuck] = useState<ReadonlySet<string>>(new Set())
  const inflight = useRef(new Set<string>())

  const history = useMemo(() => [...data.expenses, ...data.prevExpenses], [data.expenses, data.prevExpenses])
  const ctx = useMemo(() => ({ categories: data.categories, history }), [data.categories, history])

  const load = useCallback(async () => {
    if (!native) return
    try {
      // Sin dueño el teléfono no captura y no entrega borradores: se fija antes de leer (usuario + hogar activo)
      const ownerKey = ownerKeyOf(hh.me.user_id, hh.household.id)
      await enqueueNative(() => ContigoNative.setActiveOwner({ ownerKey }))
      const [list, toSend] = await Promise.all([readDrafts(ContigoNative), pendingToSendCount(ContigoNative)])
      setDrafts(list)
      setPending(toSend)
      setAutoSaved(parseAutoSaved(await ContigoNative.listAutoSaved()))
      // Los nombres de las apps son un extra: sin ellos se muestra el paquete
      setAppNames(new Map((await readRecentApps(ContigoNative).catch(() => [])).map((a) => [a.packageName, a.label])))
      setFailed(false)
      const { id } = await ContigoNative.consumePendingOpen()
      if (id) setOpenId(id)
    } catch (e) {
      logError(e, 'useDetected')
      setFailed(true)
      setDrafts((prev) => prev ?? [])
    }
  }, [native, hh.me.user_id, hh.household.id])

  // Relectura de los avisos ya presentes en el teléfono: sin esperar, en silencio; si hay algo nuevo, refresca la bandeja
  useEffect(() => (native ? onRescanned(() => void load()) : undefined), [native, load])
  useEffect(() => {
    // En el siguiente turno: la lectura inicial no cambia el estado durante el montaje
    const t = window.setTimeout(() => {
      void load()
      // Al abrir y al iniciar sesión (el hook se monta con la sesión)
      void rescanNow()
    }, 0)
    return () => window.clearTimeout(t)
  }, [load])
  useAppResume(() => {
    void load()
    void rescanNow()
  })
  useEffect(() => {
    if (!native) return
    const handles = [ContigoNative.addListener('draftsChanged', () => void load()), ContigoNative.addListener('draftOpen', (e) => setOpenId(e.id))]
    return () => void Promise.all(handles).then((hs) => hs.forEach((h) => void h.remove()))
  }, [native, load])

  const clearOpen = useCallback(() => setOpenId(null), [])

  const undo = useCallback(
    async (id: string) => {
      try {
        await deleteExpense(id)
        await data.refresh()
        notify('Gasto deshecho\nLo borré de tus gastos.', 'info')
      } catch (e) {
        logError(e, 'useDetected')
        notify('No se pudo deshacer\nRevisa tu conexión e inténtalo de nuevo.', 'error')
      }
    },
    [data, notify],
  )

  /** Guarda el gasto. Sin red lo deja en la cola; un rechazo de la base lanza el error para que la pantalla lo muestre. */
  const save = useCallback(
    async (form: ExpenseDraft, nativeId?: string) => {
      // El id sale del borrador: sobrevive a un reinicio y reenviar nunca duplica el gasto
      const id = nativeId ? draftExpenseId(nativeId) : newId()
      const r = await insertExpenseRow(expenseRow(hh.household.id, id, form, hh.me.user_id))
      if (r.ok) {
        notify(`Gasto guardado\n**${money(form.amount)}** en ${form.note || 'tus gastos'}.`, 'success', { label: 'Deshacer', durationMs: UNDO_MS, onAction: () => void undo(id) })
        await data.refresh()
      } else if (!(r.transient && (await enqueueWithNotice(queue, { ...form, id }, notify)))) {
        throw new Error('No se pudo guardar el gasto')
      }
      if (nativeId) {
        try {
          await ContigoNative.removeDraft({ id: nativeId })
        } catch (e) {
          // El gasto ya está guardado; si el borrador queda, el mismo id evita duplicarlo
          logError(e, 'useDetected')
        }
        await load()
      }
    },
    [hh.household.id, hh.me.user_id, data, notify, queue, undo, load],
  )

  /** «Sí, es un ingreso»: lo guarda directo; si falla lanza y el borrador queda. */
  const saveIncome = useCallback(
    async (d: NativeDraft) => {
      await saveMovement(d, 'INCOME', {
        insert: () => insertIncomeRow(incomeRow(hh.household.id, d)),
        removeDraft: (id) => ContigoNative.removeDraft({ id }),
        onRemoveError: (e) => logError(e, 'useDetected'),
      })
      notify(`Ingreso extra guardado\n**${money(d.amountClp)}** sumados a tu balance.`, 'success')
      await data.refresh()
      await load()
    },
    [hh.household.id, data, notify, load],
  )

  /** «Registrar pago»: abona a la deuda elegida; si falla lanza y el borrador queda. */
  const saveDebtPayment = useCallback(
    async (d: NativeDraft, debtId: string) => {
      await saveMovement(d, ['DEBT_PAYMENT', 'TRANSFER_OUT'], {
        insert: () => insertDebtPaymentRow(debtPaymentRow(hh.household.id, d, debtId, hh.me.user_id)),
        removeDraft: (id) => ContigoNative.removeDraft({ id }),
        onRemoveError: (e) => logError(e, 'useDetected'),
      })
      notify(`Pago registrado\nSe abonaron **${money(d.amountClp)}** a la deuda.`, 'success')
      await data.refresh()
      await load()
    },
    [hh.household.id, hh.me.user_id, data, notify, load],
  )

  /** «Crear una deuda nueva»: crea la deuda (nombre y saldo) y registra el pago contra ella; si falla lanza y el borrador queda. */
  const saveDebtPaymentNew = useCallback(
    async (d: NativeDraft, name: string, balance: number) => {
      const debt = newDebtRow(hh.household.id, d, name, balance)
      await saveMovement(d, ['DEBT_PAYMENT', 'TRANSFER_OUT'], {
        // Ids estables: si el pago falla después de crear la deuda, reintentar reconoce la deuda ya creada
        insert: async () => (await insertDebtRow(debt)) && (await insertDebtPaymentRow(debtPaymentRow(hh.household.id, d, debt.id, hh.me.user_id))),
        removeDraft: (id) => ContigoNative.removeDraft({ id }),
        onRemoveError: (e) => logError(e, 'useDetected'),
      })
      notify(`Deuda creada y pago registrado\nSe abonaron **${money(d.amountClp)}** a «${debt.name}».`, 'success')
      await data.refresh()
      await load()
    },
    [hh.household.id, hh.me.user_id, data, notify, load],
  )

  const ignore = useCallback(
    async (d: NativeDraft, notice = 'Descartado\nNo lo anotamos.') => {
      try {
        await ContigoNative.removeDraft({ id: d.id })
        await load()
        notify(notice, 'info')
      } catch (e) {
        logError(e, 'useDetected')
        notify('No se pudo descartar\nInténtalo de nuevo.', 'error')
      }
    },
    [load, notify],
  )

  /** «Es una cuota de una compra que ya anoté»: se descarta sin crear gasto (la compra ya suma por su total) */
  const discardPriorCharge = useCallback((d: NativeDraft) => ignore(d, 'Cuota descartada\nNo la sumé: esa compra ya está anotada.'), [ignore])

  /**
   * Deshacer un guardado automático. Si el gasto ya llegó al servidor, la app lo borra por la ruta de datos de
   * siempre y recién entonces le dice al teléfono que lo quite de la lista. Un error se avisa con «Reintentar».
   */
  const undoAuto = useCallback(
    async function run(id: string): Promise<void> {
      try {
        const income = autoSaved.find((a) => a.id === id)?.kind === 'income'
        const r = await ContigoNative.undoAutoSaved({ id })
        if (r.needsDelete) {
          if (income) await deleteIncomeRow(id)
          else await deleteExpense(id)
          await ContigoNative.dismissAutoSaved({ id })
          await data.refresh()
        }
        notify(income ? 'Ingreso deshecho\nLo quité de tus ingresos extra.' : 'Gasto deshecho\nLo quité de tus gastos.', 'info')
        await load()
      } catch (e) {
        logError(e, 'useDetected')
        notify('No se pudo deshacer\nRevisa tu conexión e inténtalo de nuevo.', 'error', { label: 'Reintentar', onAction: () => void run(id) })
      }
    },
    [data, notify, load, autoSaved],
  )

  /** «Conservar ambos»: la persona dice que no es un duplicado */
  const keepBoth = useCallback((id: string) => setKept((prev) => new Set(prev).add(id)), [])

  /** «Enviar ahora»: vuelve a intentar lo que quedó trabado */
  const sendNow = useCallback(async () => {
    setStuck(new Set())
    if (!native) return
    // Lo que la app guarda sola (confirmados con el total) no es del teléfono: lo cuenta aparte
    const unsentNow = async (): Promise<number> => {
      const list = await readDrafts(ContigoNative)
      const saving = new Set(planDrafts(list, config, ctx, new Set()).auto.map((d) => d.id))
      return stillUnsent(list, saving).length
    }
    let before = 0
    let failed = false
    let result: SyncNowResult | null = null
    try {
      before = await unsentNow()
      result = parseSyncNowResult(await ContigoNative.syncNow())
    } catch (e) {
      logError(e, 'useDetected')
      failed = true
    }
    // Un plugin que responde sin enviar nada se nota porque el borrador sigue ahí
    const remaining = await unsentNow().catch(() => before)
    await load()
    if (result) {
      const needsSignIn = result.result === 'NO_SESSION' && syncNeedsSignIn(await ContigoNative.getSyncState().catch(() => null))
      const notice = syncResultNotice(result, { waiting: Math.max(before, remaining), needsSignIn })
      if (notice) notify(notice.text, notice.tone)
      return
    }
    // Teléfono viejo: no informa el resultado, se compara lo que había antes y después
    const text = sendNowNotice({ before, remaining, failed })
    if (text) notify(text, remaining > 0 ? 'warn' : 'success')
  }, [load, native, config, ctx, notify])

  // Guardado automático de lo que ya está confirmado o cumple las reglas del modo automático
  useEffect(() => {
    if (!drafts || !data.ready) return
    const skip = new Set([...inflight.current, ...stuck])
    for (const d of planDrafts(drafts, config, ctx, skip).auto) {
      inflight.current.add(d.id)
      const form = { ...candidateToDraft(d, { paidBy: hh.me.user_id, shared: config.autoShared, categories: ctx.categories, history: ctx.history }), category_id: draftCategoryId(d, ctx.categories, ctx.history) }
      void save(form, d.id)
        .catch((e: unknown) => {
          logError(e, 'useDetected')
          setStuck((prev) => new Set(prev).add(d.id))
          notify('No se pudo guardar un gasto detectado\nLo dejé en tu bandeja para que lo revises.', 'warn')
        })
        .finally(() => inflight.current.delete(d.id))
    }
  }, [drafts, data.ready, config, ctx, hh.me.user_id, save, notify, stuck])

  // En la bandeja: lo que se guardará solo no aparece (salvo que haya fallado)
  const autoIds = new Set((drafts ? planDrafts(drafts, config, ctx, new Set()).auto : []).map((d) => d.id))
  const savedIds = new Set(history.map((e) => e.id))
  // Mientras un gasto guardado solo sigue sincronizando, el teléfono aún puede traer su borrador: no se muestra dos veces
  const waiting = withoutSavedDrafts(
    (drafts ?? []).filter((d) => stuck.has(d.id) || !autoIds.has(d.id)),
    autoSaved,
    savedIds,
  )
  const localUnsent = unsentDrafts(waiting)
  const unsent = { count: unsentCount(pending, localUnsent.length) }
  return { drafts: drafts === null ? null : waiting, unsent, appNames, autoSaved, undoAuto, kept, keepBoth, sendNow, failed, openId, clearOpen, save, saveIncome, saveDebtPayment, saveDebtPaymentNew, ignore, discardPriorCharge, reload: load, ctx }
}
