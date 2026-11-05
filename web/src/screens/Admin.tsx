import ScreenLoader from '../components/ScreenLoader'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FREE_LIMITS, adminNotes, adminRates, deleteHouseholds, fetchAdminStats, fetchAdminStorage, fetchEmptyHouseholds, removeMember, useAdminStatus } from '../lib/admin'
import type { AdminHousehold, AdminStats, AdminStorage } from '../lib/admin'
import { TABLE_LABEL, fillForecast } from '../lib/storage'
import { supabase } from '../lib/supabase'
import { useToastError } from '../lib/useToastError'
import type { Notify } from '../components/Toast'

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'uso', label: 'Uso' },
  { key: 'sistema', label: 'Sistema' },
  { key: 'hogares', label: 'Hogares' },
] as const
type TabKey = (typeof TABS)[number]['key']

const nf = new Intl.NumberFormat('es-CL')
const COOLDOWN_S = 30

function mb(bytes: number): string {
  return `${nf.format(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`
}

function Tile({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="tile">
      <span className="muted small-text">{label}</span>
      <span className="amount-sm num">{value}</span>
      {help && <span className="line-help">{help}</span>}
    </div>
  )
}

function Limit({ label, used, max, text }: { label: string; used: number; max: number; text: string }) {
  const pct = Math.min(100, Math.round((used * 100) / max))
  const color = pct >= 80 ? 'var(--warn)' : pct >= 50 ? 'var(--amber)' : 'var(--accent)'
  return (
    <div className="stack tight">
      <div className="row between">
        <span>{label}</span>
        <span className="num strong">{pct} %</span>
      </div>
      <div className="bar big" role="img" aria-label={`${label}: ${pct} % del límite gratuito`}>
        <span style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="line-help">{text}</span>
    </div>
  )
}

function Rate({ label, pct, text }: { label: string; pct: number; text: string }) {
  return (
    <div className="stack tight">
      <div className="row between">
        <span>{label}</span>
        <span className="num strong">{pct} %</span>
      </div>
      <div className="bar big" role="img" aria-label={`${label}: ${pct} %`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="line-help">{text}</span>
    </div>
  )
}

/** Barras horizontales: una fila por elemento, el ancho es relativo al mayor */
function Bars({ rows, unit }: { rows: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track" aria-hidden="true">
            <span style={{ width: `${(r.value * 100) / max}%` }} />
          </span>
          <span className="num strong">
            {nf.format(r.value)} <span className="muted small-text">{unit}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function DayChart({ days, field, title }: { days: AdminStats['daily']; field: 'signups' | 'expenses'; title: string }) {
  const max = Math.max(1, ...days.map((d) => d[field]))
  const total = days.reduce((s, d) => s + d[field], 0)
  return (
    <div className="stack tight">
      <div className="row between">
        <strong>{title}</strong>
        <span className="muted small-text">{nf.format(total)} en 14 días</span>
      </div>
      <div className="daybars" role="img" aria-label={`${title}: ${days.map((d) => `${d.day.slice(8)}/${d.day.slice(5, 7)} ${d[field]}`).join(', ')}`}>
        {days.map((d) => (
          <span key={d.day} className="daybar" title={`${d.day.slice(8)}/${d.day.slice(5, 7)}: ${d[field]}`}>
            <span style={{ height: `${Math.max(d[field] > 0 ? 6 : 2, (d[field] * 100) / max)}%` }} />
          </span>
        ))}
      </div>
      <div className="row between muted small-text">
        <span>{days[0]?.day.slice(8)}/{days[0]?.day.slice(5, 7)}</span>
        <span>hoy</span>
      </div>
    </div>
  )
}

const dmy = (iso: string) => new Date(iso).toLocaleDateString('es-CL')
const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))

/** Todos los hogares (menos el tuyo): se listan solo cuando el administrador lo pide */
function Cleanup({ onChanged, onToast }: { onChanged: () => void; onToast: Notify }) {
  const [list, setList] = useState<AdminHousehold[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [kicking, setKicking] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)

  async function load() {
    setBusy(true)
    setError(null)
    setConfirm(false)
    try {
      setList(await fetchEmptyHouseholds())
      setPicked(new Set())
    } catch (e) {
      console.error(e)
      setError('No se pudo cargar la lista. Revisa que la migración panel_admin esté aplicada.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const r = await deleteHouseholds([...picked])
      onToast(`Hogares borrados\nSe borraron **${r.deleted}** ${r.deleted === 1 ? 'hogar' : 'hogares'}${r.skipped > 0 ? ` y ${r.skipped} se omitieron por estar en uso` : ''}.`, 'info')
      onChanged()
      setList(await fetchEmptyHouseholds())
      setPicked(new Set())
      setConfirm(false)
    } catch (e) {
      console.error(e)
      setError('No se pudo borrar. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const [query, setQuery] = useState('')
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = norm(query.trim())
  const shown = (list ?? []).filter((h) => !q || norm(h.name).includes(q) || h.code.startsWith(q) || h.members.some((m) => norm(m.name).includes(q)))
  const deletable = shown.filter((h) => h.deletable)

  async function kick(householdId: string, ref: string) {
    setBusy(true)
    setError(null)
    try {
      const r = await removeMember(householdId, ref)
      onToast(r.household_deleted ? 'Hogar borrado\nEra la única persona.' : r.removed ? 'Persona sacada\nYa no está en el hogar.' : 'Sin cambios\nEsa persona ya no estaba en el hogar.', 'info')
      onChanged()
      setList(await fetchEmptyHouseholds())
      setPicked(new Set())
      setKicking(null)
    } catch (e) {
      console.error(e)
      setError('No se pudo sacar a la persona. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }
  const toggle = (id: string) => {
    setConfirm(false)
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <section className="card">
      <strong>Gestionar hogares</strong>
      <span className="muted small-text">
        Aquí están todos los hogares, menos el tuyo. Puedes sacar a una persona de su hogar o borrar hogares completos con sus gastos,
        metas y deudas. Las cuentas de correo no se borran.
      </span>
      {list === null ? (
        <button type="button" className="btn small" disabled={busy} onClick={() => void load()}>
          {busy ? 'Buscando…' : 'Ver hogares'}
        </button>
      ) : (
        <>
          {list.length === 0 && <p className="notice">No hay otros hogares.</p>}
          {list.length > 0 && (
            <>
              <div className="field">
                <label htmlFor="admin-search">Buscar por nombre del hogar o de una persona</label>
                <input id="admin-search" className="input" type="search" maxLength={60} autoComplete="off" value={query} onChange={(e) => {
                    // Al cambiar el filtro se limpia la elección: nunca se borra algo que ya no se ve en pantalla
                    setQuery(e.target.value)
                    setPicked(new Set())
                    setConfirm(false)
                  }}
                />
                <span className="hint" aria-live="polite">
                  {q ? `${shown.length} de ${list.length} hogares` : `${list.length} ${list.length === 1 ? 'hogar' : 'hogares'}`}
                </span>
              </div>
              <div className="fixed-actions">
                <button
                  type="button"
                  className="txt-btn"
                  onClick={() => {
                    setConfirm(false)
                    setPicked(new Set(deletable.map((h) => h.id)))
                  }}
                >
                  Elegir todos ({deletable.length})
                </button>
                <button type="button" className="txt-btn" onClick={() => setPicked(new Set())}>
                  Quitar la elección
                </button>
              </div>
              {shown.length === 0 && <p className="notice">Ningún hogar coincide con esa búsqueda.</p>}
              <ul className="clean-list">
                {shown.map((h) => (
                  <li key={h.id}>
                    <label className="clean-row">
                      <input type="checkbox" disabled={busy} checked={picked.has(h.id)} onChange={() => toggle(h.id)} />
                      <span className="grow">
                        <span className="strong">
                          {h.name} <span className="muted">· {h.code}</span>
                        </span>
                        <span className="line-help">
                          {h.active_members === 0 ? 'Sin personas' : h.active_members === 1 ? '1 persona' : `${h.active_members} personas`} ·{' '}
                          {nf.format(h.expenses)} gastos · creado el {dmy(h.created_at)} · último movimiento hace {daysAgo(h.last_activity)} días
                        </span>
                      </span>
                    </label>
                    {h.members.map((m, i) => (
                      <div key={m.ref} className="row between small-text">
                        <span>
                          {m.name || `Persona ${i + 1}`} <span className="muted">· desde {dmy(m.joined_at)}</span>
                        </span>
                        {kicking === m.ref ? (
                          <span className="row">
                            <button type="button" className="btn danger small" disabled={busy} onClick={() => void kick(h.id, m.ref)}>
                              Sí, sacar
                            </button>
                            <button type="button" className="btn ghost small" onClick={() => setKicking(null)}>
                              No
                            </button>
                          </span>
                        ) : (
                          <button type="button" className="txt-btn" disabled={busy} onClick={() => setKicking(m.ref)}>
                            Sacar
                          </button>
                        )}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
              {picked.size > 0 &&
                (confirm ? (
                  <div className="stack tight">
                    <p className="error" role="alert">
                      Vas a borrar {picked.size} {picked.size === 1 ? 'hogar' : 'hogares'} con todos sus datos. No se puede deshacer.
                    </p>
                    <div className="row">
                      <button type="button" className="btn danger small" disabled={busy} onClick={() => void remove()}>
                        {busy ? 'Borrando…' : 'Sí, borrar definitivamente'}
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => setConfirm(false)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn danger small" onClick={() => setConfirm(true)}>
                    Borrar {picked.size} {picked.size === 1 ? 'hogar elegido' : 'hogares elegidos'}
                  </button>
                ))}
            </>
          )}
          <button type="button" className="link-btn" disabled={busy} onClick={() => void load()}>
            Volver a buscar
          </button>
        </>
      )}
    </section>
  )
}

function AdminPanel({ onBack, onToast }: { onBack: () => void; onToast: Notify }) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [storage, setStorage] = useState<AdminStorage | null>(null)
  const setError = useToastError(onToast)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  const [tab, setTab] = useState<TabKey>('resumen')
  const timer = useRef<number | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [st, sg] = await Promise.all([fetchAdminStats(), fetchAdminStorage().catch(() => null)])
      setStats(st)
      setStorage(sg)
    } catch (e) {
      console.error(e)
      setError('No se pudo cargar el panel. Revisa que la migración panel_admin esté aplicada.')
    } finally {
      setBusy(false)
      // Pausa entre consultas para no cargar la base del plan gratuito
      setWait(COOLDOWN_S)
    }
  }, [setError])

  // Una sola consulta al abrir; después solo cuando tú lo pides
  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (wait <= 0) return
    timer.current = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [wait])

  const s = stats
  const rates = s ? adminRates(s) : null
  const notes = s ? adminNotes(s) : []
  const dbPct = s ? Math.min(100, Math.round((s.db_bytes * 100) / FREE_LIMITS.dbBytes)) : 0

  return (
    <main className="screen plata">
      <button type="button" className="link-btn" onClick={onBack}>
        ← Volver a Ajustes
      </button>
      <h1 className="title">Panel de administración</h1>

      <div className="row between">
        <span className="muted small-text">
          {s ? `Actualizado a las ${new Date(s.generated_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : 'Cargando…'}
        </span>
        <button type="button" className="btn small" disabled={busy || wait > 0} onClick={() => void load()}>
          {busy ? 'Actualizando…' : wait > 0 ? `Espera ${wait} s` : 'Actualizar'}
        </button>
      </div>

      <div className="seg" role="group" aria-label="Sección del panel">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>


      {s && rates && tab === 'resumen' && (
        <>
          <section className="card">
            <strong>{notes[0].level === 'ok' ? 'Todo en orden' : 'Lo que conviene mirar'}</strong>
            <ul className="adm-notes">
              {notes.map((n) => (
                <li key={n.title} className={`adm-note ${n.level}`}>
                  <span className="adm-dot" aria-hidden="true" />
                  <span>
                    <span className="strong">{n.title}</span>
                    <span className="line-help">{n.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <strong>La app de un vistazo</strong>
            <div className="tiles">
              <Tile label="Personas registradas" value={nf.format(s.users.total)} help={`${nf.format(s.users.new_7d)} nuevas esta semana`} />
              <Tile label="Entraron esta semana" value={nf.format(s.users.active_7d)} help={`${nf.format(s.users.active_1d)} hoy`} />
              <Tile label="Hogares" value={nf.format(s.households.total)} help={`${nf.format(s.households.couples)} en pareja`} />
              <Tile label="Gastos esta semana" value={nf.format(s.usage.expenses_7d)} help={`${nf.format(s.usage.expenses_total)} en total`} />
            </div>
          </section>

          <section className="card">
            <strong>Cómo les va</strong>
            <span className="muted small-text">Porcentajes para saber si la gente se queda y usa la app.</span>
            <Rate label="Siguen usando la app" pct={rates.stay} text="De todas las personas registradas, las que entraron en el último mes." />
            <Rate label="Anotan gastos" pct={rates.usesIt} text="De quienes entraron esta semana, las que registraron al menos un gasto." />
            <Rate label="Hogares completos" pct={rates.couples} text="Hogares donde ya están las dos personas." />
            <Rate label="Correos confirmados" pct={rates.confirmed} text="Personas que confirmaron su correo al registrarse." />
          </section>

          <section className="card">
            <strong>Espacio disponible</strong>
            <div className="bar big" role="img" aria-label={`${dbPct} % del espacio gratuito usado`}>
              <span style={{ width: `${dbPct}%`, background: dbPct >= 80 ? 'var(--warn)' : dbPct >= 50 ? 'var(--amber)' : 'var(--accent)' }} />
            </div>
            <span className="line-help">
              Usas {mb(s.db_bytes)} de {mb(FREE_LIMITS.dbBytes)} ({dbPct} %). Más detalle en la pestaña Sistema.
            </span>
          </section>
        </>
      )}

      {s && tab === 'uso' && (
        <>
          <section className="card">
            <strong>Personas</strong>
            <div className="tiles">
              <Tile label="Registradas" value={nf.format(s.users.total)} help={`${nf.format(s.users.confirmed)} con correo confirmado`} />
              <Tile label="Nuevas en 7 días" value={nf.format(s.users.new_7d)} help={`${nf.format(s.users.new_30d)} en 30 días`} />
              <Tile label="Entraron hoy" value={nf.format(s.users.active_1d)} />
              <Tile label="Activas en 7 días" value={nf.format(s.users.active_7d)} help={`${nf.format(s.users.active_30d)} en 30 días`} />
            </div>
          </section>

          <section className="card">
            <strong>Hogares</strong>
            <div className="tiles">
              <Tile label="Hogares" value={nf.format(s.households.total)} />
              <Tile label="En pareja" value={nf.format(s.households.couples)} help="Con las dos personas dentro" />
              <Tile label="Esperando pareja" value={nf.format(s.households.solo)} help="Una sola persona" />
              <Tile label="Anotaron gastos esta semana" value={nf.format(s.usage.users_with_expense_7d)} help="personas" />
            </div>
          </section>

          <section className="card">
            <DayChart days={s.daily} field="expenses" title="Gastos anotados por día" />
            <DayChart days={s.daily} field="signups" title="Cuentas nuevas por día" />
            <span className="line-help">
              Gastos en total: {nf.format(s.usage.expenses_total)} · últimos 7 días: {nf.format(s.usage.expenses_7d)} · últimos 30
              días: {nf.format(s.usage.expenses_30d)}
            </span>
          </section>

          <section className="card">
            <strong>Qué funciones se usan más</strong>
            <span className="muted small-text">Cuántos hogares o personas usan cada una.</span>
            <Bars
              rows={[...s.features].sort((a, b) => b.count - a.count).map((f) => ({ label: f.name, value: f.count }))}
              unit=""
            />
          </section>
        </>
      )}

      {s && tab === 'sistema' && (
        <>
          <section className="card">
            <strong>Plan gratuito: cuánto queda</strong>
            <Limit
              label="Espacio de la base de datos"
              used={s.db_bytes}
              max={FREE_LIMITS.dbBytes}
              text={`Usas ${mb(s.db_bytes)} de ${mb(FREE_LIMITS.dbBytes)}.`}
            />
            <Limit
              label="Usuarios activos al mes"
              used={s.users.active_30d}
              max={FREE_LIMITS.monthlyUsers}
              text={`${nf.format(s.users.active_30d)} de ${nf.format(FREE_LIMITS.monthlyUsers)} permitidos.`}
            />
            <span className="line-help">
              Si un indicador pasa del 80 % se pone rojo. Los correos de confirmación también tienen un tope por hora en el plan
              gratuito: con un servicio propio de correo (SMTP) ese tope sube.
            </span>
          </section>

          {storage ? (
            <section className="card">
              <strong>Dónde está el espacio</strong>
              <span className="muted small-text">
                Las tablas de la app ocupan {mb(storage.public_bytes)}. El resto de los {mb(storage.db_bytes)} son tablas internas de Supabase.
              </span>
              <Bars
                rows={storage.tables
                  .filter((t) => t.bytes > 0)
                  .slice(0, 6)
                  .map((t) => ({ label: TABLE_LABEL[t.name] ?? t.name, value: Math.round(t.bytes / 1024) }))}
                unit="KB"
              />
              <span className="line-help">{fillForecast(storage.db_bytes, FREE_LIMITS.dbBytes, storage.bytes_per_day).text}</span>
              <span className="line-help">
                La app cuida el espacio sola: borra cada día las invitaciones vencidas y nunca guarda copias de los datos en el navegador.
              </span>
            </section>
          ) : (
            <p className="muted small-text">No se pudo leer el detalle del espacio.</p>
          )}

          <section className="card explain">
            <strong>Privacidad</strong>
            <p>
              Las estadísticas son solo números agregados. En «Gestionar hogares» ves el nombre de cada hogar y el nombre con que cada
              persona aparece en él, nada más: nunca montos, deudas, sueldos ni correos. Cada vez que abres esa lista queda un registro, y
              entrar al panel exige un código de tu app de autenticación.
            </p>
          </section>
        </>
      )}

      {s && tab === 'hogares' && <Cleanup onChanged={() => void load()} onToast={onToast} />}
    </main>
  )
}

/** El panel exige un segundo factor (TOTP): si la sesión aún no lo verificó, se pide el código antes de mostrarlo */
function MfaStep({ onBack, onVerified, onToast }: { onBack: () => void; onVerified: () => void; onToast: Notify }) {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const setError = useToastError(onToast)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      setFactorId(data?.totp[0]?.id ?? null)
      setReady(true)
    })
  }, [])

  async function startEnroll() {
    setBusy(true)
    setError(null)
    // Un intento anterior pudo dejar factores sin verificar; chocan con el nombre del nuevo (422)
    const { data: list } = await supabase.auth.mfa.listFactors()
    for (const f of list?.all ?? []) {
      if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    setBusy(false)
    if (err || !data) {
      setError('No se pudo activar la verificación en dos pasos. Revisa que el TOTP esté habilitado en el proyecto.')
      return
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    const id = enroll?.id ?? factorId
    if (!id) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() })
    setBusy(false)
    if (err) {
      setError('El código no es correcto. Prueba con el que muestra ahora tu app de autenticación.')
      return
    }
    onVerified()
  }

  return (
    <main className="screen">
      <button type="button" className="link-btn" onClick={onBack}>
        ← Volver a Ajustes
      </button>
      <h1 className="title">Verificación en dos pasos</h1>
      <section className="card">
        <span className="muted small-text">El panel de administración pide un código de tu app de autenticación además de la contraseña.</span>
        {ready && !factorId && !enroll && (
          <button type="button" className="btn small" disabled={busy} onClick={() => void startEnroll()}>
            Activar la verificación
          </button>
        )}
        {enroll && (
          <>
            <img src={enroll.qr} alt="Código QR para tu app de autenticación" width={180} height={180} />
            <span className="line-help">Escanéalo con tu app de autenticación. Si no puedes, escribe esta clave: {enroll.secret}</span>
          </>
        )}
        {(factorId || enroll) && (
          <form className="stack" onSubmit={(e) => void verify(e)}>
            <div className="field">
              <label htmlFor="mfa-code">Código de 6 dígitos</label>
              <input
                id="mfa-code"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button type="submit" className="btn small" disabled={busy || code.length !== 6}>
              Verificar
            </button>
          </form>
        )}
      </section>
    </main>
  )
}

export default function Admin({ onBack, onToast }: { onBack: () => void; onToast: Notify }) {
  const { status, refresh } = useAdminStatus()
  if (status === 'ok') return <AdminPanel onBack={onBack} onToast={onToast} />
  if (status === 'needs_mfa') return <MfaStep onBack={onBack} onVerified={refresh} onToast={onToast} />
  return <ScreenLoader />
}
