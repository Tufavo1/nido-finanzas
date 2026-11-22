// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import cl.dinovance.contigo.MainActivity
import cl.dinovance.contigo.R
import cl.nido.parser.ClpAmount
import cl.nido.parser.Kind

/** Notificación propia de cada borrador, con las acciones Guardar, Cambiar categoría e Ignorar (RF-06). */
class CaptureNotifier(private val context: Context, private val prefs: CapturePrefs) : DraftNotifier {
    private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    override fun show(draft: Draft) {
        if (!canPost()) return
        ensureChannel()
        val amount = ClpAmount.format(draft.candidate.amountClp)
        val kind = draft.candidate.kind
        val base = when (kind) {
            Kind.INCOME -> context.getString(R.string.capture_income_body, amount)
            Kind.DEBT_PAYMENT -> context.getString(R.string.capture_debt_body, amount)
            Kind.EXPENSE -> draft.candidate.merchant?.let { "$amount en $it" } ?: amount
        }
        val body = if (draft.possibleDuplicate) base + context.getString(R.string.capture_possible_duplicate) else base
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_capture)
            .setContentTitle(context.getString(when (kind) { Kind.INCOME -> R.string.capture_income_title; Kind.DEBT_PAYMENT -> R.string.capture_debt_title; Kind.EXPENSE -> R.string.capture_notification_title }))
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(openIntent(draft.id, ACTION_OPEN))
        if (kind == Kind.EXPENSE) {
            builder.addAction(0, context.getString(R.string.capture_action_save), receiverIntent(draft.id, ACTION_SAVE))
                .addAction(0, context.getString(R.string.capture_action_category), openIntent(draft.id, ACTION_CHANGE_CATEGORY))
        } else {
            builder.addAction(0, context.getString(R.string.capture_action_review), openIntent(draft.id, ACTION_OPEN))
        }
        builder.addAction(0, context.getString(R.string.capture_action_ignore), receiverIntent(draft.id, ACTION_IGNORE))
        if (prefs.hideOnLockScreen()) {
            builder.setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setPublicVersion(publicVersion())
        }
        manager.notify(draft.id.hashCode(), builder.build())
    }

    /** Guardado automatico: aviso discreto sin botones y recordatorio por si el envio en segundo plano no sale. */
    override fun autoSaved(draft: Draft) {
        if (canPost()) {
            ensureChannel()
            val amount = ClpAmount.format(draft.candidate.amountClp)
            val text = draft.candidate.merchant?.let { "$amount en $it" } ?: amount
            val b = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_capture)
                .setContentTitle(context.getString(R.string.capture_auto_saved_title))
                .setContentText(if (prefs.hideOnLockScreen()) context.getString(R.string.capture_auto_saved_public) else text)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setAutoCancel(true)
                .setContentIntent(openIntent(draft.id, ACTION_OPEN))
            manager.notify(draft.id.hashCode(), b.build())
        }
        ReminderScheduler.schedule(context, ReminderPolicy.FIRST_REMINDER_MILLIS)
    }

    override fun queueFull() = showReminder(context.getString(R.string.capture_queue_full))

    /** «Tienes N gastos por enviar»: abre la app, que envía lo confirmado. */
    fun showReminder(message: String) {
        if (!canPost()) return
        ensureChannel()
        val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_capture)
            .setContentTitle(context.getString(R.string.capture_reminder_title))
            .setContentText(message)
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(context, REMINDER_ID, open, FLAGS))
        manager.notify(REMINDER_ID, builder.build())
    }

    override fun cancel(draftId: String) = manager.cancel(draftId.hashCode())

    // Versión que se ve con el teléfono bloqueado: sin monto ni comercio.
    private fun publicVersion(): Notification =
        NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_capture)
            .setContentTitle(context.getString(R.string.capture_notification_title))
            .setContentText(context.getString(R.string.capture_notification_locked))
            .build()

    private fun canPost(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun ensureChannel() {
        val channel = NotificationChannel(CHANNEL_ID, context.getString(R.string.capture_channel_name), NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = context.getString(R.string.capture_channel_description)
        channel.lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        manager.createNotificationChannel(channel)
    }

    private fun openIntent(draftId: String, action: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .setAction(action)
            .putExtra(EXTRA_DRAFT_ID, draftId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(context, requestCode(draftId, action), intent, FLAGS)
    }

    private fun receiverIntent(draftId: String, action: String): PendingIntent {
        val intent = Intent(context, DraftActionReceiver::class.java).setAction(action).putExtra(EXTRA_DRAFT_ID, draftId)
        return PendingIntent.getBroadcast(context, requestCode(draftId, action), intent, FLAGS)
    }

    private fun requestCode(draftId: String, action: String) = 31 * draftId.hashCode() + action.hashCode()

    companion object {
        private const val REMINDER_ID = 4102
        const val CHANNEL_ID = "contigo_capture"
        const val EXTRA_DRAFT_ID = "cl.dinovance.contigo.DRAFT_ID"
        const val ACTION_SAVE = "cl.dinovance.contigo.action.SAVE"
        const val ACTION_IGNORE = "cl.dinovance.contigo.action.IGNORE"
        const val ACTION_CHANGE_CATEGORY = "cl.dinovance.contigo.action.CHANGE_CATEGORY"
        const val ACTION_OPEN = "cl.dinovance.contigo.action.OPEN_DRAFT"
        private const val FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    }
}
