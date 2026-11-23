// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.diagnostics

import android.content.Context
import android.content.pm.PackageManager
import java.io.File

/** Instala el manejador de cierres inesperados. Registra y luego deja que el sistema siga su curso normal. */
object CrashRecorder {
    private const val UNKNOWN_VERSION = "desconocida"

    fun logFor(context: Context) = CircularCrashLog(File(context.noBackupFilesDir, "crash-log.json"))

    fun install(context: Context) {
        val app = context.applicationContext
        val version = versionOf(app)
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            record(app, error, version)
            previous?.uncaughtException(thread, error)
        }
    }

    private fun versionOf(app: Context): String = try {
        app.packageManager.getPackageInfo(app.packageName, 0).versionName ?: UNKNOWN_VERSION
    } catch (e: PackageManager.NameNotFoundException) {
        UNKNOWN_VERSION
    }

    private fun record(app: Context, error: Throwable, version: String) {
        try {
            logFor(app).append(CrashReport.from(error, System.currentTimeMillis(), version))
        } catch (writeError: java.io.IOException) {
            // Sin espacio o sin permiso: no se puede registrar; el cierre original sigue su curso.
            return
        }
    }
}
