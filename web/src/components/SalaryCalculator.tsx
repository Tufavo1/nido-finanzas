import Icon from './Icon'
import Modal from './Modal'
import Spin from './Spin'
import { useState } from 'react'
import { AFPS, calcularLiquido } from '../lib/chile'
import type { AfpId, Contrato } from '../lib/chile'
import { money } from '../lib/format'
import { digitsOnly, dots } from '../lib/ui'

const CONTRATOS: { key: Contrato; label: string }[] = [
  { key: 'indefinido', label: 'Indefinido' },
  { key: 'plazo_fijo', label: 'Plazo fijo' },
  { key: 'honorarios', label: 'Honorarios' },
]

/** De sueldo bruto a líquido con los descuentos de Chile. Calcula y, al tocar «Usar», entrega el líquido a quien la usa para guardarlo como sueldo. */
export default function SalaryCalculator({ onUse, busy = false }: { onUse: (liquido: number) => void | boolean | Promise<boolean | void>; busy?: boolean }) {
  const [open, setOpen] = useState(false)
  const [bruto, setBruto] = useState('')
  const [contrato, setContrato] = useState<Contrato>('indefinido')
  const [afp, setAfp] = useState<AfpId>('uno')

  async function use(liquido: number) {
    if ((await onUse(liquido)) === false) return
    setBruto('')
    setContrato('indefinido')
    setAfp('uno')
    setOpen(false)
  }

  const n = Number(bruto)
  const r = n > 0 ? calcularLiquido({ bruto: n, contrato, afp }) : null

  return (
    <>
      <button type="button" className="fixed-card" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="fixed-top">
          <span className="grow fixed-name">
            <strong>¿Solo sabes tu sueldo bruto?</strong>
            <span className="muted small-text">Calcula cuánto te llega después de descuentos</span>
          </span>
        </span>
        <span className="card-cta" aria-hidden="true">
          Toca para calcularlo <Icon name="chevR" size={16} />
        </span>
      </button>
      {open && (
        <Modal label="Calculadora de sueldo líquido" onClose={() => setOpen(false)}>
          <div className="card cat-sheet">
            <div className="stack cat-detail">
      <div className="row between">
        <strong className="cat-title">De bruto a líquido</strong>
        <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>
          Cerrar
        </button>
      </div>
      <div className="field">
        <label htmlFor="bruto">Sueldo bruto (el de tu contrato)</label>
        <input id="bruto" className="input" inputMode="numeric" autoComplete="off" placeholder="Ej. 1200000" value={dots(bruto)} onChange={(e) => setBruto(digitsOnly(e.target.value))} />
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
          <label htmlFor="afp">AFP</label>
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
        <div className="stack calc-result" role="status">
          <div className="stack tight">
            <div className="row between">
              <span>Sueldo bruto</span>
              <span className="num strong">{money(r.bruto)}</span>
            </div>
            {r.descuentos.map((d) => (
              <div className="row between muted" key={d.key}>
                <span>{d.label}</span>
                <span className="num">− {money(d.monto)}</span>
              </div>
            ))}
          </div>
          <div className="stack tight">
            <span className="muted">Te llegan cada mes</span>
            <span className="cat-big num">{money(r.liquido)}</span>
            <span className="muted">Es un {String(r.descuentoPct).replace('.', ',')} % menos que tu bruto</span>
            {contrato === 'honorarios' && <span className="muted small-text">La retención se ajusta en abril: puedes recuperar o pagar más.</span>}
          </div>
          <button type="button" className="btn" disabled={busy} onClick={() => void use(r.liquido)}>
            {busy ? <Spin label="Guardando sueldo…" /> : `Usar ${money(r.liquido)} como mi sueldo`}
          </button>
        </div>
      )}
      <span className="muted small-text">Es una orientación: tu liquidación real puede variar.</span>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
