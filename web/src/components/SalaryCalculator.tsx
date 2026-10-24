import { useState } from 'react'
import { AFPS, CL, calcularLiquido } from '../lib/chile'
import type { AfpId, Contrato } from '../lib/chile'
import { money } from '../lib/format'
import { digitsOnly } from '../lib/ui'

const CONTRATOS: { key: Contrato; label: string }[] = [
  { key: 'indefinido', label: 'Indefinido' },
  { key: 'plazo_fijo', label: 'Plazo fijo' },
  { key: 'honorarios', label: 'Honorarios' },
]

/** De sueldo bruto a líquido con los descuentos de Chile. Solo calcula: guardar el sueldo lo hace el formulario de arriba. */
export default function SalaryCalculator({ onUse }: { onUse: (liquido: number) => void }) {
  const [open, setOpen] = useState(false)
  const [bruto, setBruto] = useState('')
  const [contrato, setContrato] = useState<Contrato>('indefinido')
  const [afp, setAfp] = useState<AfpId>('uno')

  if (!open) {
    return (
      <section className="card">
        <strong>¿Solo sabes tu sueldo bruto?</strong>
        <span className="muted">Calcula cuánto te llega a la cuenta después de AFP, salud e impuesto.</span>
        <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
          Calcular mi sueldo líquido
        </button>
      </section>
    )
  }

  const n = Number(bruto)
  const r = n > 0 ? calcularLiquido({ bruto: n, contrato, afp }) : null

  return (
    <section className="card" aria-label="Calculadora de sueldo líquido">
      <div className="row between">
        <strong>De sueldo bruto a líquido</strong>
        <button type="button" className="link-btn" onClick={() => setOpen(false)}>
          Cerrar
        </button>
      </div>
      <div className="field">
        <label htmlFor="bruto">Sueldo bruto mensual</label>
        <span className="line-help">Lo que dice tu contrato antes de descuentos. Sin bonos ni horas extra.</span>
        <input id="bruto" className="input" inputMode="numeric" autoComplete="off" placeholder="Ej. 1200000" value={bruto} onChange={(e) => setBruto(digitsOnly(e.target.value))} />
      </div>
      <div className="field">
        <span className="label-text" id="contrato-label">
          Tipo de contrato
        </span>
        <div className="chips" role="group" aria-labelledby="contrato-label">
          {CONTRATOS.map((c) => (
            <button key={c.key} type="button" className="chip" aria-pressed={contrato === c.key} onClick={() => setContrato(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {contrato !== 'honorarios' && (
        <div className="field">
          <label htmlFor="afp">Tu AFP</label>
          <select id="afp" className="input" value={afp} onChange={(e) => setAfp(e.target.value as AfpId)}>
            {AFPS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} (comisión {String(a.comision).replace('.', ',')} %)
              </option>
            ))}
          </select>
        </div>
      )}

      {r && (
        <div className="stack tight" role="status">
          <div className="row between">
            <span>Sueldo bruto</span>
            <span className="num">{money(r.bruto)}</span>
          </div>
          {r.descuentos.map((d) => (
            <div className="row between muted" key={d.key}>
              <span>{d.label}</span>
              <span className="num">− {money(d.monto)}</span>
            </div>
          ))}
          <div className="row between">
            <strong>Te llegan</strong>
            <span className="amount small num">{money(r.liquido)}</span>
          </div>
          <span className="muted small-text">Se descuenta el {String(r.descuentoPct).replace('.', ',')} % de tu sueldo bruto.</span>
          {r.sobreTope && (
            <span className="muted small-text">Tu sueldo pasa el tope imponible: la AFP y la salud se calculan solo hasta {money(Math.round(CL.topeAfpUf * CL.uf))}.</span>
          )}
          {contrato === 'honorarios' && (
            <span className="muted small-text">La retención se declara en abril: según tus gastos y cotizaciones puedes recuperar parte o tener que pagar más.</span>
          )}
          <button type="button" className="btn small" onClick={() => onUse(r.liquido)}>
            Usar {money(r.liquido)} como mi sueldo
          </button>
        </div>
      )}
      <span className="muted small-text">
        Valores de referencia de {CL.actualizado} (UTM {money(CL.utm)}, UF {money(CL.uf)}). Tu liquidación puede variar por gratificación, Isapre, APV o descuentos de tu empresa. Es una orientación, no reemplaza a un asesor.
      </span>
    </section>
  )
}
