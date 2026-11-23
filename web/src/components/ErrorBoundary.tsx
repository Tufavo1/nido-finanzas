import { Component } from 'react'
import type { ReactNode } from 'react'
import StatePage from './StatePage'
import { errorScreen } from '../lib/screenState'
import { logError } from '../lib/safeLog'

/** Cuántas veces se deja «Reintentar» sin recargar: si el error vuelve, es mejor empezar de cero */
export const MAX_SOFT_RETRIES = 2

interface State {
  failed: boolean
  retries: number
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, retries: 0 }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    logError(error, 'ErrorBoundary')
  }

  private retry = () => {
    if (this.state.retries >= MAX_SOFT_RETRIES) {
      location.reload()
      return
    }
    this.setState((s) => ({ failed: false, retries: s.retries + 1 }))
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <StatePage spec={errorScreen({ kind: 'UNKNOWN' })} onPrimary={this.retry} secondary={{ label: 'Recargar la app', onClick: () => location.reload() }} />
  }
}
