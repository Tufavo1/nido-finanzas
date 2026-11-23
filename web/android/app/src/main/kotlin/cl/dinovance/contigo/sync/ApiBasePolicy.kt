// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.sync

import java.net.URI

/**
 * Quien decide a que host van el token y el refresh token en segundo plano (S-18). La primera direccion valida se acepta;
 * despues el JS solo puede repetir el MISMO origen (esquema, host y puerto). Una WebView comprometida no puede desviar la sesion.
 */
object ApiBasePolicy {
    const val MAX_LENGTH = 200

    sealed class Decision {
        data class Accept(val base: String?) : Decision()
        data class Reject(val code: String) : Decision()
    }

    /** [current] = lo ya guardado; [requested] = lo que pide el JS (sin barra final). */
    fun decide(current: String?, requested: String?): Decision {
        if (requested == null) return if (current == null) Decision.Accept(null) else Decision.Reject("API_BASE_LOCKED")
        if (requested.length > MAX_LENGTH || !requested.startsWith("https://")) return Decision.Reject("INVALID_ARGUMENT")
        val origin = originOf(requested) ?: return Decision.Reject("INVALID_ARGUMENT")
        if (current != null && originOf(current) != origin) return Decision.Reject("API_BASE_LOCKED")
        return Decision.Accept(requested)
    }

    private fun originOf(url: String): String? = try {
        val u = URI(url)
        if (u.scheme != "https" || u.host.isNullOrEmpty() || u.userInfo != null) null else "https://" + u.host.lowercase() + (if (u.port != -1 && u.port != 443) ":" + u.port else "")
    } catch (e: Exception) {
        null
    }
}
