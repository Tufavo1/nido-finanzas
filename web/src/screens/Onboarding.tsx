import { useState } from 'react'
import type { FormEvent } from 'react'
import DeleteAccountInline from '../components/DeleteAccountInline'
import { supabase } from '../lib/supabase'

export default function Onboarding({ onDone }: { onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [hhName, setHhName] = useState('Nuestro hogar')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res =
      mode === 'create'
        ? await supabase.rpc('create_household', { p_name: hhName.trim(), p_display_name: name.trim() })
        : await supabase.rpc('join_household', { p_code: code.trim().toUpperCase(), p_display_name: name.trim() })
    if (res.error) {
      setError(res.error.message)
    } else if (mode === 'join' && !res.data) {
      setError('Código inválido, vencido o ya utilizado. Pide uno nuevo a tu pareja.')
    } else {
      await onDone()
    }
    setBusy(false)
  }

  return (
    <div className="app">
      <main className="screen">
        <span className="eyebrow">Bienvenida</span>
        <h1 className="title">Armemos tu hogar</h1>
        <p className="muted">A solas o en pareja (máximo 2 personas). Cada hogar ve solo sus propios datos.</p>

        <div className="seg" role="group" aria-label="Elegir una opción">
          <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>
            Crear hogar
          </button>
          <button type="button" aria-pressed={mode === 'join'} onClick={() => setMode('join')}>
            Tengo un código
          </button>
        </div>

        <form className="stack" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="name">Tu nombre</label>
            <input
              id="name"
              className="input"
              required
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {mode === 'create' ? (
            <div className="field">
              <label htmlFor="hh">Nombre del hogar</label>
              <input
                id="hh"
                className="input"
                required
                maxLength={60}
                value={hhName}
                onChange={(e) => setHhName(e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="code">Código de invitación</label>
              <input
                id="code"
                className="input code-input"
                required
                maxLength={12}
                autoCapitalize="characters"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn" type="submit" disabled={busy}>
            {mode === 'create' ? 'Crear hogar' : 'Unirme'}
          </button>
        </form>

        <button className="btn ghost" type="button" onClick={() => void supabase.auth.signOut()}>
          Cerrar sesión
        </button>
        <DeleteAccountInline />
      </main>
    </div>
  )
}
