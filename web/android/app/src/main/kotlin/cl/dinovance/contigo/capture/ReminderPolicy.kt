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
        OwnerFilter.visible(drafts, activeOwner).count { it.status == DraftStatus.CONFIRMED }
}
