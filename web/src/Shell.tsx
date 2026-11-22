import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Household } from './App'
import { SkeletonScreen } from './components/Skeleton'
import PullIndicator from './components/PullIndicator'
import ErrorPage from './components/ErrorPage'
import StatePage from './components/StatePage'
import ConfirmExpense from './components/ConfirmExpense'
import ConfirmLeave from './components/ConfirmLeave'
import DetectedInbox from './components/DetectedInbox'
import UnsentBanner from './components/UnsentBanner'
import { candidateToDraft } from './lib/candidates'
import type { ParsedCandidate } from './lib/candidates'
import { linkToDraft } from './lib/linkGuard'
import { registerOverlay } from './lib/overlays'
import { useCaptureConfig } from './lib/useCaptureConfig'
import { useDeepLink } from './lib/useDeepLink'
import { useAutoSync } from './lib/useAutoSync'
import { useDetected } from './lib/useDetected'
import { useExpenseQueue } from './lib/useExpenseQueue'
import { errorScreen } from './lib/screenState'
import { supabase } from './lib/supabase'
import Icon from './components/Icon'
import InstallBanner from './components/InstallBanner'
import { checkUpdates } from './lib/appUpdateStore'
import BankConsentSheet from './components/BankConsentSheet'
import { readConsent, shouldAskConsent } from './lib/bankConsent'
import { isNativeApp } from './lib/nativeBridge'
import NativeUpdateSheet from './components/NativeUpdateSheet'
import UpdateBanner from './components/UpdateBanner'
import LockScreen from './components/LockScreen'
import OfflineBar from './components/OfflineBar'
import Toast from './components/Toast'
import { useToasts } from './lib/useToasts'
import { useBackButton } from './lib/useBackButton'
import { usePullToRefresh } from './lib/usePullToRefresh'
import { useData } from './lib/data'
import { ANNOUNCE_NEWS, NEWS_EVENT, TOUR_EVENT, markNewsSeen, markTourSeen, newsSeen, tourSeen } from './lib/tour'
import { focusMain } from './lib/a11y'
import type { AlertTab, MoneySection } from './lib/engine'
import { useAppLock } from './lib/useAppLock'
const Expenses = lazy(() => import('./screens/Expenses'))
const Goals = lazy(() => import('./screens/Goals'))
import Home from './screens/Home'
import { resolveScope } from './lib/scope'
import { readSharedNotice } from './lib/bankNotice'
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
type Tab = (typeof TABS)[number]['key'] | 'security' | 'help' | 'profile' | 'inbox'

// Cuando el navegador está libre, deja listas las pantallas pesadas para que abran al instante
function warmScreens() {
  void import('./screens/Expenses')
  void import('./screens/Money')
  void import('./screens/Goals')
  void import('./screens/Register')
}

export default function Shell({ hh, reload }: { hh: Household; reload: () => Promise<void> }) {
  // Los accesos directos de la app instalada abren con ?tab=add, ?tab=expenses, etc.
  // Aviso del banco con que otra app abrió Contigo (compartir en Android o una automatización)
  const [notice, setNotice] = useState<string | null>(() => readSharedNotice(location.search, location.hash))
  useEffect(() => {
    // El texto no se queda en la dirección ni en el historial del navegador
    if (notice) history.replaceState(null, '', '/?tab=add')
  }, [notice])
  // Un enlace con ?tab= que no existe (viejo o mal escrito) muestra «No encontramos esa página»
  const [notFound, setNotFound] = useState(() => {
    const t = new URLSearchParams(location.search).get('tab')
    return t !== null && !TABS.some((x) => x.key === t)
  })
  const [tab, setTab] = useState<Tab>(() => {
    if (readSharedNotice(location.search, location.hash)) return 'add'
    const t = new URLSearchParams(location.search).get('tab')
    return TABS.some((x) => x.key === t) ? (t as Tab) : 'home'
  })
  // De quién se ven los datos (hogar, yo o mi pareja): se mantiene al cambiar de pestaña
  const [scopeRaw, setScope] = useState<Scope>('all')
  // Categoría con la que se abre Gastos al tocarla en Inicio, y sección con la que se abre Mi perfil
  const [expCat, setExpCat] = useState<string | undefined>(undefined)
  const [profileOpen, setProfileOpen] = useState<'fin' | 'account'>('fin')
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
  const { toast, notify: setToast, dismiss: dismissToast, act: actToast } = useToasts()
  const data = useData(hh.household.id, hh.me.user_id, ym.y, ym.m, reload)

  // Captura de gastos: cola sin conexión, bandeja de detectados y enlace nido://gasto (una sola vía)
  const { config: capture, save: saveCapture } = useCaptureConfig()
  const queue = useExpenseQueue(hh.household.id, hh.me.user_id, data.refresh, setToast)
  const detected = useDetected({ hh, data, config: capture, queue, notify: setToast })
  // App Android: busca versión nueva al abrir (máx. 1 vez cada 12 h; sin molestar durante el arranque)
  useEffect(() => {
    const t = window.setTimeout(() => void checkUpdates(), 4000)
    return () => window.clearTimeout(t)
  }, [])
  // Primera vez en la app Android: una hoja corta para conectar los bancos (sin insistir si dice «Ahora no»)
  const [askBanks, setAskBanks] = useState(false)
  useEffect(() => {
    if (!isNativeApp() || !shouldAskConsent(readConsent())) return
    const t = window.setTimeout(() => setAskBanks(true), 7000)
    return () => window.clearTimeout(t)
  }, [])
  useAutoSync({ userId: hh.me.user_id, householdId: hh.household.id, shared: capture.shared, categories: data.categories, history: detected.ctx.history, ready: data.ready })
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [linkCandidate, setLinkCandidate] = useState<ParsedCandidate | null>(null)
  useDeepLink((url) => {
    const r = linkToDraft(url, new Date())
    if (r.ok) setLinkCandidate(r.candidate)
    else setToast(`Enlace no válido\n${r.reason}`, 'warn')
  })
  const draftOpts = useMemo(() => ({ paidBy: hh.me.user_id, shared: capture.shared, categories: data.categories, history: detected.ctx.history }), [hh.me.user_id, capture.shared, data.categories, detected.ctx.history])
  const reviewDraft = detected.drafts?.find((d) => d.kind === 'EXPENSE' && d.id === (reviewId ?? detected.openId))
  const review = useMemo(() => {
    if (!data.ready) return null
    if (reviewDraft) return { key: reviewDraft.id, nativeId: reviewDraft.id, expense: candidateToDraft(reviewDraft, draftOpts) }
    if (linkCandidate) return { key: 'link', nativeId: undefined, expense: candidateToDraft(linkCandidate, draftOpts) }
    return null
  }, [data.ready, reviewDraft, linkCandidate, draftOpts])
  const { clearOpen } = detected
  const closeReview = useCallback(() => {
    setReviewId(null)
    setLinkCandidate(null)
    clearOpen()
  }, [clearOpen])
  // «Atrás» en Confirmar gasto vuelve a la pantalla anterior; el borrador sigue en la bandeja (CA-11-4)
  const reviewing = review !== null
  useEffect(() => (reviewing ? registerOverlay(closeReview) : undefined), [reviewing, closeReview])
  const [leaveTo, setLeaveTo] = useState<string | null>(null)
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

  // Botón atrás de Android: cierra la ventana abierta, vuelve de pestaña o minimiza desde Inicio
  useBackButton(tab, (t) => setTab(t as Tab), setLeaveTo)
  const pull = usePullToRefresh(() => data.refresh(), data.ready && !locked)

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
    setNotice(null)
    const n = new Date()
    setYm({ y: n.getFullYear(), m: n.getMonth() })
    setTab('home')
  }

  let body
  if (notFound) {
    body = (
      <main className="screen center-y">
        <StatePage
          spec={errorScreen({ kind: 'NOT_FOUND' })}
          onPrimary={() => {
            history.replaceState(null, '', '/')
            setNotFound(false)
          }}
        />
      </main>
    )
  } else if (data.error) {
    body = (
      <main className="screen center-y">
        <ErrorPage
          status={data.errorStatus}
          onRetry={() => void data.refresh()}
          onExit={data.errorStatus === 401 || data.errorStatus === 403 ? () => void supabase.auth.signOut() : undefined}
          exitLabel="Cerrar sesión"
        />
      </main>
    )
  } else if (!data.ready) {
    body = (
      <SkeletonScreen />
    )
  } else if (review) {
    body = (
      <ConfirmExpense
        key={review.key}
        draft={review.expense}
        categories={data.categories}
        members={hh.members}
        onConfirm={async (f) => {
          await detected.save(f, review.nativeId)
          closeReview()
        }}
        onDiscard={closeReview}
      />
    )
  } else if (tab === 'inbox') {
    body = (
      <DetectedInbox
        drafts={detected.drafts}
        failed={detected.failed}
        categories={data.categories}
        history={detected.ctx.history}
        onReview={(d) => setReviewId(d.id)}
        onSaveWith={(d, categoryId) => detected.save({ ...candidateToDraft(d, draftOpts), category_id: categoryId }, d.id)}
        onIgnore={(d) => void detected.ignore(d)}
        onRetry={() => void detected.reload()}
        onSettings={() => setTab('security')}
        kept={detected.kept}
        appNames={detected.appNames}
        autoSaved={detected.autoSaved}
        onUndoAuto={(id) => void detected.undoAuto(id)}
        onKeepBoth={detected.keepBoth}
        debts={data.debts.filter((x) => !x.archived)}
        onSaveIncome={detected.saveIncome}
        onPayDebt={detected.saveDebtPayment}
        onGoMoney={() => setTab('money')}
      />
    )
  } else if (tab === 'home') {
    body = (
      <Home
        hh={hh} data={data} month={month} isCurrent={isCurrent} onMonth={shiftMonth} onGo={goTo} onSettings={() => setTab('security')}
        onCategory={(id) => {
          setExpCat(id)
          setTab('expenses')
        }}
        onProfile={() => {
          setProfileOpen('account')
          setTab('profile')
        }}
        onToast={setToast}
        scope={scope}
        onScope={setScope}
        detected={detected.drafts?.length ?? 0}
        onInbox={() => setTab('inbox')}
      />
    )
  } else if (tab === 'expenses') {
    body = <Expenses hh={hh} data={data} month={month} onToast={setToast} scope={scope} onScope={setScope} onRegister={() => setTab('add')} initialCategory={expCat} />
  } else if (tab === 'add') {
    body = <Register hh={hh} data={data} onSaved={backToNow} onToast={setToast} notice={notice} queue={queue} />
  } else if (tab === 'money') {
    body = <Money key={moneyNav.n} hh={hh} data={data} month={month} onToast={setToast} section={moneyNav.section} scope={scope} onScope={setScope} />
  } else if (tab === 'goals') {
    body = <Goals hh={hh} data={data} onToast={setToast} scope={scope} onScope={setScope} />
  } else if (tab === 'profile') {
    body = <Profile hh={hh} data={data} month={month} reload={reload} onToast={setToast} onGoSalary={() => goTo('money', 'salary')} onBack={() => setTab('security')} initialOpen={profileOpen} />
  } else if (tab === 'help') {
    body = <Help onBack={() => setTab('security')} />
  } else {
    body = <Security hh={hh} reload={reload} onToast={setToast} onHelp={() => setTab('help')} capture={capture} onCapture={saveCapture} onCleared={() => void detected.reload()} onSendNow={detected.sendNow} onProfile={() => {
      setProfileOpen('fin')
      setTab('profile')
    }} />
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
      <UnsentBanner count={detected.unsent.count} onSend={detected.sendNow} />
      <Suspense
        fallback={<SkeletonScreen />}
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
            onClick={() => {
              setExpCat(undefined)
              setNotice(null)
              setTab(t.key)
            }}
          >
            {t.key === 'add' ? (
              <span className="plus">
                <Icon name={t.icon} />
              </span>
            ) : (
              <Icon name={t.icon} />
            )}
            <span>{t.label}</span>
            {t.key === 'home' && (detected.drafts?.length ?? 0) > 0 && (
              <span className="badge">
                {detected.drafts?.length}
                <span className="sr-only"> movimientos detectados</span>
              </span>
            )}
          </button>
        ))}
      </nav>
      {tour && data.ready && (
        <Suspense fallback={null}>
          <Tour kind={tour} onClose={closeTour} />
        </Suspense>
      )}
      {leaveTo !== null && (
        <ConfirmLeave
          onStay={() => setLeaveTo(null)}
          onLeave={() => {
            setTab(leaveTo as Tab)
            setLeaveTo(null)
          }}
        />
      )}
      <InstallBanner onToast={setToast} />
      <UpdateBanner />
      <NativeUpdateSheet />
      {askBanks && <BankConsentSheet config={capture} onConfig={saveCapture} onToast={setToast} onClose={() => setAskBanks(false)} />}
      {toast && <Toast key={`${toast.id}-${toast.expiresAt}`} toast={toast} onDismiss={dismissToast} onAction={actToast} />}
      <PullIndicator view={pull.view} refreshing={pull.refreshing} />
    </div>
  )
}