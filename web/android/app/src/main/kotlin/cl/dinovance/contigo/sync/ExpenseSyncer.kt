// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.sync

import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.AutoSavedLog
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftRepository
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.ReminderPolicy
import cl.nido.parser.Kind
import cl.nido.parser.PaymentMedium
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

/**
 * Resultado de un envio. NEEDS_PERSON = hay gastos confirmados que el telefono no puede enviar solo (sin categoria posible o una
 * cuota que no es gasto nuevo): siguen en la bandeja y la app los resuelve; reintentar solo no los arregla.
 */
enum class SyncResult(
    /** true = el trabajo en segundo plano debe reintentar (Result.retry); el resto termina el trabajo. */
    val retriesInBackground: Boolean = false,
) { NOTHING_TO_SEND, ALL_SENT, RETRY(true), REJECTED, NO_SESSION, NEEDS_PERSON }

/** Resumen de una pasada de envio (solo cuentas). */
data class SyncReport(val result: SyncResult, val sent: Int, val failed: Int, val needsPerson: Int)

/** Contadores para el panel de estado (sin datos personales). */
interface SyncStatusStore {
    fun recordSuccess(nowMillis: Long)

    fun recordError(kind: String, nowMillis: Long)
}

/**
 * Envia a Supabase los gastos (expenses) e ingresos extra (incomes) confirmados del dueno activo, con la app cerrada, y avisa a
 * la pareja (notify) SOLO de los gastos: un ingreso es privado y jamas se avisa ni se manda a nadie mas. El id del gasto
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

    fun syncOnce(): SyncResult = syncWithReport().result

    /**
     * Envia y cuenta (para «Enviar ahora» de la app): [SyncReport.sent] filas aceptadas en esta pasada, [SyncReport.failed] las que
     * se intentaron y siguen en la cola (red, servidor, rechazo), [SyncReport.needsPerson] las confirmadas que el telefono no puede
     * enviar solo. Solo cuentas: ningun monto ni comercio.
     */
    fun syncWithReport(): SyncReport = coordinated {
        val tally = Tally()
        val result = run(tally)
        SyncReport(result, tally.sent, tally.attempted - tally.sent, tally.needsPerson)
    }

    /** Contadores de una pasada (solo dentro del cerrojo). */
    private class Tally { var attempted = 0; var sent = 0; var needsPerson = 0 }

    private fun run(tally: Tally): SyncResult {
        val me = owner() ?: return SyncResult.NO_SESSION
        val confirmed = repository.list().filter { it.status == DraftStatus.CONFIRMED && ReminderPolicy.sendsAlone(it.candidate.kind) && it.ownerKey == me && !it.syncRejected }
        val p = profile()?.takeIf { it.ownerKey == me } ?: return noProfile(confirmed)
        val base = apiBase()?.takeIf { it.startsWith("https://") } ?: return SyncResult.NO_SESSION
        val todo = confirmed.mapNotNull { d -> val path = pathOf(d); val row = rowOf(d, p); if (path != null && row != null) Triple(d, path, row) else null }
        // Confirmados que el telefono no puede enviar solo (sin categoria posible, o una cuota que no es gasto nuevo): quedan en la
        // bandeja para la persona y el resultado lo dice; jamas un «nada que enviar» mudo (falla QA 2026-11-24).
        val needPerson = confirmed.size - todo.size
        tally.needsPerson = needPerson
        tally.attempted = todo.size
        // Solo gastos: un ingreso extra es privado (la pareja no lo ve) y nunca dispara notify.
        val pendingNotify = log?.listFor(me)?.filter { it.kind == Kind.EXPENSE && it.synced && !it.notified && !it.rejected && clock() - it.at < NOTIFY_WINDOW_MILLIS }.orEmpty()
        if (todo.isEmpty() && pendingNotify.isEmpty()) return if (needPerson > 0) needsPerson() else SyncResult.NOTHING_TO_SEND
        var token = session.accessToken(clock() / 1000) ?: if (session.refresh()) session.accessToken(clock() / 1000) else null
        // Sin token vigente (con la app abierta no se renueva aqui: lo hace supabase-js y lo deja en el Keystore) se reintenta:
        // es pasajero y hay gastos de la persona esperando. Al cerrar sesion owner() es null y no se llega aqui.
        if (token == null) return retry("AUTH")
        // R3-02: el token debe ser de la persona del perfil; si no, no se envia nada y se limpia el perfil
        if (!tokenBelongsTo(token, p.userId)) {
            status.recordError("OWNER", clock())
            onOwnerMismatch()
            return SyncResult.NO_SESSION
        }
        var rejected = false
        var schemaPending = false
        for ((draft, path, row) in todo) {
            var r = post(base, path, token!!, row.toString()) ?: return retry("NETWORK")
            if (r.status == 401 && session.refresh()) {
                token = session.accessToken(clock() / 1000) ?: return retry("AUTH")
                if (!tokenBelongsTo(token, p.userId)) {
                    status.recordError("OWNER", clock())
                    onOwnerMismatch()
                    return SyncResult.NO_SESSION
                }
                r = post(base, path, token, row.toString()) ?: return retry("NETWORK")
            }
            when {
                r.status in 200..299 || (r.status == 409 && r.body.contains("23505")) -> {
                    repository.remove(draft.id)
                    tally.sent++
                    log?.markSynced(draft.id.lowercase())
                    if (draft.candidate.kind == Kind.EXPENSE && !notify(base, token, draft.id.lowercase())) return retry("NOTIFY")
                }
                r.status == 401 -> return retry("AUTH")
                r.status == 429 || r.status >= 500 -> return retry("SERVER")
                // La base aun no tiene la columna nueva (migracion sin aplicar): no es culpa del gasto. Se deja en la cola sin
                // marcarlo rechazado y se reintenta despues; los demas siguen saliendo (M4).
                schemaNotReady(r) -> schemaPending = true
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
        if (schemaPending) return retry("SCHEMA")
        status.recordSuccess(clock())
        return if (needPerson > 0) needsPerson() else SyncResult.ALL_SENT
    }

    private fun needsPerson(): SyncResult {
        status.recordError(NEEDS_PERSON, clock())
        return SyncResult.NEEDS_PERSON
    }

    /** Sin perfil del dueno no se puede armar la fila; si hay gastos confirmados esperando, el motivo queda a la vista. */
    private fun noProfile(confirmed: List<Draft>): SyncResult {
        if (confirmed.isNotEmpty()) status.recordError(NO_PROFILE, clock())
        return SyncResult.NO_SESSION
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

    /** 400 de PostgREST por una columna que la base no conoce (PGRST204) o error de Postgres de columna inexistente (42703). */
    private fun schemaNotReady(r: HttpResult): Boolean {
        if (r.status != 400) return false
        val code = try { JSONObject(r.body).optString("code") } catch (e: Exception) { "" }
        return code == "PGRST204" || code == "42703"
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

    /** Tabla a la que va el borrador: gasto -> expenses, ingreso -> incomes; pago de deuda o transferencia -> ninguna (null). */
    internal fun pathOf(d: Draft): String? = when (d.candidate.kind) {
        Kind.EXPENSE -> "/rest/v1/expenses"
        Kind.INCOME -> "/rest/v1/incomes"
        Kind.DEBT_PAYMENT, Kind.TRANSFER_OUT -> null
    }

    /**
     * Fila a enviar; null si el borrador no se puede enviar solo (sin categoria, id raro, pago de deuda o transferencia): lo hace
     * la app. El id es el del borrador (UUID v4 = draftExpenseId del front): reenviar nunca duplica.
     */
    internal fun rowOf(d: Draft, p: AutoProfile): JSONObject? {
        val id = d.id.lowercase().takeIf { UUID.matches(it) } ?: return null
        val day = Instant.ofEpochMilli(d.postedAtMillis).atZone(zone).toLocalDate().toString()
        // Segunda barrera: solo un GASTO arma fila de expenses y solo un INGRESO de incomes; pago de deuda y transferencia jamas.
        when (d.candidate.kind) {
            // Tercera barrera: el cobro de una cuota de una compra anterior o una compra en cuotas sin total nunca se envian solos
            // (un borrador CONFIRMED heredado de una version anterior o de una notificacion vieja tambien se frena aqui).
            Kind.EXPENSE -> if (!d.savableFromNotification) return null
            // Igual que incomeRow de web/src/lib/movements.ts: user_id lo pone la base (auth.uid()), received_on = dia del aviso en Chile
            Kind.INCOME -> return if (d.candidate.amountClp <= 0) null else JSONObject()
                .put("id", id).put("household_id", p.householdId).put("amount", d.candidate.amountClp)
                .put("source", CaptureProcessor.INCOME_SOURCE).put("received_on", day)
            Kind.DEBT_PAYMENT, Kind.TRANSFER_OUT -> return null
        }
        // Igual que el guardado automatico (CaptureProcessor.autoCategory): la aprendida del comercio o, si es nuevo, la general del
        // perfil. Antes faltaba la general: un comercio nuevo guardado con «Guardar» nunca salia (falla QA 2026-11-24).
        val category = d.categoryId ?: p.categoryFor(d.candidate.merchant) ?: p.defaultCategoryId ?: return null
        val note = safeTake(ExpenseNote.of(d.candidate), MAX_NOTE)
        val row = JSONObject()
            .put("id", id).put("household_id", p.householdId).put("category_id", category)
            .put("amount", d.candidate.amountClp).put("paid_by", if (p.shared) p.paidBy else p.userId).put("shared", p.shared)
            .put("note", note).put("spent_on", day)
        // Compra con la CMR: no baja la cuenta, sube lo usado de la tarjeta. Sin medio claro queda en debito (el valor por defecto de la base).
        if (d.candidate.medium == PaymentMedium.CREDIT) row.put("payment_method", "tarjeta")
        return row
    }

    companion object {
        /** Origen (esquema + host [+ puerto], sin ruta) de la direccion del Worker. */
        fun apiOrigin(base: String): String {
            val u = java.net.URI(base)
            return u.scheme + "://" + u.host + (if (u.port != -1) ":" + u.port else "")
        }

        private val UUID = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
        const val MAX_NOTE = 120
        /** Codigos de error del estado de envio (getSyncState.lastError). */
        const val NEEDS_PERSON = "NEEDS_PERSON"
        const val NO_PROFILE = "NO_PROFILE"
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
