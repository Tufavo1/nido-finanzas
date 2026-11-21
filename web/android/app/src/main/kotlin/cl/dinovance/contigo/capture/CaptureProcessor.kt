// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import cl.nido.parser.Kind
import cl.nido.parser.NotificationParser

enum class Outcome { IGNORED_PACKAGE, NO_SESSION, NOT_A_MOVEMENT, DUPLICATE, STORED, QUEUE_FULL, FAILED }

interface DraftNotifier {
    fun show(draft: Draft)

    fun cancel(draftId: String)

    /** La bandeja está llena y no se pudo guardar un gasto: hay que avisar a la persona, no perderlo en silencio. */
    fun queueFull() {}
}

/** Lo que el servicio informa de su salud: sin datos personales ni montos. */
interface HealthRecorder {
    fun recordEvent(nowMillis: Long)

    fun recordFailure(errorClass: String, nowMillis: Long)
}

/**
 * Núcleo de la captura, sin Android para poder probarlo. Orden: lista blanca (antes de leer ningún texto),
 * parser, deduplicación, cola cifrada, notificación. Nada lanza hacia el servicio: ante un aviso malformado
 * se cuenta el fallo por nombre de clase y se sigue (NFR-01, estándares).
 */
class CaptureProcessor(
    private val whitelist: () -> Set<String>,
    private val repository: DraftRepository,
    private val notifier: DraftNotifier,
    private val health: HealthRecorder,
    private val clock: () -> Long,
    private val newId: () -> String,
    /** Paquete de la propia app: nunca se acepta, aunque esté en la lista (evita el bucle aviso -> captura -> aviso) (H-08). */
    private val ownPackage: String? = "cl.dinovance.contigo",
    /** Usuario/hogar activo; los borradores nacen con este dueño (H-06). */
    private val ownerProvider: () -> String? = { null },
    /** En producción sin sesión no se captura nada (no habría dueño al que mostrarlo). */
    private val requireOwner: Boolean = false,
) {
    private class Stored(val fingerprint: String, val key: String, val amount: Long, var blankMerchant: Boolean, val draftId: String, val at: Long)

    // Solo recuerda lo GUARDADO; un descarte no renueva la ventana (H-04).
    private val recent = ArrayList<Stored>()

    /** RF-01: el servicio pregunta ANTES de leer el contenido del aviso. */
    fun accepts(packageName: String): Boolean = packageName != ownPackage && packageName in whitelist()

    fun process(packageName: String, title: String?, text: String?, postedAtMillis: Long): Outcome {
        val now = clock()
        return try {
            handle(packageName, title, text, postedAtMillis, now)
        } catch (e: Throwable) {
            health.recordFailure(e.javaClass.simpleName, now)
            Outcome.FAILED
        }
    }

    private fun handle(packageName: String, title: String?, text: String?, postedAtMillis: Long, now: Long): Outcome {
        if (!accepts(packageName)) return Outcome.IGNORED_PACKAGE
        val owner = ownerProvider()
        // Sin sesión no hay dueño: el aviso se guarda sin dueño (no se muestra a nadie) y se recupera al volver a iniciar
        // la misma sesión (R2-03). Siempre queda constancia en la salud del servicio.
        val orphan = requireOwner && owner == null
        val parser = NotificationParser(whitelist())
        val candidate = parser.parse(packageName, title, text, postedAtMillis)
        if (candidate == null || candidate.kind != Kind.EXPENSE) return Outcome.NOT_A_MOVEMENT
        health.recordEvent(now)
        recent.removeAll { now - it.at >= DEDUPE_WINDOW_MILLIS }
        val key = dedupeKey(candidate.amountClp, candidate.merchant)
        // Mismo aviso repetido: misma huella o mismo monto y comercio a menos de 45 s de lo ULTIMO GUARDADO (el sistema reenvia
        // el aviso, p. ej. al cambiar de minuto). Se mide en segundos, no por el minuto de la huella (R2-01); no renueva la ventana.
        if (recent.any { (it.fingerprint == candidate.fingerprint || it.key == key) && now - it.at < SAME_NOTICE_WINDOW_MILLIS }) return Outcome.DUPLICATE
        // Un cargo sin comercio que se actualiza con mas detalle completa SU borrador, una sola vez (H-14, R2-02).
        // Con otro comercio despues ya no se fusiona: son compras distintas.
        val refined = recent.firstOrNull { it.blankMerchant && it.amount == candidate.amountClp && candidate.merchant != null && now - it.at < REFINE_WINDOW_MILLIS }
        if (refined != null) {
            val updated = repository.list().firstOrNull { it.id == refined.draftId }?.copy(candidate = candidate)
            if (updated != null && repository.update(refined.draftId) { updated }) {
                refined.blankMerchant = false
                if (!orphan) notifier.show(updated)
                return Outcome.DUPLICATE
            }
        }
        // Otro aviso igual pero dentro de 2 min: puede ser otro cafe. Se guarda marcado, la persona decide (H-04).
        val maybe = recent.any { it.key == key }
        val draft = Draft(newId(), candidate, postedAtMillis, now, DraftStatus.PENDING, packageName, owner, maybe)
        if (!addOrMakeRoom(draft, owner)) {
            health.recordFailure("QueueFull", now)
            notifier.queueFull()
            return Outcome.QUEUE_FULL
        }
        recent.add(Stored(candidate.fingerprint, key, candidate.amountClp, candidate.merchant.isNullOrBlank(), draft.id, now))
        while (recent.size > MAX_RECENT) recent.removeAt(0)
        if (orphan) {
            health.recordFailure("NoSession", now)
            return Outcome.NO_SESSION
        }
        notifier.show(draft)
        return Outcome.STORED
    }

    // Si la bandeja esta llena se limpian SOLO borradores de otro dueno de hace mas de 30 dias (nadie los vera). Lo de la
    // persona activa, confirmado o no, jamas se borra (R2-04).
    private fun addOrMakeRoom(draft: Draft, owner: String?): Boolean {
        if (repository.add(draft)) return true
        val cutoff = clock() - FOREIGN_MAX_AGE_MILLIS
        if (repository.purge { it.ownerKey != owner && it.ownerKey != null && it.createdAtMillis < cutoff } == 0) return false
        return repository.add(draft)
    }

    private fun dedupeKey(amountClp: Long, merchant: String?) = "$amountClp|${merchant?.lowercase().orEmpty()}"

    companion object {
        const val DEDUPE_WINDOW_MILLIS = 2L * 60 * 1000
        private const val FOREIGN_MAX_AGE_MILLIS = 30L * 24 * 60 * 60 * 1000
        private const val SAME_NOTICE_WINDOW_MILLIS = 45_000L
        private const val REFINE_WINDOW_MILLIS = 30_000L
        private const val MAX_RECENT = 200
    }
}
