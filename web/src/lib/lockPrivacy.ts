// Copyright (c) 2026 Dinovance
import { money } from './format'

/** Decision 5: ocultar montos en la pantalla de bloqueo, activado por defecto. */
export const DEFAULT_HIDE_ON_LOCK_SCREEN = true

export interface CaptureNotificationText {
  title: string
  body: string
}

const TITLE = 'Gasto detectado'
const HIDDEN_BODY = 'Toca para revisarlo y confirmarlo'

/** Texto de la notificación de captura: con los montos ocultos no lleva ninguna cifra ni comercio. */
export function captureNotificationText(
  c: { amountClp: number; merchant: string | null },
  hideAmounts: boolean = DEFAULT_HIDE_ON_LOCK_SCREEN,
): CaptureNotificationText {
  if (hideAmounts) return { title: TITLE, body: HIDDEN_BODY }
  const merchant = c.merchant?.trim()
  return { title: TITLE, body: merchant ? `${money(c.amountClp)} en ${merchant}` : money(c.amountClp) }
}
