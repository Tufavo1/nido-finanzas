import { useId } from 'react'
import { money } from '../lib/format'
import { memberColor } from '../lib/ui'

interface Person {
  name: string
  color: string
  paid: number
}

/** Dos círculos que se encuentran: el tamaño de cada uno es lo que pagó esa persona; el cruce, lo compartido. */
export default function Venn({ people }: { people: [Person, Person] }) {
  const id = useId()
  const [a, b] = people
  const total = a.paid + b.paid
  const radius = (p: Person) => 20 + 28 * Math.sqrt(total > 0 ? p.paid / total : 0.5)
  const ra = radius(a)
  const rb = radius(b)
  const gap = (ra + rb) * 0.72
  const left = (200 - (ra + gap + rb)) / 2
  const cxa = left + ra
  const cxb = cxa + gap
  return (
    <div className="venn">
      <svg viewBox="0 0 200 100" role="img" aria-label={`${a.name} pagó ${money(a.paid)} y ${b.name} pagó ${money(b.paid)}`}>
        <defs>
          <clipPath id={`${id}-a`}>
            <circle cx={cxa} cy="50" r={ra} />
          </clipPath>
        </defs>
        <circle className="venn-a" cx={cxa} cy="50" r={ra} fill={memberColor(a)} />
        <circle className="venn-b" cx={cxb} cy="50" r={rb} fill={memberColor(b)} />
        <circle className="venn-x" cx={cxb} cy="50" r={rb} fill="var(--accent)" clipPath={`url(#${id}-a)`} />
      </svg>
      <div className="venn-legend">
        {[a, b].map((p) => (
          <div key={p.name} className="venn-who">
            <span className="venn-name">{p.name}</span>
            <span className="num strong">{money(p.paid)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
