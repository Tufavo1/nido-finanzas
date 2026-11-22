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

/**
 * Enmascara un aviso para el diagnostico (S-20). Digitos a «#»; se conservan letras, «$», puntos y comas, salvo lo que sigue a
 * «en», «de», «desde» o «a» (comercio o persona): sus palabras quedan con la inicial y «*». Tope de 120 caracteres.
 * AUN ASI el texto puede contener fragmentos de nombres o comercios que no siguen esas palabras: es local, cifrado, nunca se
 * envia solo ni va a logs, y lo copia la persona a proposito. La pantalla debe avisarlo.
 */
object MaskText {
    const val MAX = 120
    private const val SOURCE_MAX = 600
    private val TRIGGERS = setOf("en", "de", "desde", "a")
    private val SKIP_NEXT = setOf("tu", "su", "tus", "sus", "mi", "la", "las", "los", "el", "un", "una")
    private val STOP = setOf("con", "por", "en", "a", "las", "el", "terminada", "si", "revisa", "desde", "tu", "su", "y", "e")
    private val ENDS = charArrayOf('.', ',', ';', ':', '!', '?')

    private fun word(t: String) = java.text.Normalizer.normalize(t.lowercase().trim(*ENDS), java.text.Normalizer.Form.NFD).filter { it.isLetter() }

    private fun hide(t: String): String {
        var first = true
        return buildString { for (c in t) append(if (c.isLetter()) (if (first) c else '*').also { first = false } else c) }
    }

    fun mask(text: String?): String {
        val digits = buildString { for (c in text.orEmpty().take(SOURCE_MAX)) append(if (c.isDigit()) '#' else if (c == '\n' || c == '\r' || c == '\t') ' ' else c) }
        val tokens = digits.split(' ')
        val out = ArrayList<String>(tokens.size)
        var masking = false
        for ((i, t) in tokens.withIndex()) {
            val w = word(t)
            if (masking && w in STOP) masking = false
            if (masking) {
                out.add(hide(t))
                if (t.isNotEmpty() && t.last() in ENDS) masking = false
            } else {
                out.add(t)
                if (w in TRIGGERS && t.last() !in ENDS) {
                    val next = tokens.getOrNull(i + 1)?.let { word(it) }
                    if (next != null && next.isNotEmpty() && next !in SKIP_NEXT) masking = true
                }
            }
        }
        return out.joinToString(" ").take(MAX)
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
