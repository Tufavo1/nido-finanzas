import { useCallback, useState } from 'react'
import type { Household } from './App'
import Icon from './components/Icon'
import Toast from './components/Toast'
import { useData } from './lib/data'
import Expenses from './screens/Expenses'
import Goals from './screens/Goals'
import Home from './screens/Home'
import Register from './screens/Register'
import Security from './screens/Security'

const TABS = [
  { key: 'home', label: 'Inicio', icon: 'home' },
  { key: 'expenses', label: 'Gastos', icon: 'list' },
  { key: 'add', label: 'Registrar', icon: 'plus' },
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
  const data = useData(hh.household.id, ym.y, ym.m)

  const now = new Date()
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth()
  const month = new Date(ym.y, ym.m, 1)

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
    body = <Home hh={hh} data={data} month={month} isCurrent={isCurrent} onMonth={shiftMonth} />
  } else if (tab === 'expenses') {
    body = <Expenses hh={hh} data={data} onToast={setToast} />
  } else if (tab === 'add') {
    body = <Register hh={hh} data={data} onSaved={backToNow} />
  } else if (tab === 'goals') {
    body = <Goals hh={hh} data={data} />
  } else {
    body = <Security hh={hh} reload={reload} />
  }

  return (
    <div className="app">
      {body}
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
          </button>
        ))}
      </nav>
      {toast && <Toast text={toast} onDone={clearToast} />}
    </div>
  )
}