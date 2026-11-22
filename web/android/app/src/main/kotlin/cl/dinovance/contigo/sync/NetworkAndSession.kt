// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.sync

import cl.dinovance.contigo.security.SecureKeyValueStore
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** HTTP nativo sin cabecera Origin (el Worker lo permite solo asi; ver DEC-01). Solo https. */
class UrlConnectionTransport(private val timeoutMs: Int = 20_000) : HttpTransport {
    override fun post(url: String, headers: Map<String, String>, body: String): HttpResult {
        require(url.startsWith("https://")) { "solo https" }
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = timeoutMs
            c.readTimeout = timeoutMs
            c.instanceFollowRedirects = false
            c.doOutput = true
            headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
            c.setRequestProperty("x-request-id", UUID.randomUUID().toString())
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = c.responseCode
            val stream = if (status >= 400) c.errorStream else c.inputStream
            val text = stream?.use { it.readBytes().take(MAX_BODY).toByteArray().toString(Charsets.UTF_8) }.orEmpty()
            return HttpResult(status, text)
        } catch (e: IOException) {
            throw e
        } finally {
            c.disconnect()
        }
    }

    private companion object { const val MAX_BODY = 16 * 1024 }
}

/** Lee y renueva la sesion que supabase-js dejo en el Keystore (clave «contigo-auth»). */
class KeystoreSessionSource(
    private val store: SecureKeyValueStore,
    private val transport: HttpTransport,
    private val apiBase: () -> String?,
    /** Con la app abierta la renueva ella; renovar tambien aqui podria invalidar el refresh token por rotacion. */
    private val appInForeground: () -> Boolean,
) : SessionSource {
    override fun accessToken(nowSeconds: Long): String? = try {
        val o = JSONObject(store.get(KEY) ?: return null)
        val exp = o.optLong("expires_at", 0)
        o.optString("access_token").takeIf { it.isNotEmpty() && exp > nowSeconds + 30 }
    } catch (e: Exception) {
        null
    }

    override fun refresh(): Boolean {
        if (appInForeground()) return false
        val base = apiBase()?.takeIf { it.startsWith("https://") } ?: return false
        return try {
            val old = JSONObject(store.get(KEY) ?: return false)
            val refresh = old.optString("refresh_token").takeIf { it.isNotEmpty() } ?: return false
            val r = transport.post(
                "$base/auth/v1/token?grant_type=refresh_token",
                mapOf("apikey" to ExpenseSyncer.API_KEY_PLACEHOLDER, "Content-Type" to "application/json"),
                JSONObject().put("refresh_token", refresh).toString(),
            )
            if (r.status !in 200..299) return false
            val fresh = JSONObject(r.body)
            if (!fresh.has("access_token") || !fresh.has("refresh_token")) return false
            if (!fresh.has("expires_at")) fresh.put("expires_at", System.currentTimeMillis() / 1000 + fresh.optLong("expires_in", 3600))
            store.set(KEY, fresh.toString())
            true
        } catch (e: Exception) {
            false
        }
    }

    private companion object { const val KEY = "contigo-auth" }
}
