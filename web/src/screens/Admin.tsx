import { useCallback, useEffect, useRef, useState } from 'react'
import { FREE_LIMITS, fetchAdminStats } from '../lib/admin'
import type { AdminStats } from '../lib/admin'

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

export default function Admin({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  const timer = useRef<number | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setStats(await fetchAdminStats())
    } catch (e) {
      console.error(e)
      setError('No se pudo cargar el panel. Revisa que la migración «panel_admin» esté aplicada.')
    } finally {
      setBusy(false)
      // Pausa entre consultas para no cargar la base del plan gratuito
      setWait(COOLDOWN_S)
    }
  }, [])

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
  return (
    <main className="screen plata">
      <button type="button" className="link-btn" onClick={onBack}>
        ← Volver a Ajustes
      </button>
      <h1 className="title">Panel de administración</h1>

      <section className="card explain">
        <strong>Cómo está funcionando la app</strong>
        <p>
          Solo números agregados: cuánta gente la usa y qué funciones se ocupan más. Nunca se muestran montos, nombres ni
          correos de nadie.
        </p>
        <div className="row between">
          <span className="muted small-text">
            {s ? `Actualizado ${new Date(s.generated_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : 'Cargando…'}
          </span>
          <button type="button" className="btn small" disabled={busy || wait > 0} onClick={() => void load()}>
            {busy ? 'Actualizando…' : wait > 0 ? `Espera ${wait} s` : 'Actualizar'}
          </button>
        </div>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {s && (
        <>
          <section className="card">
            <strong>Personas</strong>
            <div className="tiles">
              <Tile label="Usuarios registrados" value={nf.format(s.users.total)} help={`${nf.format(s.users.confirmed)} con correo confirmado`} />
              <Tile label="Nuevos en 7 días" value={nf.format(s.users.new_7d)} help={`${nf.format(s.users.new_30d)} en 30 días`} />
              <Tile label="Entraron hoy" value={nf.format(s.users.active_1d)} />
              <Tile label="Activos en 7 días" value={nf.format(s.users.active_7d)} help={`${nf.format(s.users.active_30d)} en 30 días`} />
            </div>
            {s.users.total > s.users.confirmed && (
              <span className="line-help">
                {nf.format(s.users.total - s.users.confirmed)} personas aún no confirman su correo: puede que el correo no les
                esté llegando.
              </span>
            )}
          </section>

          <section className="card">
            <strong>Hogares</strong>
            <div className="tiles">
              <Tile label="Hogares" value={nf.format(s.households.total)} />
              <Tile label="En pareja" value={nf.format(s.households.couples)} help="Con las dos personas dentro" />
              <Tile label="Esperando pareja" value={nf.format(s.households.solo)} help="Una sola persona" />
              <Tile label="Registraron gastos esta semana" value={nf.format(s.usage.users_with_expense_7d)} help="personas" />
            </div>
          </section>

          <section className="card">
            <strong>Qué se usa más</strong>
            <span className="muted small-text">Cuántos hogares o personas usan cada función.</span>
            <Bars
              rows={[...s.features].sort((a, b) => b.count - a.count).map((f) => ({ label: f.name, value: f.count }))}
              unit=""
            />
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
              Si algún indicador pasa del 80 % se pone rojo. Los correos de confirmación también tienen un tope por hora en el plan
              gratuito: con un servicio propio de correo (SMTP) ese tope sube.
            </span>
          </section>
        </>
      )}
    </main>
  )
}
