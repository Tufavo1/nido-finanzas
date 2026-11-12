import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Household } from '../App'
import type { HouseholdData } from '../lib/data'
import { EMPLOYMENT, adviceFor } from '../lib/profile'
import type { Employment } from '../lib/profile'
import { BIRTH_WHY, MIN_AGE, ageOn, birthError } from '../lib/birth'
import { toISO } from '../lib/format'
import { useToastError } from '../lib/useToastError'
import { supabase } from '../lib/supabase'
import type { Notify } from './Toast'
import Spin from './Spin'

interface Props {
  hh: Household
  data: HouseholdData
  reload: () => Promise<void>
  onToast: Notify
}

export default function ProfileCard({ hh, data, reload, onToast }: Props) {
  const mine = data.profiles.find((p) => p.user_id === hh.me.user_id)

  const [editing, setEditing] = useState(!mine)
  const [name, setName] = useState(hh.me.display_name)
  const [hhName, setHhName] = useState(hh.household.name)
  const [profession, setProfession] = useState(mine?.profession ?? '')
  const [employment, setEmployment] = useState<Employment>((mine?.employment as Employment) ?? 'dependiente')
  const [dependents, setDependents] = useState(mine?.dependents ?? 0)
  const [birth, setBirth] = useState(mine?.birth_date ?? '')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  const advice = adviceFor(editing ? { profession, employment, dependents, birth_date: birth || null } : mine)
  const today = new Date()
  /** La fecha más reciente que se puede elegir: hoy hace 18 años */
  const maxBirth = toISO(new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate()))
  const age = mine?.birth_date ? ageOn(mine.birth_date, today) : null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Tu nombre no puede quedar vacío')
    if (!hhName.trim()) return setError('El hogar necesita un nombre')
    const birthProblem = data.profileReady ? birthError(birth, new Date()) : null
    if (birthProblem) return setError(birthProblem)
    setBusy(true)
    setError(null)

    const results = await Promise.all([
      name.trim() !== hh.me.display_name
        ? supabase.from('members').update({ display_name: name.trim() }).eq('user_id', hh.me.user_id)
        : null,
      hhName.trim() !== hh.household.name
        ? supabase.from('households').update({ name: hhName.trim() }).eq('id', hh.household.id)
        : null,
      data.profileReady
        ? mine
          ? supabase
              .from('profiles')
              .update({ profession: profession.trim(), employment, dependents, birth_date: birth, updated_at: new Date().toISOString() })
              .eq('user_id', hh.me.user_id)
          : supabase.from('profiles').insert({
              user_id: hh.me.user_id,
              household_id: hh.household.id,
              profession: profession.trim(),
              employment,
              dependents,
              birth_date: birth,
            })
        : null,
    ])
    setBusy(false)
    const failed = results.find((r) => r?.error)
    if (failed?.error) {
      console.error(failed.error)
      setError('No se pudo guardar todo. Intenta de nuevo.')
      return
    }
    setEditing(false)
    onToast('Perfil guardado\nTus **recomendaciones** se ajustaron a tu perfil.')
    await reload()
    await data.refresh()
  }

  return (
    <section className="card">
      <div className="row between">
        <strong>Tu perfil</strong>
        {!editing && (
          <button type="button" className="btn ghost small" onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
      </div>

      {editing ? (
        <form className="stack tight" onSubmit={(e) => void save(e)}>
          <div className="field">
            <label htmlFor="p-name">Tu nombre</label>
            <input id="p-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="p-hh">Nombre del hogar</label>
            <input id="p-hh" className="input" maxLength={60} value={hhName} onChange={(e) => setHhName(e.target.value)} />
          </div>
          {data.profileReady ? (
            <>
              <div className="field">
                <label htmlFor="p-birth">Fecha de nacimiento</label>
                <input
                  id="p-birth"
                  className="input"
                  type="date"
                  required
                  autoComplete="bday"
                  min="1900-01-01"
                  max={maxBirth}
                  aria-describedby="p-birth-why"
                  value={birth}
                  onChange={(e) => setBirth(e.target.value)}
                />
                <span className="hint" id="p-birth-why">
                  {BIRTH_WHY}
                </span>
              </div>
              <div className="field">
                <label htmlFor="p-job">¿A qué te dedicas?</label>
                <input
                  id="p-job"
                  className="input"
                  maxLength={60}
                  placeholder="Ej. Enfermera, programador, vendedora…"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                />
              </div>
              <div className="field">
                <span className="hint">Tipo de trabajo</span>
                <div className="chips" role="group" aria-label="Tipo de trabajo">
                  {EMPLOYMENT.map((o) => (
                    <button key={o.key} type="button" className="chip" aria-pressed={employment === o.key} onClick={() => setEmployment(o.key)}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <span className="hint">{EMPLOYMENT.find((o) => o.key === employment)?.hint}</span>
              </div>
              <div className="field">
                <span className="hint">Personas que dependen de ti (hijos, familiares)</span>
                <div className="stepper">
                  <button type="button" className="icon-btn" aria-label="Menos" onClick={() => setDependents((d) => Math.max(0, d - 1))}>
                    −
                  </button>
                  <span className="num strong" aria-live="polite">
                    {dependents}
                  </span>
                  <button type="button" className="icon-btn" aria-label="Más" onClick={() => setDependents((d) => Math.min(10, d + 1))}>
                    +
                  </button>
                </div>
              </div>
            </>
          ) : (
            <span className="muted small-text">
              Para guardar profesión falta aplicar la migración <strong>20261018060000_perfil_edicion</strong>.
            </span>
          )}
          <div className="row">
            <button className="btn small" type="submit" disabled={busy}>
              {busy ? <Spin label="Guardando…" /> : 'Guardar'}
            </button>
            {mine && (
              <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <div>
            <div className="strong">{hh.me.display_name}</div>
            <div className="muted small-text">
              {mine?.profession || 'Sin profesión'} · {EMPLOYMENT.find((o) => o.key === mine?.employment)?.label ?? ''}
              {mine && mine.dependents > 0 ? ` · ${mine.dependents} a cargo` : ''}
              {age !== null ? ` · ${age} años` : ''}
            </div>
          </div>
        </>
      )}

      <div className="stack tight">
        <strong>Para tu perfil{advice.groupLabel ? ` · ${advice.groupLabel}` : ''}</strong>
        <div className="row between muted small-text">
          <span>Ahorro para imprevistos sugerido</span>
          <span className="num">{advice.emergencyMonths} meses de gasto</span>
        </div>
        <div className="row between muted small-text">
          <span>Ahorro sugerido del sueldo</span>
          <span className="num">{advice.savingsTargetPct} %</span>
        </div>
        {advice.tips.map((t, i) => (
          <div className="find info" key={i}>
            <span className="find-mark">i</span>
            <span className="small-text">{t}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
