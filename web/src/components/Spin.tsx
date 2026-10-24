/** Rueda de carga con un texto que dice qué se está haciendo. Para dentro de un botón mientras guarda o envía. */
export default function Spin({ label }: { label: string }) {
  return (
    <span className="spin-label" role="status">
      <span className="spin" aria-hidden="true" />
      {label}
    </span>
  )
}
