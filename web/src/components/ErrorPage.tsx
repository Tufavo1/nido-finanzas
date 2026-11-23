import StatePage from './StatePage'
import { errorScreen } from '../lib/screenState'
import { kindForStatus } from '../lib/screenStatus'

interface Props {
  /** Código de la respuesta (403, 502…); 0 = sin conexión */
  status: number
  onRetry?: () => void
  /** Salida cuando reintentar no sirve (por ejemplo, cerrar sesión con un 401 o 403) */
  onExit?: () => void
  /** Texto del botón de salida; si falta, se usa el de la pantalla */
  exitLabel?: string
}

/** Pantalla de error dentro de la app: qué pasó en una frase y un solo botón principal (los textos viven en lib/screenState) */
export default function ErrorPage({ status, onRetry, onExit, exitLabel }: Props) {
  const spec = errorScreen({ kind: kindForStatus(status) })
  const retries = spec.primary.kind === 'retry'
  const primary = retries ? onRetry : onExit
  const label = !retries && exitLabel ? exitLabel : spec.primary.label
  // Si no hay con qué reintentar, la salida pasa a ser la acción principal
  if (!primary) return <StatePage spec={spec} onPrimary={() => onExit?.()} />
  return (
    <StatePage
      spec={{ ...spec, primary: { ...spec.primary, label } }}
      onPrimary={primary}
      secondary={retries && onExit ? { label: exitLabel ?? 'Volver al inicio', onClick: onExit } : undefined}
    />
  )
}
