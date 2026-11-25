// Copyright (c) 2026 Dinovance

/**
 * Pregunta de confirmación de «Vaciar movimientos pendientes», con el número real y el plural correcto.
 * Los gastos ya guardados en la notificación que aún no se envían (`saved`) no se borran: la pregunta lo dice.
 */
export function wipeTrayQuestion(count: number, saved = 0): string {
  const what = count === 1 ? 'Se borrará 1 movimiento pendiente.' : `Se borrarán ${count} movimientos pendientes.`
  const keep = saved === 0 ? '' : saved === 1 ? ' Hay 1 gasto guardado que aún no se envía: no se pierde.' : ` Hay ${saved} gastos guardados que aún no se envían: no se pierden.`
  return `¿Vaciar la bandeja? ${what}${keep} No se puede deshacer.`
}

export interface TrayCounts {
  pending: number
  saved: number
}

/** Cuenta la bandeja del teléfono: pendientes de confirmar y guardados (confirmados) que aún no se envían */
export function countDrafts(list: readonly { status: string }[]): TrayCounts {
  return { pending: list.filter((x) => x.status === 'PENDING').length, saved: list.filter((x) => x.status === 'CONFIRMED').length }
}
