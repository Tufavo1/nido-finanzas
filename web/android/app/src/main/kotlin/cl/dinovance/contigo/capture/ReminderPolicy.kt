// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

/** Recordatorio local para gastos confirmados con «Guardar» que aun no se enviaron (H-05). */
object ReminderPolicy {
    const val FIRST_REMINDER_MILLIS = 2L * 60 * 60 * 1000
    const val REPEAT_MILLIS = 24L * 60 * 60 * 1000

    fun message(count: Int): String? = when {
        count <= 0 -> null
        count == 1 -> "Tienes 1 gasto por enviar"
        else -> "Tienes $count gastos por enviar"
    }

    fun pendingToSend(drafts: List<Draft>, activeOwner: String?): Int =
        OwnerFilter.visible(drafts, activeOwner).count { it.status == DraftStatus.CONFIRMED && sendsAlone(it.candidate.kind) && !it.syncRejected }

    /** Lo que la persona guardo con «Guardar» (sin lo guardado solo): el aviso «Los guardaste desde la notificacion» de la app. */
    fun savedByPerson(drafts: List<Draft>, activeOwner: String?): Int =
        OwnerFilter.visible(drafts, activeOwner).count { it.status == DraftStatus.CONFIRMED && !it.autoSaved && sendsAlone(it.candidate.kind) && !it.syncRejected }

    /** Lo que el telefono envia solo: gastos (expenses) e ingresos extra (incomes). Pagos de deuda y transferencias jamas. */
    fun sendsAlone(kind: cl.nido.parser.Kind): Boolean = kind == cl.nido.parser.Kind.EXPENSE || kind == cl.nido.parser.Kind.INCOME
}
