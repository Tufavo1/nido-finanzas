import { useId } from 'react'

interface Props {
  /** Alto en px (el ancho es 1,5 veces el alto) */
  size?: number
  /** Los dos círculos se acercan hasta encontrarse al aparecer */
  animate?: boolean
  /** Latido suave: para pantallas de espera */
  pulse?: boolean
}

/** La marca de Contigo: dos personas, dos círculos. Donde se encuentran está lo que comparten. */
export default function Logo({ size = 48, animate = false, pulse = false }: Props) {
  const id = useId()
  return (
    <svg
      className={['brand-logo', animate ? 'meet' : '', pulse ? 'pulse' : ''].join(' ').trim()}
      width={size * 1.5}
      height={size}
      viewBox="0 0 72 48"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={`${id}-l`}>
          <circle cx="24" cy="24" r="24" />
        </clipPath>
      </defs>
      <g className="logo-a">
        <circle cx="24" cy="24" r="24" fill="var(--blue)" />
      </g>
      <g className="logo-b">
        <circle cx="48" cy="24" r="24" fill="var(--amber)" />
      </g>
      <circle className="logo-x" cx="48" cy="24" r="24" fill="var(--accent)" clipPath={`url(#${id}-l)`} />
    </svg>
  )
}
