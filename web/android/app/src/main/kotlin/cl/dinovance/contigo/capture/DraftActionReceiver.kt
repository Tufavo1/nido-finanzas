// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Acciones de la notificación que no necesitan abrir la app. «Guardar» confirma el borrador; la app lo envía
 * al servidor (con la cola sin conexión) la próxima vez que se abre. «Ignorar» lo elimina.
 */
class DraftActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(CaptureNotifier.EXTRA_DRAFT_ID) ?: return
        val graph = CaptureGraph.get(context)
        when (intent.action) {
            CaptureNotifier.ACTION_SAVE -> {
                // Solo los gastos se guardan desde la notificacion; ingresos y pagos de deuda se deciden dentro de la app.
                if (graph.drafts.list().firstOrNull { it.id == id }?.candidate?.kind != cl.nido.parser.Kind.EXPENSE) return
                graph.drafts.setStatus(id, DraftStatus.CONFIRMED)
                ReminderScheduler.schedule(context, ReminderPolicy.FIRST_REMINDER_MILLIS)
            }
            CaptureNotifier.ACTION_IGNORE -> graph.drafts.remove(id)
            else -> return
        }
        graph.notifier.cancel(id)
        DraftEvents.changed()
    }
}
