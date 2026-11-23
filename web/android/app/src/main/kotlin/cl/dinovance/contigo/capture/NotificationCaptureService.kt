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
        graph.prefs.heartbeat(System.currentTimeMillis(), connected = true, versionCode = graph.versionCode)
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
        try {
            requestRebind(ComponentName(this, NotificationCaptureService::class.java))
        } catch (e: RuntimeException) {
            graph.prefs.recordFailure(e.javaClass.simpleName, System.currentTimeMillis())
        }
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
        // Resumen de grupo (repite a los hijos) o aviso fijo/de servicio: se decide por banderas, sin leer el texto
        if (skips(posted)) return
        val e = NoticeExtractor.extract(rawOf(posted))
        val outcome = graph.processor.process(IncomingNotice(posted.packageName, e.title, e.body, posted.postTime, posted.key, posted.notification?.`when` ?: 0, e.shape))
        // El reescaneo no vuelve a tomar lo ya procesado; lo que no se pudo leer como movimiento, lo que fallo al guardar y lo que no
        // cupo quedan sin marcar para reintentarlo (el procesador reconoce el mismo aviso y no lo duplica)
        if (outcome !in NotificationRescanner.RETRY) graph.seen.mark(posted.packageName, posted.key, posted.postTime)
        if (outcome == Outcome.STORED) DraftEvents.changed()
    }

    /** Avisos que ya estaban en la barra (el servicio solo recibe los NUEVOS). Nunca lanza. Devuelve cuantos proceso. */
    fun rescanActive(): ScanReport = try {
        val active = (activeNotifications ?: emptyArray()).filter { it.packageName != packageName }.map { sbn ->
            ActiveNotice(sbn.packageName, sbn.key, sbn.postTime, sbn.notification?.`when` ?: 0, skips(sbn), { NoticeExtractor.extract(rawOf(sbn)) }) {
                NoticeExtractor.extract(rawOf(sbn)).let { it.title to it.body }
            }
        }
        val report = graph.rescanner.scan(active)
        if (report.processed > 0) DraftEvents.changed()
        report
    } catch (e: Throwable) {
        graph.prefs.recordFailure(e.javaClass.simpleName, System.currentTimeMillis())
        ScanReport(0, 0, 0, 0)
    }

    private fun skips(sbn: StatusBarNotification): Boolean {
        val flags = sbn.notification?.flags ?: 0
        return NoticeExtractor.skipReason(
            RawNotice(null, null, null, groupSummary = flags and Notification.FLAG_GROUP_SUMMARY != 0,
                ongoing = sbn.isOngoing || flags and Notification.FLAG_ONGOING_EVENT != 0, foregroundService = flags and Notification.FLAG_FOREGROUND_SERVICE != 0),
        ) != null
    }

    /** Pasa los extras a texto, cada campo con tope antes de convertirlo (un CharSequence enorme no se copia entero). */
    private fun rawOf(sbn: StatusBarNotification): RawNotice {
        val x = sbn.notification?.extras ?: return RawNotice(null, null, null)
        fun cs(key: String) = x.getCharSequence(key)?.let { it.subSequence(0, minOf(it.length, MAX_RAW)).toString() }
        val lines = x.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.take(MAX_ITEMS)?.map { it.subSequence(0, minOf(it.length, MAX_RAW)).toString() }.orEmpty()
        @Suppress("DEPRECATION")
        val messages = x.getParcelableArray(Notification.EXTRA_MESSAGES)?.takeLast(MAX_ITEMS)
            ?.mapNotNull { (it as? android.os.Bundle)?.getCharSequence("text")?.let { t -> t.subSequence(0, minOf(t.length, MAX_RAW)).toString() } }.orEmpty()
        return RawNotice(
            title = cs(Notification.EXTRA_TITLE), text = cs(Notification.EXTRA_TEXT), bigText = cs(Notification.EXTRA_BIG_TEXT),
            lines = lines, messages = messages, subText = cs(Notification.EXTRA_SUB_TEXT), summaryText = cs(Notification.EXTRA_SUMMARY_TEXT),
        )
    }

    companion object {
        /** Tope de cada campo al copiarlo de los extras; NoticeExtractor aplica despues el tope final de 2.000. */
        private const val MAX_RAW = 4_000
        private const val MAX_ITEMS = 20

        /** Servicio conectado ahora mismo (null si no lo esta); lo usa el plugin para `rescanNotifications`. */
        @Volatile
        var instance: NotificationCaptureService? = null
    }
}
