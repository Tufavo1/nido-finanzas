// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.sync

import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.AutoSavedLog
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftRepository
import cl.dinovance.contigo.capture.DraftStatus
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.util.Base64

data class HttpResult(val status: Int, val body: String)

/** Puerto de red (HttpURLConnection en produccion, falso en las pruebas). Lanza IOException si no hay red. */
interface HttpTransport {
    fun post(url: String, headers: Map<String, String>, body: String): HttpResult
}

/** Sesion de Supabase guardada en el Keystore por la app (supabase-js). */
interface SessionSource {
    /** Token de acceso vigente, o null si no hay sesion o esta vencida. */
    fun accessToken(nowSeconds: Long): String?

    /** Renueva con el refresh token y guarda la sesion nueva. false si no se pudo. */
    fun refresh(): Boolean
}

enum class SyncResult { NOTHING_TO_SEND, ALL_SENT, RETRY, REJECTED, NO_SESSION }

/** Contadores para el panel de estado (sin datos personales). */
interface SyncStatusStore {
    fun recordSuccess(nowMillis: Long)

    fun recordError(kind: String, nowMillis: Long)
}

/**
 * Envia a Supabase los gastos confirmados del dueno activo, con la app cerrada, y avisa a la pareja (notify). El id del gasto
 * sale del borrador (el mismo en cada reintento) y 23505 (ya existia) cuenta como exito: reenviar nunca duplica. Los que no
 * puede enviar se quedan en la cola cifrada; el recordatorio de siempre avisa a la persona. Todo lo que toca la cola va bajo
 * el mismo cerrojo que Deshacer ([coordinated]) para que nunca se crucen.
 */
class ExpenseSyncer(
    private val repository: DraftRepository,
    private val profile: () -> AutoProfile?,
    private val owner: () -> String?,
    private val apiBase: () -> String?,
    private val session: SessionSource,
    private val transport: HttpTransport,
    private val status: SyncStatusStore,
    private val clock: () -> Long = System::currentTimeMillis,
    private val zone: ZoneId = ZoneId.of("America/Santiago"),
    private val log: AutoSavedLog? = null,
    /** El token no es de la persona del perfil: se limpia el perfil para que no se envie nada mas bajo otro dueno (R3-02). */
    private val onOwnerMismatch: () -> Unit = {},
) {
    /** Mutua exclusion con el envio: Deshacer y syncOnce nunca corren a la vez (R3-07). */
    fun <T> coordinated(block: () -> T): T = synchronized(this) { block() }

    fun syncOnce(): SyncResult = coordinated { run() }

    private fun run(): SyncResult {
        val me = owner() ?: return SyncResult.NO_SESSION
        val p = profile()?.takeIf { it.ownerKey == me } ?: return SyncResult.NO_SESSION
        val base = apiBase()?.takeIf { it.startsWith("https://") } ?: return SyncResult.NO_SESSION
        val todo = repository.list().filter { it.status == DraftStatus.CONFIRMED && it.candidate.kind == cl.nido.parser.Kind.EXPENSE && it.ownerKey == me && !it.syncRejected }
            .mapNotNull { d -> rowOf(d, p)?.let { d to it } }
        val pendingNotify = log?.listFor(me)?.filter { it.synced && !it.notified && !it.rejected && clock() - it.at < NOTIFY_WINDOW_MILLIS }.orEmpty()
        if (todo.isEmpty() && pendingNotify.isEmpty()) return SyncResult.NOTHING_TO_SEND
        var token = session.accessToken(clock() / 1000) ?: if (session.refresh()) session.accessToken(clock() / 1000) else null
        if (token == null) {
            status.recordError("AUTH", clock())
            return SyncResult.NO_SESSION
        }
        // R3-02: el token debe ser de la persona del perfil; si no, no se envia nada y se limpia el perfil
        if (!tokenBelongsTo(token, p.userId)) {
            status.recordError("OWNER", clock())
            onOwnerMismatch()
            return SyncResult.NO_SESSION
        }
        var rejected = false
        for ((draft, row) in todo) {
            var r = post(base, "/rest/v1/expenses", token!!, row.toString()) ?: return retry("NETWORK")
            if (r.status == 401 && session.refresh()) {
                token = session.accessToken(clock() / 1000) ?: return retry("AUTH")
                if (!tokenBelongsTo(token, p.userId)) {
                    status.recordError("OWNER", clock())
                    onOwnerMismatch()
                    return SyncResult.NO_SESSION
                }
                r = post(base, "/rest/v1/expenses", token, row.toString()) ?: return retry("NETWORK")
            }
            when {
                r.status in 200..299 || (r.status == 409 && r.body.contains("23505")) -> {
                    repository.remove(draft.id)
                    log?.markSynced(draft.id.lowercase())
                    if (!notify(base, token, draft.id.lowercase())) return retry("NOTIFY")
                }
                r.status == 401 -> return retry("AUTH")
                r.status == 429 || r.status >= 500 -> return retry("SERVER")
                else -> {
                    // La base lo rechazo (dato invalido, permiso): no se reintenta solo, y no tapa el exito de las demas (R3-09)
                    rejected = true
                    repository.update(draft.id) { it.copy(syncRejected = true) }
                    log?.markRejected(draft.id.lowercase())
                }
            }
        }
        for (e in pendingNotify) if (!notify(base, token!!, e.id)) return retry("NOTIFY")
        if (rejected) {
            status.recordError("REJECTED", clock())
            return SyncResult.REJECTED
        }
        status.recordSuccess(clock())
        return SyncResult.ALL_SENT
    }

    /**
     * Avisa a la pareja con la sesion del dueno; el cuerpo solo lleva el tipo y el id (nada de montos ni comercios).
     * notify marca el gasto como avisado de forma atomica: repetir la llamada no duplica el aviso. true = no hay que reintentar.
     */
    private fun notify(base: String, token: String, expenseId: String): Boolean {
        val r = post(base, "/functions/v1/notify", token, JSONObject().put("kind", "expense").put("id", expenseId).toString())
        val done = r != null && r.status !in intArrayOf(429) && r.status < 500 && r.status != 401
        if (done) log?.markNotified(expenseId)
        return done
    }

    private fun retry(kind: String): SyncResult {
        status.recordError(kind, clock())
        return SyncResult.RETRY
    }

    private fun post(base: String, path: String, token: String, body: String): HttpResult? = try {
        transport.post(
            base + path,
            // Origin = el del Worker (esquema + host, sin ruta); sin Sec-Fetch-Site. El Worker rechaza escrituras sin Origin propio.
            mapOf("Authorization" to "Bearer $token", "apikey" to API_KEY_PLACEHOLDER, "Content-Type" to "application/json", "Prefer" to "return=minimal", "Origin" to apiOrigin(base)),
            body,
        )
    } catch (e: IOException) {
        null
    }

    /** Si el token es un JWT con `sub`, debe ser el del perfil. Un token que no se pueda leer no se puede comprobar: se deja pasar (el servidor lo valida). */
    private fun tokenBelongsTo(token: String, userId: String): Boolean {
        val sub = try {
            val payload = String(Base64.getUrlDecoder().decode(token.split('.').getOrNull(1) ?: return true), Charsets.UTF_8)
            JSONObject(payload).optString("sub").takeIf { it.isNotEmpty() } ?: return true
        } catch (e: Exception) {
            return true
        }
        return sub.equals(userId, ignoreCase = true)
    }

    /** Fila de expenses; null si el borrador no se puede enviar solo (sin categoria o id raro): lo envia la app. */
    internal fun rowOf(d: Draft, p: AutoProfile): JSONObject? {
        // Segunda barrera: solo los GASTOS se envian como fila de expenses; un ingreso o un pago de deuda jamas (R4).
        if (d.candidate.kind != cl.nido.parser.Kind.EXPENSE) return null
        val category = d.categoryId ?: p.categoryFor(d.candidate.merchant) ?: return null
        val id = d.id.lowercase().takeIf { UUID.matches(it) } ?: return null
        val merchant = d.candidate.merchant?.trim().orEmpty()
        val inst = d.candidate.installment
        val note = safeTake(if (inst == null) merchant else if (merchant.isEmpty()) "cuota ${inst.n}/${inst.total}" else "$merchant (cuota ${inst.n}/${inst.total})", MAX_NOTE)
        return JSONObject()
            .put("id", id).put("household_id", p.householdId).put("category_id", category)
            .put("amount", d.candidate.amountClp).put("paid_by", if (p.shared) p.paidBy else p.userId).put("shared", p.shared)
            .put("note", note).put("spent_on", Instant.ofEpochMilli(d.postedAtMillis).atZone(zone).toLocalDate().toString())
    }

    companion object {
        /** Origen (esquema + host [+ puerto], sin ruta) de la direccion del Worker. */
        fun apiOrigin(base: String): String {
            val u = java.net.URI(base)
            return u.scheme + "://" + u.host + (if (u.port != -1) ":" + u.port else "")
        }

        private val UUID = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
        const val MAX_NOTE = 120
        /** notify solo acepta gastos de menos de 5 minutos; pasado ese plazo no se insiste. */
        private const val NOTIFY_WINDOW_MILLIS = 5L * 60 * 1000
        /** El Worker pone la clave real; supabase-js manda este marcador (ver supabase.ts). */
        const val API_KEY_PLACEHOLDER = "sb_publishable_via_proxy"

        /** Corta a [max] unidades sin partir un par sustituto (emoji) por la mitad. */
        fun safeTake(text: String, max: Int): String {
            if (text.length <= max) return text
            val cut = if (Character.isHighSurrogate(text[max - 1])) max - 1 else max
            return text.substring(0, cut)
        }
    }
}
