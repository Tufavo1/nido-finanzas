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
    fun rescan(active: List<ActiveNotice>): Int = scan(active).processed

    /** Como [rescan] pero con el informe del escaneo: solo numeros, jamas paquetes ni texto. */
    @Synchronized
    fun scan(active: List<ActiveNotice>): ScanReport {
        val now = clock()
        val fresh = active.filter { now - it.postTime <= MAX_AGE_MILLIS }.sortedByDescending { it.postTime }
        fresh.forEach { try { recent(it.packageName, it.postTime) } catch (e: Exception) { onFailure(e.javaClass.simpleName) } }
        val allowed = fresh.filter { accepts(it.packageName) }
        val examined = allowed.take(MAX_PER_PASS)
        val todo = examined.filterNot { seen.has(it.packageName, it.key, it.postTime) }
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
        return ScanReport(examined.size, processed, examined.size - todo.size, fresh.size - allowed.size)
    }

    companion object {
        const val MAX_AGE_MILLIS = 24L * 60 * 60 * 1000
        const val MAX_PER_PASS = 50
    }
}

/** scanned = avisos activos de apps PERMITIDAS examinados (<= 24 h, tope 50); processed = borradores nuevos; alreadySeen = ya marcados; otherApps = avisos de apps NO permitidas (solo el numero). */
data class ScanReport(val scanned: Int, val processed: Int, val alreadySeen: Int, val otherApps: Int)

/** Una causa probable de por que «Buscar gastos» no encontro nada. */
enum class ScanReason { OK, LISTENER_OFF, NO_BANK_APP, NOTHING_ACTIVE, ONLY_SEEN }

data class ScanResult(val report: ScanReport, val reason: ScanReason) {
    fun toMap(): Map<String, Any> = mapOf(
        "scanned" to report.scanned, "processed" to report.processed, "alreadySeen" to report.alreadySeen, "otherApps" to report.otherApps, "reason" to reason.name,
    )

    companion object {
        /** [listenerOn]: permiso de acceso a notificaciones concedido Y servicio conectado. [hasBankApp]: hay apps permitidas (bancos detectados o elegidas). */
        fun of(listenerOn: Boolean, hasBankApp: Boolean, r: ScanReport): ScanResult = ScanResult(
            r,
            when {
                !listenerOn -> ScanReason.LISTENER_OFF
                !hasBankApp -> ScanReason.NO_BANK_APP
                r.scanned == 0 -> ScanReason.NOTHING_ACTIVE
                r.processed == 0 && r.alreadySeen >= r.scanned -> ScanReason.ONLY_SEEN
                else -> ScanReason.OK
            },
        )
    }
}
