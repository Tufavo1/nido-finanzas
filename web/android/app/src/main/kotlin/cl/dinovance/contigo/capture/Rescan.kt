// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import org.json.JSONArray
import java.security.MessageDigest

/** Aviso activo en la barra. El texto se lee SOLO si el paquete esta permitido (RF-01), por eso va en una funcion. */
class ActiveNotice(val packageName: String, val key: String, val postTime: Long, val read: () -> Pair<String?, String?>)

/**
 * Avisos ya vistos, para no procesar dos veces lo que onNotificationPosted ya tomo ni repetir en cada conexion. Guarda SOLO
 * hashes SHA-256 de paquete+clave+hora (jamas texto), maximo 200, de forma persistente y cifrada (sobrevive a un cierre de sesion:
 * un gasto ya enviado no debe volver a nacer desde la barra).
 */
class SeenNotices(private val store: TextStore, private val max: Int = MAX) {
    @Synchronized
    fun has(pkg: String, key: String, postTime: Long): Boolean = hash(pkg, key, postTime) in load()

    @Synchronized
    fun mark(pkg: String, key: String, postTime: Long) = markAll(listOf(Triple(pkg, key, postTime)))

    @Synchronized
    fun markAll(items: List<Triple<String, String, Long>>) {
        val list = load().toMutableList()
        items.map { hash(it.first, it.second, it.third) }.forEach { if (it !in list) list.add(it) }
        store.write(JSONArray(list.takeLast(max)).toString())
    }

    private fun load(): List<String> = try {
        val a = JSONArray(store.read() ?: "[]")
        (0 until a.length()).map { a.getString(it) }
    } catch (e: Exception) {
        emptyList()
    }

    companion object {
        const val MAX = 200

        fun hash(pkg: String, key: String, postTime: Long): String =
            MessageDigest.getInstance("SHA-256").digest("$pkg|$key|$postTime".toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}

/**
 * Procesa los avisos que YA estaban en la barra cuando el servicio se conecto o la app paso a primer plano. Mismo camino que un
 * aviso nuevo ([process] = CaptureProcessor.process), sin duplicar, solo paquetes permitidos, solo las ultimas 24 h y hasta 50 por pasada.
 */
class NotificationRescanner(
    private val accepts: (String) -> Boolean,
    private val process: (pkg: String, title: String?, text: String?, postedAtMillis: Long) -> Outcome,
    private val seen: SeenNotices,
    private val clock: () -> Long,
    /** Modo aprender: solo paquete y hora, de cualquier app (nunca texto). */
    private val recent: (pkg: String, postTime: Long) -> Unit,
    private val onFailure: (String) -> Unit = {},
) {
    @Synchronized
    fun rescan(active: List<ActiveNotice>): Int {
        val now = clock()
        val fresh = active.filter { now - it.postTime <= MAX_AGE_MILLIS }.sortedByDescending { it.postTime }
        fresh.forEach { try { recent(it.packageName, it.postTime) } catch (e: Exception) { onFailure(e.javaClass.simpleName) } }
        val todo = fresh.filter { accepts(it.packageName) && !seen.has(it.packageName, it.key, it.postTime) }.take(MAX_PER_PASS)
        val done = ArrayList<Triple<String, String, Long>>()
        var processed = 0
        for (n in todo) {
            try {
                val (title, text) = n.read()
                if (process(n.packageName, title, text, n.postTime) != Outcome.FAILED) processed++
            } catch (e: Throwable) {
                onFailure(e.javaClass.simpleName)
            }
            done.add(Triple(n.packageName, n.key, n.postTime)) // tambien los malos: no se reintentan en cada conexion
        }
        if (done.isNotEmpty()) seen.markAll(done)
        return processed
    }

    companion object {
        const val MAX_AGE_MILLIS = 24L * 60 * 60 * 1000
        const val MAX_PER_PASS = 50
    }
}
