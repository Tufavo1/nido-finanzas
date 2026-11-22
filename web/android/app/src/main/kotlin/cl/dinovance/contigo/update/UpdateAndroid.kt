// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** GET anonimo por HttpURLConnection: sin cookies, sin cabeceras de la persona, sin seguir redirecciones solo. */
class HttpUrlGet(private val timeoutMs: Int = 20_000) : HttpGet {
    override fun get(url: String, headers: Map<String, String>): HttpResponse {
        require(url.startsWith("https://")) { "solo https" }
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = "GET"
        c.connectTimeout = timeoutMs
        c.readTimeout = timeoutMs
        c.instanceFollowRedirects = false
        headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
        val status = c.responseCode
        val body = if (status >= 400) (c.errorStream ?: java.io.ByteArrayInputStream(ByteArray(0))) else c.inputStream
        // Al cerrar el cuerpo se cierra la conexion
        return HttpResponse(status, c.getHeaderField("Location"), object : java.io.FilterInputStream(body) {
            override fun close() { try { super.close() } finally { c.disconnect() } }
        })
    }
}

class PackageApkInspector(private val context: Context) : ApkInspector {
    private val pm get() = context.packageManager

    @Suppress("DEPRECATION")
    private fun archive(file: File, flags: Int) = pm.getPackageArchiveInfo(file.absolutePath, flags)

    override fun packageName(file: File): String? = archive(file, 0)?.packageName

    @Suppress("DEPRECATION")
    override fun versionCode(file: File): Long? = archive(file, 0)?.let { if (Build.VERSION.SDK_INT >= 28) it.longVersionCode else it.versionCode.toLong() }

    @Suppress("DEPRECATION")
    override fun sameSignature(file: File): Boolean {
        val mine = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo?.apkContentsSigners?.map { it.toByteArray().toList() }?.toSet()
        val theirs = archive(file, PackageManager.GET_SIGNING_CERTIFICATES)?.signingInfo?.apkContentsSigners?.map { it.toByteArray().toList() }?.toSet()
        return mine != null && theirs != null && mine.isNotEmpty() && mine == theirs
    }
}

/** Eventos de la instalacion hacia el plugin (la app puede estar cerrada: entonces no hay a quien avisar). */
object UpdateEvents {
    @Volatile var onInstall: ((status: String, error: String?) -> Unit)? = null
}

/** Resultado del instalador del sistema. No exportado: solo recibe el PendingIntent propio. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // El sistema pide confirmar la actualizacion: se abre su pantalla
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (confirm != null) context.startActivity(confirm)
                UpdateEvents.onInstall?.invoke("confirm", null)
            }
            PackageInstaller.STATUS_SUCCESS -> { cleanup(context); UpdateEvents.onInstall?.invoke("installed", null) }
            else -> {
                cleanup(context)
                val code = if (status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE) UpdateError.WRONG_SIGNATURE else UpdateError.INSTALL_FAILED
                UpdateEvents.onInstall?.invoke("failed", code.name)
            }
        }
    }

    private fun cleanup(context: Context) { File(context.cacheDir, UpdateInstaller.DIR).listFiles()?.forEach { it.delete() } }
}

object UpdateInstaller {
    const val DIR = "updates"
    private const val ACTION = "cl.dinovance.contigo.action.INSTALL_RESULT"

    fun canInstall(context: Context): Boolean = context.packageManager.canRequestPackageInstalls()

    /** Sesion de PackageInstaller con el archivo ya verificado. El sistema exige la misma firma y un versionCode mayor. */
    fun install(context: Context, apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(context.packageName)
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            apk.inputStream().use { input -> session.openWrite("nido-update.apk", 0, apk.length()).use { out -> input.copyTo(out); session.fsync(out) } }
            val intent = Intent(context, InstallResultReceiver::class.java).setAction(ACTION)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            session.commit(PendingIntent.getBroadcast(context, id, intent, flags).intentSender)
        }
    }
}
