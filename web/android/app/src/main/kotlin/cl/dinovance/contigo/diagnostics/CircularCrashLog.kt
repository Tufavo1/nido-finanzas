// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.diagnostics

import org.json.JSONArray
import org.json.JSONException
import java.io.File
import java.io.IOException

/** Registro circular local de cierres inesperados: guarda los últimos [capacity]; los más viejos se descartan. */
class CircularCrashLog(private val file: File, private val capacity: Int = DEFAULT_CAPACITY) {
    fun append(report: CrashReport) {
        val all = (read() + report).takeLast(capacity)
        val array = JSONArray()
        all.forEach { array.put(it.toJson()) }
        file.writeText(array.toString())
    }

    fun read(): List<CrashReport> {
        if (!file.exists()) return emptyList()
        return try {
            val array = JSONArray(file.readText())
            (0 until array.length()).map { CrashReport.fromJson(array.getJSONObject(it)) }
        } catch (e: JSONException) {
            emptyList()
        } catch (e: IOException) {
            emptyList()
        }
    }

    /** Se llama cuando los reportes ya se enviaron. */
    fun clear() {
        file.delete()
    }

    companion object {
        const val DEFAULT_CAPACITY = 20
    }
}
