interface Props {
  title: string
  text: string
  steps: string[]
  /** Con los pasos a la vista (primera vez) o plegados bajo «¿Cómo se usa?» */
  showSteps: boolean
}

/** Explica para qué sirve una pestaña de Plata y cómo se usa, en palabras simples. */
export default function Intro({ title, text, steps, showSteps }: Props) {
  const list = (
    <ol className="steps">
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  )
  return (
    <section className="card explain">
      <strong>{title}</strong>
      <p>{text}</p>
      {showSteps ? (
        list
      ) : (
        <details className="how">
          <summary>¿Cómo se usa?</summary>
          {list}
        </details>
      )}
    </section>
  )
}
