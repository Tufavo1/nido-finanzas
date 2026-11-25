// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import cl.dinovance.contigo.sync.SyncScheduler

/**
 * Acciones de la notificación que no necesitan abrir la app. «Guardar» confirma el borrador y agenda su envío en segundo
 * plano (ExpenseSyncWorker); si no se puede enviar solo, queda en la bandeja «por enviar» de la app. «Ignorar» lo elimina.
 */
class DraftActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(CaptureNotifier.EXTRA_DRAFT_ID) ?: return
        val graph = CaptureGraph.get(context)
        // Solo actua sobre un borrador del dueno ACTIVO: una notificacion que quedo de otra cuenta (o sin sesion) no confirma ni borra
        // nada de nadie. Sin texto ni id en registros: solo el nombre de la clase del fallo.
        val owner = graph.prefs.activeOwner()
        try {
            when (intent.action) {
                CaptureNotifier.ACTION_SAVE -> {
                    // Solo los gastos se guardan desde la notificacion; ingresos, pagos de deuda, transferencias, el cobro de una cuota
                    // anterior y una compra en cuotas sin total se deciden dentro de la app (una notificacion vieja podria traer el boton).
                    if (!DraftActions.saveFromNotification(graph.drafts, id, owner)) return
                    ReminderScheduler.schedule(context, ReminderPolicy.FIRST_REMINDER_MILLIS)
                    // Se envia ya, con la app cerrada (como lo guardado solo); sin red espera y reintenta con retroceso
                    SyncScheduler.enqueue(context)
                }
                CaptureNotifier.ACTION_IGNORE -> if (!DraftActions.removeOwned(graph.drafts, id, owner)) {
                    // Ajeno o ya no esta: no se toca la cola; solo se quita la notificacion que la persona descarto
                    graph.notifier.cancel(id)
                    return
                }
                else -> return
            }
        } catch (e: Exception) {
            // Keystore ocupado (A1): la cola queda intacta y la notificacion sigue ahi para reintentar
            graph.prefs.recordFailure(e.javaClass.simpleName, System.currentTimeMillis())
            return
        }
        graph.notifier.cancel(id)
        DraftEvents.changed()
    }
}

/** Logica pura de las acciones de la notificacion (probada en JVM sin Android). */
object DraftActions {
    /**
     * «Guardar» desde la notificacion: confirma el borrador si es del dueno ACTIVO [activeOwner] y se puede guardar con un toque
     * ([Draft.savableFromNotification]). true = quedo confirmado (hay que enviarlo); false = no aplica (otro tipo, cuota anterior,
     * compra en cuotas sin total, ya no esta, es de otra persona o no tiene dueno, sin sesion). Puede lanzar si el Keystore esta
     * ocupado: el llamador no toca nada mas (A1). El dueno y el tipo se vuelven a comprobar DENTRO de la escritura (sin carrera con un
     * cambio de cuenta).
     */
    fun saveFromNotification(drafts: DraftRepository, id: String, activeOwner: String?): Boolean {
        if (drafts.list().firstOrNull { it.id == id && OwnerFilter.owns(it, activeOwner) }?.savableFromNotification != true) return false
        var confirmed = false
        drafts.update(id) { d ->
            if (OwnerFilter.owns(d, activeOwner) && d.savableFromNotification) d.copy(status = DraftStatus.CONFIRMED).also { confirmed = true } else d
        }
        return confirmed
    }

    /**
     * Quita el borrador [id] SOLO si es del dueno activo, en una sola escritura (el dueno se comprueba bajo el cerrojo del repositorio).
     * true = se quito. false = no existe, es de otra persona, no tiene dueno o no hay sesion: mismo resultado en todos los casos, asi no
     * se revela si el id existe para otro dueno. Lanza si el Keystore esta ocupado, sin haber borrado nada (A1).
     */
    fun removeOwned(drafts: DraftRepository, id: String, activeOwner: String?): Boolean =
        activeOwner != null && drafts.purge { it.id == id && OwnerFilter.owns(it, activeOwner) } > 0

    /**
     * `removeDraft` de la app: la app quita un borrador despues de guardarlo (insert o su cola sin conexion). Si era un guardado
     * automatico aun pendiente, el registro deja de decir «se enviara solo»: antes quedaba asi 14 dias aunque el gasto ya estuviera en
     * la app (QA 2026-11-24). Va bajo el cerrojo del envio (lo pone el llamador). Mismo resultado y mismas reglas que [removeOwned].
     */
    fun removeTakenByApp(drafts: DraftRepository, log: AutoSavedLog, id: String, activeOwner: String?): Boolean {
        if (!removeOwned(drafts, id, activeOwner)) return false
        // El registro usa el id en minusculas (el del gasto); un fallo del Keystore aqui no deshace el borrado (CheckedJsonList espera)
        log.markTakenByApp(id.lowercase(), activeOwner)
        return true
    }
}
