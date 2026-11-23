// Copyright (c) 2026 Dinovance
import Modal from './Modal'

/** «¿Salir sin guardar?»: aparece con el botón atrás de Android cuando hay cambios sin guardar (RF-11). */
export default function ConfirmLeave({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <Modal onClose={onStay} label="Salir sin guardar">
      <div className="stack picker">
        <h2 className="perm-title">¿Salir sin guardar?</h2>
        <p className="muted">Lo que escribiste se va a perder.</p>
        <button type="button" className="btn" onClick={onStay}>
          Seguir aquí
        </button>
        <button type="button" className="btn danger" onClick={onLeave}>
          Salir sin guardar
        </button>
      </div>
    </Modal>
  )
}
