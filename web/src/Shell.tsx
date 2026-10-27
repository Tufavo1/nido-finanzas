import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Household } from './App'
import Icon from './components/Icon'
import InstallBanner from './components/InstallBanner'
import UpdateBanner from './components/UpdateBanner'
import LockScreen from './components/LockScreen'
import OfflineBar from './components/OfflineBar'
import Toast from './components/Toast'
import type { ToastData, ToastKind } from './components/Toast'
import { useData } from './lib/data'
import { TOUR_EVENT, markTourSeen, tourSeen } from './lib/tour'
import { focusMain } from './lib/a11y'
import { buildAlerts } from './lib/engine'
import type { AlertTab, MoneySection } from './lib/engine'
import { readSnoozed, snoozeAlert, withoutSnoozed } from './lib/alertState'
import type { ExpRow } from './lib/expenseAnalysis'
import { fetchExpenseRows } from './lib/history'
import { notifyNewAlerts } from './lib/smartNotify'
import { useAppLock } from './lib/useAppLock'
const Expenses = lazy(() => import('./screens/Expenses'))
const Goals = lazy(() => import('./screens/Goals'))
import Home from './screens/Home'
import { resolveScope } from './lib/scope'
import type { Scope } from './lib/scope'
const Money = lazy(() => import('./screens/Money'))
const Register = lazy(() => import('./screens/Register'))
const Security = lazy(() => import('./screens/Security'))
const Tour = lazy(() => import('./components/Tour'))

const TABS = [
  { key: 'home', label: 'Inicio', icon: 'home' },
  { key: 'expenses', label: 'Gastos', icon: 'list' },
  { key: 'add', label: 'Registrar', icon: 'plus' },
  { key: 'money', label: 'Finanzas', icon: 'wallet' },
  { key: 'goals', label: 'Metas', icon: 'target' },
] as const

// Ajustes no tiene pestaña propia: se abre con el engranaje de Inicio, así Registrar queda en el centro
type Tab = (typeof TABS)[number]['key'] | 'security'

// Cuando el navegador está libre, deja listas las pantallas pesadas para que abran al instante
function warmScreens() {
  void import('./screens/Expenses')
  void import('./screens/Money')
  void import('./screens/Goals')
  void import('./screens/Register')
}

export default function Shell({ hh, reload }: { hh: Household; reload: () => Promise<void> }) {
  // Los accesos directos de la app instalada abren con ?tab=add, ?tab=expenses, etc.
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(location.search).get('tab')
    return TABS.some((x) => x.key === t) ? (t as Tab) : 'home'
  })
  // De quién se ven los datos (hogar, yo o mi pareja): se mantiene al cambiar de pestaña
  const [scopeRaw, setScope] = useState<Scope>('all')
  const scope = resolveScope(scopeRaw, hh.members)
  const { locked, unlock } = useAppLock()
  // Al cambiar de pestaña: título del documento y foco en la pantalla nueva (no al abrir la app)
  const firstTab = useRef(true)
  useEffect(() => {
    const label = tab === 'security' ? 'Ajustes' : TABS.find((x) => x.key === tab)?.label
    document.title = label ? `${label} · Contigo` : 'Contigo'
    if (firstTab.current) {
      firstTab.current = false
      return
    }
    focusMain()
  }, [tab])
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000))
    idle(warmScreens)
  }, [])
  const [ym, setYm] = useState(() => {
    const n = new Date()
    return { y: n.getFullYear(), m: n.getMonth() }
  })
  const [toast, setToastData] = useState<ToastData | null>(null)
  const clearToast = useCallback(() => setToastData(null), [])
  const setToast = useCallback((text: string, kind: ToastKind = 'success') => setToastData({ text, kind, id: Date.now() }), [])
  const data = useData(hh.household.id, hh.me.user_id, ym.y, ym.m, reload)
  // Guía de bienvenida: sale sola la primera vez que la persona entra, y se puede volver a abrir desde Ajustes
  const [tour, setTour] = useState(() => !tourSeen(hh.me.user_id))
  const closeTour = useCallback(() => {
    markTourSeen(hh.me.user_id)
    setTour(false)
  }, [hh.me.user_id])
  useEffect(() => {
    const open = () => setTour(true)
    window.addEventListener(TOUR_EVENT, open)
    return () => window.removeEventListener(TOUR_EVENT, open)
  }, [])
  // Si aparece un gasto de alguien que la lista de miembros aún no conoce (p. ej. la pareja entró con la app ya abierta),
  // se recarga el hogar una vez por cada persona desconocida, para que su inicial salga siempre.
  const asked = useRef(new Set<string>())
  useEffect(() => {
    if (!data.ready) return
    const known = new Set(hh.everyone.map((m) => m.user_id))
    const unknown = [...data.expenses, ...data.prevExpenses].map((e) => e.paid_by).filter((id) => !known.has(id) && !asked.current.has(id))
    if (unknown.length === 0) return
    for (const id of unknown) asked.current.add(id)
    void reload()
  }, [data.ready, data.expenses, data.prevExpenses, hh.everyone, reload])
  // Al entrar (o cambiar de pestaña) la pantalla empieza arriba, no donde haya quedado el scroll de antes
  useEffect(() => {
    if (!data.ready) return
    document.querySelector('main.screen')?.scrollTo(0, 0)
    window.scrollTo(0, 0)
  }, [data.ready, tab])

  const now = new Date()
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth()
  const month = new Date(ym.y, ym.m, 1)

  // Gastos de los últimos meses (con nota): alimentan los avisos de gastos repetidos, inusuales y suscripciones
  const [rows, setRows] = useState<ExpRow[]>([])
  useEffect(() => {
    if (!data.ready) return
    let off = false
    fetchExpenseRows(hh.household.id, new Date(ym.y, ym.m, 1))
      .then((r) => {
        if (!off) setRows(r)
      })
      .catch(() => {
        /* sin historial se omiten solo esos avisos */
      })
    return () => {
      off = true
    }
  }, [data.ready, hh.household.id, ym.y, ym.m, data.expenses])

  // Avisos que la persona pospuso o descartó: se guardan en este dispositivo
  const [snoozed, setSnoozed] = useState(() => readSnoozed())
  const snooze = useCallback((id: string, days: number) => setSnoozed(snoozeAlert(id, days)), [])
  // Finanzas se abre en la pestaña que pide el aviso (la clave reinicia la pantalla)
  const [moneyNav, setMoneyNav] = useState<{ section: MoneySection; n: number }>({ section: 'analysis', n: 0 })
  const goTo = useCallback((t: AlertTab, section?: MoneySection) => {
    if (t === 'money') setMoneyNav((v) => ({ section: section ?? 'analysis', n: v.n + 1 }))
    setTab(t)
  }, [])

  // Motor de avisos: se recalcula en cada cambio de datos
  const allAlerts = useMemo(
    () => (data.ready ? buildAlerts(hh, data, month, undefined, { rows }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hh, data.ready, data.expenses, data.prevExpenses, data.categories, data.goals, data.contributions, data.debts, data.debtPayments, data.salary, data.incomes, data.recurring, data.profiles, rows, ym.y, ym.m],
  )
  const alerts = useMemo(() => withoutSnoozed(allAlerts, snoozed), [allAlerts, snoozed])
  const urgent = alerts.filter((a) => a.level === 'bad' || a.level === 'warn').length
  useEffect(() => {
    if (data.ready && !data.loading && isCurrent) void notifyNewAlerts(alerts)
  }, [alerts, data.ready, data.loading, isCurrent])

  function shiftMonth(delta: number) {
    if (delta > 0 && isCurrent) return
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  function backToNow(message?: string) {
    if (message) setToast(message)
    const n = new Date()
    setYm({ y: n.getFullYear(), m: n.getMonth() })
    setTab('home')
  }

  let body
  if (data.error) {
    body = (
      <main className="screen center-y">
        <p className="error" role="alert">
          {data.error}
        </p>
        <button className="btn" type="button" onClick={() => void data.refresh()}>
          Reintentar
        </button>
      </main>
    )
  } else if (!data.ready) {
    body = (
      <main className="screen center-y">
        <p className="muted">Cargando…</p>
      </main>
    )
  } else if (tab === 'home') {
    body = <Home hh={hh} data={data} month={month} isCurrent={isCurrent} onMonth={shiftMonth} alerts={alerts} onGo={goTo} onSnooze={snooze} onSettings={() => setTab('security')} onToast={setToast} scope={scope} onScope={setScope} />
  } else if (tab === 'expenses') {
    body = <Expenses hh={hh} data={data} month={month} onToast={setToast} scope={scope} onScope={setScope} />
  } else if (tab === 'add') {
    body = <Register hh={hh} data={data} onSaved={backToNow} />
  } else if (tab === 'money') {
    body = <Money key={moneyNav.n} hh={hh} data={data} month={month} onToast={setToast} section={moneyNav.section} scope={scope} onScope={setScope} />
  } else if (tab === 'goals') {
    body = <Goals hh={hh} data={data} onToast={setToast} scope={scope} onScope={setScope} />
  } else {
    body = <Security hh={hh} reload={reload} data={data} onToast={setToast} />
  }

  if (locked) return <LockScreen onUnlock={unlock} />

  return (
    <div className="app">
      <a
        className="skip"
        href="#contenido"
        onClick={(e) => {
          e.preventDefault()
          focusMain()
        }}
      >
        Saltar al contenido
      </a>
      <OfflineBar />
      <Suspense
        fallback={
          <main className="screen center-y">
            <p className="muted">Cargando…</p>
          </main>
        }
      >
        {body}
      </Suspense>
      <nav className="tabbar" aria-label="Principal">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={t.key === 'add' ? 'tab add' : 'tab'}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.key === 'add' ? (
              <span className="plus">
                <Icon name={t.icon} />
              </span>
            ) : (
              <Icon name={t.icon} />
            )}
            <span>{t.label}</span>
            {t.key === 'home' && urgent > 0 && (
              <span className="badge" aria-label={`${urgent} avisos`}>
                {urgent}
              </span>
            )}
          </button>
        ))}
      </nav>
      {tour && data.ready && (
        <Suspense fallback={null}>
          <Tour onClose={closeTour} />
        </Suspense>
      )}
      <InstallBanner onToast={setToast} />
      <UpdateBanner />
      {toast && <Toast toast={toast} onDone={clearToast} />}
    </div>
  )
}