// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import cl.dinovance.contigo.capture.CaptureGraph
import java.util.concurrent.TimeUnit

/**
 * Trabajo en segundo plano: corre SOLO con red (WorkManager lo lanza apenas vuelve) y sobrevive a reinicios. Un fallo pasajero no usa
 * el retroceso de WorkManager (crece hasta 5 h): agenda el siguiente intento segun [SyncRetryPolicy] (tope 15 min, tope de intentos).
 */
class ExpenseSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val attempts = inputData.getInt(SyncScheduler.KEY_ATTEMPTS, 0)
        val result = try {
            CaptureGraph.get(applicationContext).syncer.syncOnce()
        } catch (e: Exception) {
            null // no se sabe que salio: cuenta como pasajero (el id del borrador evita duplicar)
        }
        val delay = SyncRetryPolicy.nextDelayMillis(result, attempts) ?: return Result.success()
        return try {
            SyncScheduler.retryLater(applicationContext, attempts + 1, delay)
            Result.success()
        } catch (e: Exception) {
            Result.retry() // no se pudo agendar: queda el retroceso de WorkManager como respaldo
        }
    }
}

object SyncScheduler {
    private const val NAME = "contigo-expense-sync"
    internal const val KEY_ATTEMPTS = "attempts"

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /**
     * Hay algo nuevo que enviar (gasto guardado, perfil, «Enviar ahora»): intento inmediato apenas haya red. REPLACE y no APPEND:
     * antes un gasto nuevo quedaba en fila DETRAS de un reintento con retroceso largo y esperaba lo mismo. Un trabajo que ya estaba
     * corriendo termina su pasada (el cerrojo del envio impide que se crucen y el id del borrador evita duplicar).
     */
    fun enqueue(context: Context) = schedule(context, 0, 0, ExistingWorkPolicy.REPLACE)

    /** Reintento [attempts] de una cadena, en [delayMillis] y con red. Va detras del trabajo actual (que termina con exito). */
    internal fun retryLater(context: Context, attempts: Int, delayMillis: Long) =
        schedule(context, attempts, delayMillis, ExistingWorkPolicy.APPEND_OR_REPLACE)

    private fun schedule(context: Context, attempts: Int, delayMillis: Long, policy: ExistingWorkPolicy) {
        val request = OneTimeWorkRequestBuilder<ExpenseSyncWorker>()
            .setConstraints(online)
            .setInitialDelay(delayMillis, TimeUnit.MILLISECONDS)
            .setInputData(Data.Builder().putInt(KEY_ATTEMPTS, attempts).build())
            // Solo si agendar el reintento fallo (Result.retry): mismo inicio de 30 s
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, SyncRetryPolicy.FIRST_DELAY_MILLIS, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(NAME, policy, request)
    }
}
