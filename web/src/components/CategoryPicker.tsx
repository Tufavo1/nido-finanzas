// Copyright (c) 2026 Dinovance
import Modal from './Modal'

interface Props {
  categories: { id: string; name: string }[]
  selected: string | null
  onPick: (id: string) => void
  onClose: () => void
}

/** Hoja inferior para elegir la categoría de un gasto. */
export default function CategoryPicker({ categories, selected, onPick, onClose }: Props) {
  return (
    <Modal onClose={onClose} label="Elige una categoría">
      <div className="stack picker">
        <h2 className="perm-title">Elige una categoría</h2>
        <div className="chips">
          {categories.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={c.id === selected} onClick={() => onPick(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  )
}
