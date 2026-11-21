import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import ActivityLoader from './components/ActivityLoader'
import { startInstallWatcher } from './lib/install'
import { startUpdateWatcher } from './lib/update'
import { applyTheme, watchSystemTheme } from './lib/theme'
import { hideSplash, setupNativeChrome } from './lib/nativeChrome'

startInstallWatcher()
applyTheme()
watchSystemTheme()
startUpdateWatcher()
setupNativeChrome()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <ActivityLoader />
    </ErrorBoundary>
  </StrictMode>,
)

// Ya hay algo que mostrar: se quita el splash nativo
hideSplash()
