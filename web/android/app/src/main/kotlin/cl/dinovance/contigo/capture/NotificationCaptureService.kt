// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import android.app.Notification
import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Escucha las notificaciones del sistema. Solo mira las de los paquetes de la lista blanca y solo lee
 * título y texto de esas. Todo el trabajo va dentro de [CaptureProcessor], que nunca lanza.
 */
class NotificationCaptureService : NotificationListenerService() {
    private val graph by lazy { CaptureGraph.get(applicationContext) }

    override fun onListenerConnected() {
        instance = this
        graph.prefs.heartbeat(System.currentTimeMillis(), connected = true)
        // Bancos instalados despues de abrir la app tambien se detectan
        try { graph.refreshBanks(applicationContext) } catch (e: Exception) { graph.prefs.recordFailure(e.javaClass.simpleName, System.currentTimeMillis()) }
        rescanActive()
        // Tras un reinicio se pierden las alarmas: si quedan gastos por enviar, se vuelve a agendar el recordatorio.
        if (ReminderPolicy.pendingToSend(graph.drafts.list(), graph.prefs.activeOwner()) > 0) {
            ReminderScheduler.schedule(applicationContext, ReminderPolicy.FIRST_REMINDER_MILLIS)
        }
    }

    override fun onListenerDisconnected() {
        if (instance === this) instance = null
        graph.prefs.heartbeat(System.currentTimeMillis(), connected = false)
        // El sistema puede desconectarnos (ahorro de batería, fabricante): pedimos volver a conectar.
        requestRebind(ComponentName(this, NotificationCaptureService::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val posted = sbn ?: return
        // Solo nombre de paquete y hora (jamas texto): alimenta «apps que avisaron recientemente» para elegir la lista.
        if (posted.packageName != packageName) graph.recent.record(posted.packageName, posted.postTime)
        // RF-01: se decide por el nombre del paquete antes de tocar los extras.
        if (!graph.processor.accepts(posted.packageName)) {
            // App de banco conocida pero fuera de la lista: se anota el motivo SIN leer el texto del aviso
            if (graph.prefs.bankOfPackage(posted.packageName) != null) graph.diagnostics.add(DiagReason.PACKAGE_NOT_ALLOWED, graph.prefs.bankOfPackage(posted.packageName), null)
            return
        }
        try {
            capture(posted)
        } catch (e: Throwable) {
            // Extras corruptos o no legibles: el servicio sigue vivo y solo se cuenta el fallo (sin contenido).
            graph.prefs.recordFailure(e.javaClass.simpleName, System.currentTimeMillis())
        }
    }

    private fun capture(posted: StatusBarNotification) {
        val extras = posted.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.take(MAX_TEXT)
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))
            ?.toString()?.take(MAX_TEXT)
        val outcome = graph.processor.process(posted.packageName, title, text, posted.postTime)
        graph.seen.mark(posted.packageName, posted.key, posted.postTime) // el reescaneo no lo vuelve a tomar
        if (outcome == Outcome.STORED) DraftEvents.changed()
    }

    /** Avisos que ya estaban en la barra (el servicio solo recibe los NUEVOS). Nunca lanza. Devuelve cuantos proceso. */
    fun rescanActive(): ScanReport = try {
        val active = (activeNotifications ?: emptyArray()).filter { it.packageName != packageName }.map { sbn ->
            ActiveNotice(sbn.packageName, sbn.key, sbn.postTime) {
                val extras = sbn.notification?.extras
                val title = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.take(MAX_TEXT)
                val text = (extras?.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras?.getCharSequence(Notification.EXTRA_TEXT))?.toString()?.take(MAX_TEXT)
                title to text
            }
        }
        val report = graph.rescanner.scan(active)
        if (report.processed > 0) DraftEvents.changed()
        report
    } catch (e: Throwable) {
        graph.prefs.recordFailure(e.javaClass.simpleName, System.currentTimeMillis())
        ScanReport(0, 0, 0, 0)
    }

    companion object {
        private const val MAX_TEXT = 2_000

        /** Servicio conectado ahora mismo (null si no lo esta); lo usa el plugin para `rescanNotifications`. */
        @Volatile
        var instance: NotificationCaptureService? = null
    }
}
