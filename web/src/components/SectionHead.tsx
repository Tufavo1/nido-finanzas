/** Encabezado que agrupa varias tarjetas por concepto. En pantallas anchas ocupa todo el ancho de la cuadrícula. */
export default function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="sec-head">
      <h2>{title}</h2>
      {hint && <span className="muted small-text">{hint}</span>}
    </header>
  )
}
