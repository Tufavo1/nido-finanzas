import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import type { Household } from './App'
import ScreenLoader from './components/ScreenLoader'
import Icon from './components/Icon'
import InstallBanner from './components/InstallBanner'
import UpdateBanner from './components/UpdateBanner'
import LockScreen from './components/LockScreen'
import OfflineBar from './components/OfflineBar'
import Toast from './components/Toast'
import type { ToastData, ToastKind } from './components/Toast'
import { useData } from './lib/data'
import { ANNOUNCE_NEWS, NEWS_EVENT, TOUR_EVENT, markNewsSeen, markTourSeen, newsSeen, tourSeen } from './lib/tour'
import { focusMain } from './lib/a11y'
import type { AlertTab, MoneySection } from './lib/engine'
import { useAppLock } from './lib/useAppLock'
const Expenses = lazy(() => import('./screens/Expenses'))
const Goals = lazy(() => import('./screens/Goals'))
import Home from './screens/Home'
import { resolveScope } from './lib/scope'
import type { Scope } from './lib/scope'
const Money = lazy(() => import('./screens/Money'))
const Register = lazy(() => import('./screens/Register'))
const Security = lazy(() => import('./screens/Security'))
const Help = lazy(() => import('./screens/Help'))
const Profile = lazy(() => import('./screens/Profile'))
const Tour = lazy(() => import('./components/Tour'))

const TABS = [
  { key: 'home', label: 'Inicio', icon: 'home' },
  { key: 'expenses', label: 'Gastos', icon: 'list' },
  { key: 'add', label: 'Registrar', icon: 'plus' },
  { key: 'money', label: 'Finanzas', icon: 'wallet' },
  { key: 'goals', label: 'Metas', icon: 'target' },
] as const

// Ajustes y Ayuda no tienen pestaña propia: se abren con el engranaje de Inicio. Registrar queda en el centro de las 5; Perfil se abre desde Ajustes
type Tab = (typeof TABS)[number]['key'] | 'security' | 'help' | 'profile'

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
  // Guías: la de bienvenida sale sola la primera vez; la de novedades solo si tú la activas en lib/tour.ts. Ambas se abren desde Ajustes.
  const [tour, setTour] = useState<'welcome' | 'news' | null>(() =>
    !tourSeen(hh.me.user_id) ? 'welcome' : ANNOUNCE_NEWS && !newsSeen(hh.me.user_id) ? 'news' : null,
  )
  const closeTour = useCallback(() => {
    // Quien ve la bienvenida ya conoce todo lo nuevo
    markTourSeen(hh.me.user_id)
    markNewsSeen(hh.me.user_id)
    setTour(null)
  }, [hh.me.user_id])
  useEffect(() => {
    const welcome = () => setTour('welcome')
    const news = () => setTour('news')
    window.addEventListener(TOUR_EVENT, welcome)
    window.addEventListener(NEWS_EVENT, news)
    return () => {
      window.removeEventListener(TOUR_EVENT, welcome)
      window.removeEventListener(NEWS_EVENT, news)
    }
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

  // Finanzas se abre en la pestaña que pide el aviso (la clave reinicia la pantalla)
  const [moneyNav, setMoneyNav] = useState<{ section: MoneySection; n: number }>({ section: 'analysis', n: 0 })
  const goTo = useCallback((t: AlertTab, section?: MoneySection) => {
    if (t === 'money') setMoneyNav((v) => ({ section: section ?? 'analysis', n: v.n + 1 }))
    setTab(t)
  }, [])

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
        <ScreenLoader />
      </main>
    )
  } else if (tab === 'home') {
    body = <Home hh={hh} data={data} month={month} isCurrent={isCurrent} onMonth={shiftMonth} onGo={goTo} onSettings={() => setTab('security')} onToast={setToast} scope={scope} onScope={setScope} />
  } else if (tab === 'expenses') {
    body = <Expenses hh={hh} data={data} month={month} onToast={setToast} scope={scope} onScope={setScope} onRegister={() => setTab('add')} />
  } else if (tab === 'add') {
    body = <Register hh={hh} data={data} onSaved={backToNow} onToast={setToast} />
  } else if (tab === 'money') {
    body = <Money key={moneyNav.n} hh={hh} data={data} month={month} onToast={setToast} section={moneyNav.section} scope={scope} onScope={setScope} />
  } else if (tab === 'goals') {
    body = <Goals hh={hh} data={data} onToast={setToast} scope={scope} onScope={setScope} />
  } else if (tab === 'profile') {
    body = <Profile hh={hh} data={data} month={month} reload={reload} onToast={setToast} onGoSalary={() => goTo('money', 'salary')} onBack={() => setTab('security')} />
  } else if (tab === 'help') {
    body = <Help onBack={() => setTab('security')} />
  } else {
    body = <Security hh={hh} reload={reload} onToast={setToast} onHelp={() => setTab('help')} onProfile={() => setTab('profile')} />
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
            <ScreenLoader />
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
          </button>
        ))}
      </nav>
      {tour && data.ready && (
        <Suspense fallback={null}>
          <Tour kind={tour} onClose={closeTour} />
        </Suspense>
      )}
      <InstallBanner onToast={setToast} />
      <UpdateBanner />
      {toast && <Toast toast={toast} onDone={clearToast} />}
    </div>
  )
}