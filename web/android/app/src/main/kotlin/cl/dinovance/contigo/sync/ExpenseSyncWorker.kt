// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import cl.dinovance.contigo.capture.CaptureGraph
import java.util.concurrent.TimeUnit

/** Trabajo en segundo plano: corre con red, reintenta con retroceso exponencial y sobrevive a reinicios. */
class ExpenseSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result = try {
        when (CaptureGraph.get(applicationContext).syncer.syncOnce()) {
            SyncResult.RETRY -> Result.retry()
            else -> Result.success()
        }
    } catch (e: Exception) {
        Result.retry()
    }
}

object SyncScheduler {
    private const val NAME = "contigo-expense-sync"

    fun enqueue(context: Context) {
        val request = OneTimeWorkRequestBuilder<ExpenseSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }
}
