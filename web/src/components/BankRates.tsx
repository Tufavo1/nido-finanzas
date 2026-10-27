import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Debt, DebtPayment } from '../lib/data'
import { PRODUCTS } from '../lib/bankData'
import type { RateEntry, RateProduct } from '../lib/bankData'
import { compareDebt, monthlyRange, offersFor, productForDebt } from '../lib/bankRates'
import type { BankOffer, DebtComparison } from '../lib/bankRates'
import { debtView } from '../lib/finance'
import { money } from '../lib/format'
import Icon from './Icon'

const pct = (n: number) => `${n.toFixed(2).replace('.', ',')} %`

const VERDICT: Record<DebtComparison['verdict'], { level: 'ok' | 'warn' | 'bad'; mark: string; short: string; text: string }> = {
  bajo: { level: 'ok', mark: '✓', short: 'Estás pagando poco', text: 'Tu tasa es igual o más baja que la mejor que publican estos bancos.' },
  dentro: { level: 'warn', mark: '!', short: 'Hay tasas más bajas', text: 'Algunos bancos publican una tasa menor a la tuya.' },
  sobre: { level: 'bad', mark: '✕', short: 'Tasa muy alta', text: 'Tu tasa es más alta que el máximo que publica cualquiera de estos dos bancos.' },
}

/** Un bloque que se abre y se cierra, para no llenar la pantalla de números */
function Fold({ head, sub, mark, level, children }: { head: ReactNode; sub?: ReactNode; mark?: string; level?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={open ? 'fold open' : 'fold'}>
      <button type="button" className="fold-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {mark && (
          <span className={`find ${level ?? ''}`} aria-hidden="true">
            <span className="find-mark">{mark}</span>
          </span>
        )}
        <span className="fold-title">
          <strong>{head}</strong>
          {sub && <span className="muted small-text">{sub}</span>}
        </span>
        <span className="set-chev" aria-hidden="true">
          <Icon name="chevD" size={18} />
        </span>
      </button>
      {open && <div className="fold-body">{children}</div>}
    </div>
  )
}

/** «Entre 1,63 % y 3,42 % al mes», «Máximo 40,80 % al año (unos 3,40 % al mes)» */
function entryText(e: RateEntry): string {
  const unit = e.unit === 'anual' ? 'al año' : 'al mes'
  const uf = e.uf ? ', más la variación de la UF' : ''
  const m = monthlyRange(e)
  const aprox = e.unit === 'anual' && !e.uf ? ` (unos ${pct(m.max)} al mes)` : ''
  if (e.min !== undefined) return `Entre ${pct(e.min)} y ${pct(e.max)} ${unit}${uf}`
  return `${e.cap ? 'Tope de' : 'Máximo'} ${pct(e.max)} ${unit}${uf}${aprox}`
}

function summary(o: BankOffer): string {
  return o.range.min !== null ? `Desde ${pct(o.range.min)} al mes` : `Hasta ${pct(o.range.max)} al mes`
}

function vigenciaText(o: BankOffer, product: RateProduct): string {
  const v = o.bank.vigencia[product]
  if (o.freshness === 'sin-fecha' || !v) return 'El documento del banco no trae fecha, así que conviene confirmar estas tasas con ellos.'
  const d = new Date(`${v}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  return o.freshness === 'viejo' ? `Estas tasas son del ${d} y pueden haber cambiado. Confírmalas con el banco.` : `Tasas vigentes desde el ${d}.`
}

/** Las tasas que publican los bancos y cómo se compara cada deuda con ellas. Todo es desplegable. */
export default function BankRates({ debts, payments }: { debts: Debt[]; payments: DebtPayment[] }) {
  const now = useMemo(() => new Date(), [])
  const [open, setOpen] = useState(false)
  const mine = useMemo(
    () =>
      debts
        .map((d) => ({ d, v: debtView(d, payments, now), product: productForDebt(d) }))
        .filter((x) => x.v.remaining > 0 && x.product !== null)
        .map(({ d, v, product }) => ({ d, v, comparison: compareDebt({ product: product!, rate: d.monthly_rate, amount: v.remaining, payment: d.monthly_payment, now }) }))
        .filter((x): x is typeof x & { comparison: DebtComparison } => x.comparison !== null),
    [debts, payments, now],
  )
  const [product, setProduct] = useState<RateProduct>(mine[0]?.comparison.product ?? 'consumo')
  const offers = offersFor(product, undefined, now)
  const meta = PRODUCTS.find((p) => p.key === product)
  const costly = mine.filter((x) => x.comparison.verdict !== 'bajo').length

  return (
    <section className={open ? 'card explain help open' : 'card explain help'}>
      <button type="button" className="help-head" aria-expanded={open} aria-controls="bank-rates" onClick={() => setOpen((o) => !o)}>
        <span className="help-mark" aria-hidden="true">
          <Icon name="wallet" size={18} />
        </span>
        <span className="help-title">
          <strong>Tasas de los bancos</strong>
          <span className="muted small-text">
            {open
              ? 'Toca para ocultar'
              : costly > 0
                ? `Hay ${costly} ${costly === 1 ? 'deuda que podría estar más cara' : 'deudas que podrían estar más caras'} que en los bancos`
                : 'Mira cuánto cobran Falabella y Santander'}
          </span>
        </span>
        <span className="set-chev" aria-hidden="true">
          <Icon name="chevD" size={20} />
        </span>
      </button>

      {open && (
        <div className="help-body" id="bank-rates">
          <p className="help-text">
            Estas son las tasas que Banco Falabella y Banco Santander publican en sus tarifarios oficiales. Sirven para ver si lo que pagas está caro o si te conviene mirar otro banco.
          </p>

          {mine.length > 0 && (
            <div className="stack tight">
              <strong className="help-sub">Tus deudas</strong>
              {mine.map(({ d, v, comparison: c }) => {
                const vd = VERDICT[c.verdict]
                const tipo = PRODUCTS.find((p) => p.key === c.product)?.plural ?? ''
                return (
                  <Fold key={d.id} head={d.name} sub={`Pagas ${pct(d.monthly_rate)} al mes. ${vd.short}.`} mark={vd.mark} level={vd.level}>
                    <p>{vd.text}</p>
                    <span className="muted small-text">
                      Así están las tasas de {tipo} para un saldo de {money(v.remaining)}.
                    </span>
                    {c.offers.map((o) => (
                      <div className="row between" key={o.bank.id}>
                        <span>{o.bank.name}</span>
                        <span className="num strong">{summary(o)}</span>
                      </div>
                    ))}
                    {c.saving && c.lowest && (
                      <p>
                        Si pagaras la misma cuota con la tasa más baja ({c.lowest.bank.name}, {pct(c.lowest.rate)}), ahorrarías unos {money(c.saving.interest)} en intereses
                        {c.saving.months > 0 ? ` y terminarías ${c.saving.months} ${c.saving.months === 1 ? 'mes' : 'meses'} antes` : ''}. Eso sí, antes de cambiarte hay que sumar lo que cuesta prepagar la deuda actual.
                      </p>
                    )}
                    <span className="line-help">Las tasas más bajas se dan a clientes con buen historial, así que la que te ofrezcan a ti puede ser distinta.</span>
                  </Fold>
                )
              })}
            </div>
          )}

          <div className="stack tight">
            <strong className="help-sub">Tasas por tipo de deuda</strong>
            <div className="chips" role="group" aria-label="Tipo de deuda">
              {PRODUCTS.map((p) => (
                <button key={p.key} type="button" className="chip" aria-pressed={product === p.key} onClick={() => setProduct(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
            {meta && <span className="muted small-text">{meta.help}</span>}

            {offers.length === 0 ? (
              <span className="muted small-text">Todavía no tenemos tasas para este tipo de deuda.</span>
            ) : (
              offers.map((o) => {
                const notes = [...new Set(o.entries.map((e) => e.note).filter(Boolean))]
                return (
                  <Fold key={`${o.bank.id}-${product}`} head={o.bank.name} sub={summary(o)}>
                    {o.entries.map((e) => (
                      <div className="stack tight" key={e.label}>
                        <span className="muted small-text">{e.label}</span>
                        <span className="num strong">{entryText(e)}</span>
                      </div>
                    ))}
                    {notes.map((n) => (
                      <span className="line-help" key={n}>
                        {n}
                      </span>
                    ))}
                    {o.bank.extras
                      .filter((x) => x.product === product)
                      .map((x) => (
                        <p key={x.text}>{x.text}</p>
                      ))}
                    <span className={o.freshness === 'vigente' ? 'line-help' : 'hint'}>{vigenciaText(o, product)}</span>
                  </Fold>
                )
              })
            )}
          </div>

          <span className="line-help">{offers[0]?.bank.extras.find((x) => x.product === 'general')?.text}</span>
          <span className="line-help">
            Estas tasas son de referencia y salen de los documentos de cada banco, no son una oferta. Cuando una tasa viene por año, la pasamos a mes dividiéndola en 12. Para comparar de verdad, mira también el CAE y confirma siempre con el banco.
          </span>
        </div>
      )}
    </section>
  )
}
