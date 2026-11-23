// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.diagnostics

import org.json.JSONArray
import org.json.JSONObject

/**
 * Cierre inesperado SIN datos personales: solo la clase de la excepción y los marcos de pila
 * («clase.método(Archivo.kt:12)»). El mensaje de la excepción NUNCA se guarda: podría traer montos o textos.
 */
data class CrashReport(val atMillis: Long, val appVersion: String, val errorClass: String, val frames: List<String>) {
    fun toJson(): JSONObject = JSONObject()
        .put("at", atMillis)
        .put("appVersion", appVersion)
        .put("errorClass", errorClass)
        .put("frames", JSONArray(frames))

    companion object {
        const val MAX_FRAMES = 12

        fun from(t: Throwable, atMillis: Long, appVersion: String): CrashReport {
            val frames = t.stackTrace.take(MAX_FRAMES).map { "${it.className}.${it.methodName}(${it.fileName ?: "?"}:${it.lineNumber})" }
            return CrashReport(atMillis, appVersion, t.javaClass.name, frames)
        }

        fun fromJson(o: JSONObject): CrashReport {
            val frames = o.getJSONArray("frames")
            return CrashReport(o.getLong("at"), o.getString("appVersion"), o.getString("errorClass"), (0 until frames.length()).map { frames.getString(it) })
        }
    }
}
