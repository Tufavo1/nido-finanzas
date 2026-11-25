// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import org.json.JSONArray
import java.security.MessageDigest

/**
 * Aviso activo en la barra. El texto se lee SOLO si el paquete esta permitido (RF-01), por eso va en una funcion.
 * [extract] (ronda 5) lee todos los campos y la estructura; si falta se usa [read] (titulo y texto). [skip]: resumen de grupo o
 * aviso fijo/de servicio (por banderas, sin leer el texto): no se examina.
 */
class ActiveNotice(
    val packageName: String,
    val key: String,
    val postTime: Long,
    val whenMillis: Long = 0,
    val skip: Boolean = false,
    val extract: (() -> ExtractedNotice)? = null,
    val read: () -> Pair<String?, String?>,
)

/**
 * Avisos ya vistos, para no procesar dos veces lo que onNotificationPosted ya tomo ni repetir en cada conexion. Guarda SOLO
 * hashes SHA-256 de paquete+clave+hora (jamas texto), maximo 200, de forma persistente y cifrada (sobrevive a un cierre de sesion:
 * un gasto ya enviado no debe volver a nacer desde la barra).
 */
class SeenNotices(store: TextStore, private val max: Int = MAX, onFailure: (String) -> Unit = {}) {
    // R7: leer-modificar-escribir seguro; un fallo pasajero del Keystore no olvida los avisos ya vistos
    private val hashes = CheckedJsonList(store, ::parse, { JSONArray(it).toString() }, max, onFailure)

    @Synchronized
    fun has(pkg: String, key: String, postTime: Long): Boolean = hash(pkg, key, postTime) in load()

    @Synchronized
    fun mark(pkg: String, key: String, postTime: Long) = markAll(listOf(Triple(pkg, key, postTime)))

    @Synchronized
    fun markAll(items: List<Triple<String, String, Long>>) {
        val fresh = items.map { hash(it.first, it.second, it.third) }
        hashes.update { list -> (list + fresh.filterNot { it in list }.distinct()).takeLast(max) }
    }

    private fun load(): List<String> = hashes.view()

    /** Lanza si el JSON esta dañado. */
    private fun parse(raw: String): List<String> {
        val a = JSONArray(raw)
        return (0 until a.length()).map { a.getString(it) }
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
    /** Camino completo (clave, `when` y estructura del aviso); si se da, reemplaza a [process]. */
    private val processNotice: ((IncomingNotice) -> Outcome)? = null,
) {
    fun rescan(active: List<ActiveNotice>): Int = scan(active).processed

    /** Como [rescan] pero con el informe del escaneo: solo numeros, jamas paquetes ni texto. */
    @Synchronized
    fun scan(active: List<ActiveNotice>): ScanReport {
        val now = clock()
        val fresh = active.filter { now - it.postTime <= MAX_AGE_MILLIS }.sortedByDescending { it.postTime }
        fresh.forEach { try { recent(it.packageName, it.postTime) } catch (e: Exception) { onFailure(e.javaClass.simpleName) } }
        val allowed = fresh.filter { !it.skip && accepts(it.packageName) }
        val examined = allowed.take(MAX_PER_PASS)
        val todo = examined.filterNot { seen.has(it.packageName, it.key, it.postTime) }
        val done = ArrayList<Triple<String, String, Long>>()
        var processed = 0
        for (n in todo) {
            var outcome: Outcome? = null
            try {
                outcome = if (processNotice != null) {
                    val e = n.extract?.invoke() ?: n.read().let { (t, x) -> ExtractedNotice(t, x, NoticeShape.of(t, x)) }
                    processNotice.invoke(IncomingNotice(n.packageName, e.title, e.body, n.postTime, n.key, n.whenMillis, e.shape))
                } else {
                    val (title, text) = n.read()
                    process(n.packageName, title, text, n.postTime)
                }
                // Solo cuenta lo que de verdad quedo guardado como movimiento nuevo (no repetidos ni avisos que no eran un movimiento)
                if (outcome == Outcome.STORED || outcome == Outcome.NO_SESSION) processed++
            } catch (e: Throwable) {
                onFailure(e.javaClass.simpleName)
            }
            // Un aviso cuyos extras no se pueden leer (lanza) se marca para no reintentar en cada conexion. Queda SIN marcar, para
            // reintentarlo, lo que no se pudo leer como movimiento (si mejora la lectura, una version nueva lo toma) y lo que fallo al
            // guardar o no cupo (FAILED, QUEUE_FULL): el procesador reconoce el mismo aviso y no lo duplica (ronda 5).
            if (outcome !in RETRY) done.add(Triple(n.packageName, n.key, n.postTime))
        }
        if (done.isNotEmpty()) seen.markAll(done)
        return ScanReport(examined.size, processed, examined.size - todo.size, fresh.size - allowed.size)
    }

    companion object {
        const val MAX_AGE_MILLIS = 24L * 60 * 60 * 1000
        const val MAX_PER_PASS = 50

        /** Resultados que dejan el aviso sin marcar como visto, para reintentarlo. */
        val RETRY = setOf(Outcome.NOT_A_MOVEMENT, Outcome.FAILED, Outcome.QUEUE_FULL)
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
