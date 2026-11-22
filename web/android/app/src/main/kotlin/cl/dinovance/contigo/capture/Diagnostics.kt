// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import org.json.JSONArray
import org.json.JSONObject

/** Motivo tipificado de por que un aviso no produjo (o no se guardo solo como) gasto. */
enum class DiagReason {
    PACKAGE_NOT_ALLOWED, NO_SESSION, NO_PROFILE, NOT_AN_EXPENSE, INCOME, AMBIGUOUS_AMOUNT, NO_AMOUNT, LOW_CONFIDENCE, DUPLICATE, QUEUE_FULL,
    CAP_EXCEEDED, CATEGORY_UNKNOWN, BANK_OFF, NOTIFICATIONS_OFF,
}

data class DiagEntry(val atMillis: Long, val bankId: String?, val reason: DiagReason, val maskedText: String)

/** Digitos a «#»; se conservan letras, «$», puntos y comas. Tope de 300 caracteres. Asi la persona puede compartirlo sin montos ni numeros de tarjeta. */
object MaskText {
    const val MAX = 300

    fun mask(text: String?): String = buildString {
        for (c in text.orEmpty().take(MAX)) append(if (c.isDigit()) '#' else if (c == '\n' || c == '\r' || c == '\t') ' ' else c)
    }
}

/**
 * Buffer circular LOCAL y cifrado (almacen seguro) de los ultimos 20 avisos que no se aceptaron. Solo motivo, banco, hora y texto
 * enmascarado. Nunca se envia solo, ni va a logs ni a client_errors: lo copia la persona si quiere.
 */
class DiagnosticsLog(private val store: TextStore, private val clock: () -> Long) {
    @Synchronized
    fun list(): List<DiagEntry> = load()

    @Synchronized
    fun add(reason: DiagReason, bankId: String?, rawText: String?) {
        val e = DiagEntry(clock(), bankId, reason, MaskText.mask(rawText))
        save((listOf(e) + load()).take(MAX))
    }

    @Synchronized
    fun clear() = store.write(null)

    private fun load(): List<DiagEntry> = try {
        val a = JSONArray(store.read() ?: "[]")
        (0 until a.length()).map {
            val o = a.getJSONObject(it)
            DiagEntry(o.getLong("at"), if (o.isNull("bank")) null else o.getString("bank"), DiagReason.valueOf(o.getString("reason")), o.getString("text"))
        }
    } catch (e: Exception) {
        emptyList()
    }

    private fun save(items: List<DiagEntry>) {
        val a = JSONArray()
        items.forEach { a.put(JSONObject().put("at", it.atMillis).put("bank", it.bankId ?: JSONObject.NULL).put("reason", it.reason.name).put("text", it.maskedText)) }
        store.write(a.toString())
    }

    companion object {
        const val MAX = 20
    }
}
