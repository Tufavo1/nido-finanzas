// Copyright (c) 2026 Dinovance
import Modal from './Modal'

const POINTS = [
  'Lee solo los avisos de gasto de las apps de tus bancos.',
  'Nunca lee claves, códigos ni mensajes personales.',
  'El texto del aviso se queda en tu teléfono.',
  'Puedes pausarlo, deshacer cada gasto o borrar todo cuando quieras.',
]

/** «Ver qué hace la app»: cuatro puntos, sin tecnicismos */
export default function BankTrustSheet({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} label="Qué hace la app">
      <div className="stack picker">
        <h2 className="perm-title">Qué hace la app</h2>
        <ul className="perm-points">
          {POINTS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <button type="button" className="btn" onClick={onClose}>
          Entendido
        </button>
      </div>
    </Modal>
  )
}
