import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import type { Household } from './App'
import Icon from './components/Icon'
import Toast from './components/Toast'
import { useData } from './lib/data'
import { buildAlerts } from './lib/engine'
import type { AlertTab } from './lib/engine'
import { notifyNewAlerts } from './lib/smartNotify'
const Expenses = lazy(() => import('./screens/Expenses'))
const Goals = lazy(() => import('./screens/Goals'))
import Home from './screens/Home'
const Money = lazy(() => import('./screens/Money'))
const Register = lazy(() => import('./screens/Register'))
const Security = lazy(() => import('./screens/Security'))

const TABS = [
  { key: 'home', label: 'Inicio', icon: 'home' },
  { key: 'expenses', label: 'Gastos', icon: 'list' },
  { key: 'add', label: 'Registrar', icon: 'plus' },
  { key: 'money', label: 'Plata', icon: 'wallet' },
  { key: 'goals', label: 'Metas', icon: 'target' },
  { key: 'security', label: 'Ajustes', icon: 'shield' },
] as const

type Tab = (typeof TABS)[number]['key']

export default function Shell({ hh, reload }: { hh: Household; reload: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>('home')
  const [ym, setYm] = useState(() => {
    const n = new Date()
    return { y: n.getFullYear(), m: n.getMonth() }
  })
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const data = useData(hh.household.id, hh.me.user_id, ym.y, ym.m, reload)

  const now = new Date()
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth()
  const month = new Date(ym.y, ym.m, 1)

  // Motor de avisos: se recalcula en cada cambio de datos
  const alerts = useMemo(
    () => (data.ready ? buildAlerts(hh, data, month) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hh, data.ready, data.expenses, data.prevExpenses, data.categories, data.goals, data.contributions, data.debts, data.debtPayments, data.salary, data.profiles, ym.y, ym.m],
  )
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
    body = <Home hh={hh} data={data} month={month} isCurrent={isCurrent} onMonth={shiftMonth} alerts={alerts} onGo={(t: AlertTab) => setTab(t === 'security' ? 'security' : t)} />
  } else if (tab === 'expenses') {
    body = <Expenses hh={hh} data={data} onToast={setToast} />
  } else if (tab === 'add') {
    body = <Register hh={hh} data={data} onSaved={backToNow} />
  } else if (tab === 'money') {
    body = <Money hh={hh} data={data} month={month} onToast={setToast} />
  } else if (tab === 'goals') {
    body = <Goals hh={hh} data={data} />
  } else {
    body = <Security hh={hh} reload={reload} data={data} onToast={setToast} />
  }

  return (
    <div className="app">
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
      {toast && <Toast text={toast} onDone={clearToast} />}
    </div>
  )
}