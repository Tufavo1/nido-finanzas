import { errorInfo } from '../lib/httpErrors'
import Logo from './Logo'

interface Props {
  /** Código de la respuesta (403, 502…); 0 = sin conexión */
  status: number
  onRetry?: () => void
  /** Salida cuando reintentar no sirve (por ejemplo, cerrar sesión con un 401 o 403) */
  onExit?: () => void
  exitLabel?: string
}

/** Pantalla de error dentro de la app: el número, qué pasó en una frase y un solo botón principal */
export default function ErrorPage({ status, onRetry, onExit, exitLabel = 'Volver al inicio' }: Props) {
  const e = errorInfo(status)
  const retry = e.retry && onRetry
  return (
    <div className="splash err-page" role="alert">
      <Logo size={44} />
      {e.code && (
        <span className="err-code num" aria-hidden="true">
          {e.code}
        </span>
      )}
      <h1 className="title">{e.title}</h1>
      <p className="muted">{e.detail}</p>
      <div className="err-actions">
        {retry && (
          <button className="btn wide" type="button" onClick={onRetry}>
            Reintentar
          </button>
        )}
        {onExit && (
          <button className={retry ? 'btn ghost wide' : 'btn wide'} type="button" onClick={onExit}>
            {exitLabel}
          </button>
        )}
      </div>
    </div>
  )
}
