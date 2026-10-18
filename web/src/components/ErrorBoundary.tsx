import { Component } from 'react'
import type { ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="splash">
        <div className="logo" aria-hidden="true" />
        <h1 className="title">Algo se rompió</h1>
        <p className="muted">Tus datos están a salvo. Recarga para continuar.</p>
        <button className="btn" type="button" onClick={() => location.reload()}>
          Recargar
        </button>
      </div>
    )
  }
}
