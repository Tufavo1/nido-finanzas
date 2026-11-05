import Logo from './Logo'

/** Logo de la marca con un anillo que gira alrededor: el «cargando» de toda la app */
export default function LogoLoader({ size = 96 }: { size?: number }) {
  return (
    <span className="logo-loader" style={{ width: size, height: size }} aria-hidden="true">
      <span className="logo-loader-ring" />
      <Logo size={Math.round(size * 0.4)} pulse />
    </span>
  )
}
