import { useMemo } from 'react'
import type { Debt, DebtPayment } from '../lib/data'
import { analyzeDebts } from '../lib/debtAnalysis'
import type { Strategy } from '../lib/debtAnalysis'
import { money } from '../lib/format'
import { Bars } from './Charts'
import FindingList from './FindingList'

const meses = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`
const when = (d: number) => (d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`)

function Row({ label, hint, s, tag, best }: { label: string; hint: string; s: Strategy | null; tag?: string; best?: boolean }) {
  return (
    <div className={best ? 'strat best' : 'strat'}>
      <div className="grow">
        <div className="strong">
          {label} {tag && <span className="pill">{tag}</span>}
        </div>
        <div className="muted small-text">{hint}</div>
      </div>
      <div className="strat-nums">
        <span className="num strong">{s ? meses(s.months) : 'Nunca'}</span>
        <span className="muted small-text num">{s ? `${money(s.interest)} de interés` : 'no baja'}</span>
      </div>
    </div>
  )
}

/** Análisis inteligente de las deudas: qué orden de pago ahorra más, qué pasa con un extra y qué tan al día van los pagos. */
/** `findings` es solo "Lo que dice el análisis" (a todo el ancho); `rest` son las demás tarjetas */
export default function DebtInsights({ debts, payments, part = 'rest' }: { debts: Debt[]; payments: DebtPayment[]; part?: 'findings' | 'rest' }) {
  const r = useMemo(() => analyzeDebts(debts, payments), [debts, payments])
  const { plan, extras, payments: p, costs, findings } = r
  if (costs.length === 0 && p.count === 0) return null
  const months = p.byMonth.map((m, i) => ({ key: m.key, label: m.label, amount: m.amount, current: i === p.byMonth.length - 1 }))

  if (part === 'findings') {
    return findings.length > 0 ? (
      <section className="card wide" aria-label="Análisis de tus deudas">
        <strong>Lo que dice el análisis</strong>
        <FindingList list={findings.slice(0, 6)} />
        <span className="muted small-text">Se calcula solo con tus deudas y tus pagos. Son orientaciones, no asesoría financiera.</span>
      </section>
    ) : null
  }

  return (
    <>

      {plan && (
        <section className="card" aria-label="Estrategia de pago">
          <strong>¿En qué orden conviene pagar?</strong>
          <span className="muted small-text">
            Simulé mes a mes con lo que hoy destinan a cuotas ({money(plan.budget)} al mes). La diferencia está en qué hacen con la cuota de una deuda cuando
            termina de pagarse.
          </span>
          <Row label="Como hoy" hint="Cada deuda con su cuota; lo que se libera no se reasigna" s={plan.current} />
          <Row
            label="Mayor interés primero"
            hint="La cuota liberada pasa a la deuda que más cobra (avalancha)"
            s={plan.avalanche}
            tag={plan.best !== 'snowball' && costs.length > 1 ? 'Recomendada' : undefined}
            best={plan.best !== 'snowball' && costs.length > 1}
          />
          <Row
            label="Menor saldo primero"
            hint="Cierran deudas chicas rápido, que motiva (bola de nieve)"
            s={plan.snowball}
            tag={plan.best === 'snowball' ? 'Recomendada' : undefined}
            best={plan.best === 'snowball'}
          />
          {costs.length > 1 && (
            <span className="small-text">
              Orden sugerido: {plan.order.map((n, i) => `${i + 1}. ${n}`).join(' → ')}.
              {plan.interestSaved > 0 && ` Frente a seguir como hoy, ahorran ${money(plan.interestSaved)} de interés${plan.monthsSaved > 0 ? ` y terminan ${meses(plan.monthsSaved)} antes` : ''}.`}
            </span>
          )}
        </section>
      )}

      {extras.length > 0 && (
        <section className="card" aria-label="Pagar de más">
          <strong>¿Y si pagan un poco más cada mes?</strong>
          <span className="muted small-text">El extra se aplica a la deuda que más interés cobra.</span>
          <div className="tiles">
            {extras.map((e) => (
              <div className="tile" key={e.extra}>
                <span className="muted small-text">+ {money(e.extra)} al mes</span>
                <span className="amount-sm num">{meses(e.months)}</span>
                <span className="line-help">{e.monthsSaved > 0 ? `${meses(e.monthsSaved)} antes y ${money(e.interestSaved)} menos de interés` : 'Sin cambio'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {costs.length > 0 && (
        <section className="card" aria-label="Costo de cada deuda">
          <strong>Cuánto cuesta cada deuda</strong>
          <span className="muted small-text">De la más cara de mantener a la más barata.</span>
          <div className="legend">
            {costs.map((c) => (
              <div className="legend-item" key={c.id}>
                <div className="grow">
                  <div className="ellipsis strong">{c.name}</div>
                  <div className="muted small-text">
                    Debes {money(c.remaining)} · {c.rate.toString().replace('.', ',')} % al mes
                  </div>
                </div>
                <div className="strat-nums">
                  <span className="num strong">{money(c.monthlyInterest)}/mes</span>
                  <span className={c.totalInterest === null ? 'over small-text' : 'muted small-text num'}>
                    {c.totalInterest === null ? 'no baja' : `${money(c.totalInterest)} en total`}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <span className="muted small-text">Es el interés que se va solo por tener la deuda. Mientras más alto, más conviene pagarla primero.</span>
        </section>
      )}

      {p.count > 0 && (
        <section className="card" aria-label="Historial de pagos">
          <strong>Cómo van los pagos</strong>
          <div className="tiles">
            <div className="tile">
              <span className="muted small-text">Pagado en total</span>
              <span className="amount-sm num">{money(p.total)}</span>
              <span className="line-help">{p.count} {p.count === 1 ? 'pago' : 'pagos'}</span>
            </div>
            <div className="tile">
              <span className="muted small-text">Cuotas de este mes</span>
              <span className="amount-sm num">{p.compliancePct === null ? '—' : `${p.compliancePct} %`}</span>
              <span className="line-help">{money(p.paidThisMonth)} de {money(p.expected)}</span>
            </div>
            <div className="tile">
              <span className="muted small-text">Racha</span>
              <span className="amount-sm num">{meses(p.streak)}</span>
              <span className="line-help">seguidos con pagos</span>
            </div>
            <div className="tile">
              <span className="muted small-text">Último pago</span>
              <span className="amount-sm num">{p.lastPaidDays === null ? '—' : p.lastPaidDays === 0 ? 'Hoy' : `Hace ${p.lastPaidDays} d`}</span>
            </div>
          </div>
          <Bars months={months} avg={null} />
          <span className="muted small-text">Lo pagado en los últimos 6 meses.</span>
        </section>
      )}

      {p.due.length > 0 && (
        <section className="card" aria-label="Próximas cuotas">
          <strong>Próximas cuotas</strong>
          <div className="legend">
            {p.due.map((d) => (
              <div className="legend-item" key={d.id}>
                <span className={d.late ? 'delta up' : d.paid ? 'delta down' : 'delta'} aria-hidden="true">{d.late ? '!' : d.paid ? '✓' : '•'}</span>
                <div className="grow">
                  <div className="ellipsis strong">{d.name}</div>
                  <div className={d.late ? 'over small-text' : 'muted small-text'}>
                    {d.paid ? 'Pagada este mes' : d.late ? 'Atrasada: venció y falta pagar' : `Vence ${when(d.daysToDue)}`}
                  </div>
                </div>
                <span className={d.late ? 'num strong over' : 'num strong'}>{d.paid ? '—' : money(d.pending)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
