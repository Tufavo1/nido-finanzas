import { useCallback } from 'react'
import type { Notify } from '../components/Toast'

/** Los errores de una acción salen como aviso (el mismo de los éxitos) en vez de un párrafo dentro de la pantalla. `null` no hace nada. */
export function useToastError(onToast: Notify): (message: string | null) => void {
  return useCallback((message) => (message ? onToast(message, 'error') : undefined), [onToast])
}
