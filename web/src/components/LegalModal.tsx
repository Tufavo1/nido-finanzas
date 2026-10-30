import Modal from './Modal'
import { LEGAL_DOCS } from '../lib/legal'

/** Muestra la política de privacidad o los términos en una ventana que se puede leer sin iniciar sesión */
export default function LegalModal({ doc, onClose }: { doc: keyof typeof LEGAL_DOCS; onClose: () => void }) {
  const d = LEGAL_DOCS[doc]
  return (
    <Modal label={d.title} onClose={onClose}>
      <article className="legal card">
        <h2 className="legal-title">{d.title}</h2>
        <p className="legal-intro">{d.intro}</p>
        {d.sections.map((s, i) => (
          <section key={s.title} className="legal-sec">
            <h3>
              {i + 1}. {s.title}
            </h3>
            {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
            {s.items && (
              <ul>
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <button type="button" className="btn" onClick={onClose}>
          Entendido
        </button>
      </article>
    </Modal>
  )
}
