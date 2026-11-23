// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Agenda el recordatorio con una alarma inexacta (no pide permiso de alarmas exactas). */
object ReminderScheduler {
    private const val ACTION = "cl.dinovance.contigo.action.REMIND"

    fun schedule(context: Context, delayMillis: Long) {
        val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, System.currentTimeMillis() + delayMillis, intent(context))
    }

    private fun intent(context: Context): PendingIntent {
        val i = Intent(context, ReminderReceiver::class.java).setAction(ACTION)
        return PendingIntent.getBroadcast(context, 0, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
}

/** Si quedan gastos confirmados sin enviar, avisa «Tienes N gastos por enviar» y vuelve a agendar. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val graph = CaptureGraph.get(context)
        val count = ReminderPolicy.pendingToSend(graph.drafts.list(), graph.prefs.activeOwner())
        val message = ReminderPolicy.message(count) ?: return
        graph.notifier.showReminder(message)
        ReminderScheduler.schedule(context, ReminderPolicy.REPEAT_MILLIS)
    }
}
