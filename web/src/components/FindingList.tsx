import type { Finding } from '../lib/finance'
import { Rich } from '../lib/rich'

const MARK = { ok: '✓', warn: '!', bad: '✕' } as const
const WORD = { ok: 'Bien', warn: 'Ojo', bad: 'Urgente' } as const

/** Lista de conclusiones con su ícono de color; el texto admite **negrita**. */
export default function FindingList({ list }: { list: Finding[] }) {
  return (
    <div className="stack tight">
      {list.map((f, i) => (
        <div className={`find ${f.level}`} key={`${f.title}-${i}`}>
          <span className="find-mark" aria-label={WORD[f.level]}>
            {MARK[f.level]}
          </span>
          <div className="grow">
            <div className="strong"><Rich text={f.title} /></div>
            <div className="muted small-text"><Rich text={f.detail} /></div>
          </div>
        </div>
      ))}
    </div>
  )
}
