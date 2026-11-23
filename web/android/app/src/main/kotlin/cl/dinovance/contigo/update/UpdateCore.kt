// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.update

import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.URI
import java.security.MessageDigest

/** Errores tipados que ve la app (el front los muestra en espanol simple). Nunca llevan texto del servidor. */
enum class UpdateError {
    NO_NETWORK, RATE_LIMITED, INVALID_FORMAT, NO_ASSET, HOST_NOT_ALLOWED, TOO_LARGE, HASH_MISMATCH, DOWNGRADE,
    WRONG_PACKAGE, WRONG_SIGNATURE, INSTALL_NOT_ALLOWED, INSTALL_FAILED, NOTHING_DOWNLOADED,
}

class UpdateException(val error: UpdateError) : Exception(error.name)

/** Version semantica X.Y.Z. versionCode = major*10000 + minor*100 + patch (misma formula que build.gradle). */
data class SemVer(val major: Int, val minor: Int, val patch: Int) : Comparable<SemVer> {
    val code: Long get() = major * 10_000L + minor * 100L + patch
    override fun compareTo(other: SemVer) = compareValuesBy(this, other, { it.major }, { it.minor }, { it.patch })
    override fun toString() = "$major.$minor.$patch"

    companion object {
        private val RE = Regex("v?(\\d{1,3})\\.(\\d{1,2})\\.(\\d{1,2})")

        /** «v1.2.3» o «1.2.3». Sufijos (-rc1, +build) o numeros fuera de rango dan null. */
        fun parse(text: String?): SemVer? = RE.matchEntire(text.orEmpty().trim())?.destructured?.let { (a, b, c) -> SemVer(a.toInt(), b.toInt(), c.toInt()) }
    }
}

object HostPolicy {
    private val DOWNLOAD_HOSTS = setOf("github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com")
    const val API_HOST = "api.github.com"

    /** https, sin usuario, puerto 443, host exacto de la lista (nada de subdominios ni IP). */
    fun isAllowedDownload(url: String): Boolean = allowed(url, DOWNLOAD_HOSTS)

    fun isAllowedApi(url: String): Boolean = allowed(url, setOf(API_HOST))

    private fun allowed(url: String, hosts: Set<String>): Boolean = try {
        val u = URI(url)
        u.scheme == "https" && u.userInfo == null && (u.port == -1 || u.port == 443) && u.host?.lowercase() in hosts
    } catch (e: Exception) {
        false
    }
}

data class UpdateInfo(
    val versionName: String, val versionCode: Long, val notes: String?, val sizeBytes: Long,
    val apkUrl: String, val hashUrl: String,
)

sealed class CheckResult {
    object UpToDate : CheckResult()
    data class Available(val info: UpdateInfo) : CheckResult()
}

object ReleaseParser {
    const val APK_NAME = "nido-release.apk"
    const val HASH_NAME = "nido-release.apk.sha256"
    const val MAX_APK_BYTES = 150L * 1024 * 1024
    const val MAX_NOTES = 1500

    /**
     * Interpreta la respuesta de `releases/latest`. Borrador y prerelease no cuentan; version menor o igual a la instalada
     * tampoco. Un release sin los dos archivos (apk y .sha256), con URL fuera de la lista o con tamano absurdo se rechaza.
     */
    fun parse(json: String, installedCode: Long): CheckResult {
        val o = try { JSONObject(json) } catch (e: Exception) { throw UpdateException(UpdateError.INVALID_FORMAT) }
        if (o.optBoolean("draft", false) || o.optBoolean("prerelease", false)) return CheckResult.UpToDate
        val version = SemVer.parse(o.optString("tag_name", null)) ?: throw UpdateException(UpdateError.INVALID_FORMAT)
        if (version.code <= installedCode) return CheckResult.UpToDate
        val assets = o.optJSONArray("assets") ?: throw UpdateException(UpdateError.NO_ASSET)
        var apk: JSONObject? = null
        var hash: JSONObject? = null
        for (i in 0 until assets.length()) {
            val a = assets.optJSONObject(i) ?: continue
            when (a.optString("name")) { APK_NAME -> apk = a; HASH_NAME -> hash = a }
        }
        if (apk == null || hash == null) throw UpdateException(UpdateError.NO_ASSET)
        val apkUrl = apk.optString("browser_download_url")
        val hashUrl = hash.optString("browser_download_url")
        if (!HostPolicy.isAllowedDownload(apkUrl) || !HostPolicy.isAllowedDownload(hashUrl)) throw UpdateException(UpdateError.HOST_NOT_ALLOWED)
        val size = apk.optLong("size", -1)
        if (size <= 0 || size > MAX_APK_BYTES) throw UpdateException(UpdateError.TOO_LARGE)
        val notes = o.optString("body", "").trim().take(MAX_NOTES).ifEmpty { null }
        return CheckResult.Available(UpdateInfo(version.toString(), version.code, notes, size, apkUrl, hashUrl))
    }
}

object HashCheck {
    private val HEX = Regex("[0-9a-fA-F]{64}")

    /** Primer campo de `sha256sum`: «<64 hex>  nido-release.apk». null si no tiene esa forma. */
    fun parseExpected(text: String): String? = text.trim().split(Regex("\\s+")).firstOrNull()?.takeIf { HEX.matches(it) }?.lowercase()

    fun sha256(file: File): String = file.inputStream().use { sha256(it) }

    fun sha256(input: InputStream): String {
        val md = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(64 * 1024)
        while (true) { val n = input.read(buf); if (n < 0) break; md.update(buf, 0, n) }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
}

data class HttpResponse(val status: Int, val location: String?, val body: InputStream)

/** Una sola peticion GET anonima, sin seguir redirecciones (las sigue [SafeFetcher]). Lanza IOException sin red. */
interface HttpGet {
    fun get(url: String, headers: Map<String, String>): HttpResponse
}

/** Sigue redirecciones validando cada salto (https y host permitido) y limita el tamano leido. Sin cookies ni datos de la persona. */
class SafeFetcher(private val http: HttpGet, private val maxRedirects: Int = 5) {
    private val headers = mapOf("Accept" to "application/vnd.github+json, application/octet-stream", "User-Agent" to "Contigo-Updater")

    fun open(startUrl: String, firstIsApi: Boolean): HttpResponse {
        var url = startUrl
        var api = firstIsApi
        repeat(maxRedirects + 1) {
            if (!(if (api) HostPolicy.isAllowedApi(url) else HostPolicy.isAllowedDownload(url))) throw UpdateException(UpdateError.HOST_NOT_ALLOWED)
            val r = try { http.get(url, headers) } catch (e: IOException) { throw UpdateException(UpdateError.NO_NETWORK) }
            when (r.status) {
                200 -> return r
                301, 302, 303, 307, 308 -> {
                    r.body.close()
                    url = resolve(url, r.location ?: throw UpdateException(UpdateError.INVALID_FORMAT))
                    api = false
                }
                403, 429 -> { r.body.close(); throw UpdateException(UpdateError.RATE_LIMITED) }
                else -> { r.body.close(); throw UpdateException(UpdateError.INVALID_FORMAT) }
            }
        }
        throw UpdateException(UpdateError.HOST_NOT_ALLOWED) // demasiadas redirecciones
    }

    private fun resolve(base: String, location: String): String = try { URI(base).resolve(location).toString() } catch (e: Exception) { throw UpdateException(UpdateError.INVALID_FORMAT) }

    fun readText(startUrl: String, firstIsApi: Boolean, maxBytes: Int): String {
        val r = open(startUrl, firstIsApi)
        return r.body.use { s ->
            val out = java.io.ByteArrayOutputStream()
            val buf = ByteArray(8192)
            try {
                while (true) {
                    val n = s.read(buf); if (n < 0) break
                    if (out.size() + n > maxBytes) throw UpdateException(UpdateError.TOO_LARGE)
                    out.write(buf, 0, n)
                }
            } catch (e: IOException) { throw UpdateException(UpdateError.NO_NETWORK) }
            out.toString(Charsets.UTF_8.name())
        }
    }

    /** Descarga a [dest] (maximo [maxBytes]); progreso en bytes. Si algo falla el archivo parcial se borra. */
    fun download(url: String, dest: File, maxBytes: Long, progress: (Long) -> Unit) {
        val r = open(url, false)
        try {
            r.body.use { input ->
                dest.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    var total = 0L
                    while (true) {
                        val n = input.read(buf); if (n < 0) break
                        total += n
                        if (total > maxBytes) throw UpdateException(UpdateError.TOO_LARGE)
                        out.write(buf, 0, n)
                        progress(total)
                    }
                }
            }
        } catch (e: IOException) {
            dest.delete(); throw UpdateException(UpdateError.NO_NETWORK)
        } catch (e: UpdateException) {
            dest.delete(); throw e
        }
    }
}

/** Datos del APK descargado que solo Android sabe leer (se inyecta; en pruebas, un doble). */
interface ApkInspector {
    fun packageName(file: File): String?
    fun versionCode(file: File): Long?
    /** El APK esta firmado con el mismo certificado que la app instalada. */
    fun sameSignature(file: File): Boolean
}

class UpdateService(
    private val fetcher: SafeFetcher,
    private val inspector: ApkInspector,
    private val installedCode: () -> Long,
    private val ownPackage: String,
    private val releaseUrl: String,
    private val dir: File,
) {
    @Volatile private var pending: Pair<UpdateInfo, File>? = null
    @Volatile private var pendingSha256: String? = null

    fun check(): CheckResult {
        if (!HostPolicy.isAllowedApi(releaseUrl)) throw UpdateException(UpdateError.HOST_NOT_ALLOWED)
        return ReleaseParser.parse(fetcher.readText(releaseUrl, true, MAX_JSON_BYTES), installedCode())
    }

    /** Descarga, verifica hash y comprueba paquete, version y firma. Devuelve el archivo listo para instalar. */
    fun download(info: UpdateInfo, progress: (Long, Long) -> Unit): File {
        dir.mkdirs()
        val file = File(dir, "nido-update.apk")
        file.delete()
        try {
            val expected = HashCheck.parseExpected(fetcher.readText(info.hashUrl, false, 4096)) ?: throw UpdateException(UpdateError.INVALID_FORMAT)
            fetcher.download(info.apkUrl, file, ReleaseParser.MAX_APK_BYTES) { progress(it, info.sizeBytes) }
            if (HashCheck.sha256(file) != expected) throw UpdateException(UpdateError.HASH_MISMATCH)
            if (inspector.packageName(file) != ownPackage) throw UpdateException(UpdateError.WRONG_PACKAGE)
            val code = inspector.versionCode(file) ?: throw UpdateException(UpdateError.INVALID_FORMAT)
            if (code <= installedCode()) throw UpdateException(UpdateError.DOWNGRADE)
            if (!inspector.sameSignature(file)) throw UpdateException(UpdateError.WRONG_SIGNATURE)
            pendingSha256 = expected
        } catch (e: UpdateException) {
            file.delete(); pending = null; pendingSha256 = null; throw e
        }
        pending = info to file
        return file
    }

    /** Archivo verificado pendiente de instalar, o error NOTHING_DOWNLOADED. */
    fun pendingFile(): File = pending?.second?.takeIf { it.exists() } ?: throw UpdateException(UpdateError.NOTHING_DOWNLOADED)

    /** SHA-256 verificado del archivo pendiente (el instalador lo recalcula al copiarlo a la sesion). */
    fun pendingSha256(): String = pendingSha256 ?: throw UpdateException(UpdateError.NOTHING_DOWNLOADED)

    /** Limpia lo descargado (tras instalar o al fallar). */
    fun cleanup() {
        pending = null
        pendingSha256 = null
        dir.listFiles()?.forEach { it.delete() }
    }

    companion object {
        const val MAX_JSON_BYTES = 256 * 1024
    }
}
