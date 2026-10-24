import { money } from '../lib/format'
import type { Upcoming, UpcomingEvent } from '../lib/upcoming'
import { longDate } from '../lib/ui'

const KIND: Record<UpcomingEvent['kind'], string> = { fijo: 'Gasto fijo', deuda: 'Cuota', sueldo: 'Entrada' }
const when = (d: number) => (d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`)

/** Calendario de los próximos 30 días: lo que hay que pagar, cuándo entra el sueldo y si el mes alcanza. */
export default function UpcomingCard({ u }: { u: Upcoming }) {
  if (u.events.length === 0 && u.endOfMonth === null) return null
  const end = u.endOfMonth
  return (
    <section className="card" aria-label="Pagos que vienen">
      <strong>Pagos que vienen</strong>
      <span className="muted small-text">Lo que vence en los próximos 30 días.</span>
      {end !== null && (
        <div className={`find ${end < 0 ? 'bad' : end < 50_000 ? 'warn' : 'ok'}`}>
          <span className="find-mark" aria-hidden="true">{end < 0 ? '✕' : end < 50_000 ? '!' : '✓'}</span>
          <div className="grow">
            <div className="strong">
              {end < 0 ? `A fin de mes te faltarían ${money(-end)}` : `A fin de mes te quedarían ${money(end)}`}
            </div>
            <div className="muted small-text">
              Después de pagar lo que falta de este mes y seguir gastando ~{money(u.variableDaily)} al día en lo variable.
            </div>
          </div>
        </div>
      )}
      {u.events.length > 0 && (
        <div className="legend">
          {u.events.map((e) => (
            <div className="legend-item" key={e.key}>
              <span className={e.kind === 'sueldo' ? 'delta down' : e.late ? 'delta up' : 'delta'} aria-hidden="true">
                {e.kind === 'sueldo' ? '▼' : e.late ? '!' : '•'}
              </span>
              <div className="grow">
                <div className="ellipsis strong">{e.name}</div>
                <div className={e.late ? 'over small-text' : 'muted small-text'}>
                  {e.late ? 'Atrasada, pagar hoy' : `${KIND[e.kind]} · ${longDate(e.date)} (${when(e.inDays)})`}
                </div>
              </div>
              <span className={e.kind === 'sueldo' ? 'num strong' : e.late ? 'num strong over' : 'num strong'}>
                {e.kind === 'sueldo' ? '+' : ''}{money(e.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
      {u.out30 > 0 && (
        <span className="small-text">
          En total salen <strong>{money(u.out30)}</strong>
          {u.heaviest && u.heaviest.names.length > 1 ? `; el ${longDate(u.heaviest.date)} se juntan ${u.heaviest.names.length} pagos por ${money(u.heaviest.total)}` : ''}.
        </span>
      )}
      <span className="muted small-text">Las cuotas ya están descontadas de «lo que te sobra»; aquí solo se restan los gastos fijos que aún no se anotan.</span>
    </section>
  )
}
