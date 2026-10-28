import { Children, Fragment, cloneElement, isValidElement, useId, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import Icon from './Icon'
import SectionHead from './SectionHead'

/** Aplana los fragmentos para ver todas las piezas de la pantalla en una sola lista */
function flatten(children: ReactNode, prefix = ''): ReactNode[] {
  return Children.toArray(children).flatMap((c, i) => {
    const key = `${prefix}${i}`
    if (isValidElement(c) && c.type === Fragment) return flatten((c.props as { children?: ReactNode }).children, `${key}.`)
    return [isValidElement(c) ? cloneElement(c, { key: `${key}-${c.key ?? ''}` }) : c]
  })
}

interface Group {
  head: { title: string; hint?: string }
  items: ReactNode[]
}

function Collapsible({ group, defaultOpen }: { group: Group; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className={open ? 'coll open' : 'coll'}>
      <h2 className="coll-head">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span className="coll-title">
            <strong>{group.head.title}</strong>
            {group.head.hint && <span className="muted small-text">{group.head.hint}</span>}
          </span>
          <span className="set-chev" aria-hidden="true">
            <Icon name="chevD" size={20} />
          </span>
        </button>
      </h2>
      {open && (
        <div className="coll-body" id={id}>
          {group.items}
        </div>
      )}
    </section>
  )
}

/**
 * Convierte cada `SectionHead` y las piezas que le siguen en un desplegable.
 * Lo que va antes del primer encabezado queda siempre a la vista; el primer desplegable parte abierto
 * (`openFirst={false}` los deja todos cerrados).
 */
export default function Collapsibles({ children, openFirst = true }: { children: ReactNode; openFirst?: boolean }) {
  const lead: ReactNode[] = []
  const groups: Group[] = []
  for (const node of flatten(children)) {
    if (isValidElement(node) && node.type === SectionHead) {
      groups.push({ head: (node as ReactElement<{ title: string; hint?: string }>).props, items: [] })
    } else if (groups.length === 0) {
      lead.push(node)
    } else {
      groups[groups.length - 1].items.push(node)
    }
  }
  return (
    <>
      {lead}
      {groups
        .filter((g) => g.items.length > 0)
        .map((g, i) => (
          <Collapsible key={g.head.title} group={g} defaultOpen={openFirst && i === 0} />
        ))}
    </>
  )
}
