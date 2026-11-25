// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import org.json.JSONArray
import org.json.JSONObject

/** Motivo tipificado de por que un aviso no produjo (o no se guardo solo como) gasto. */
enum class DiagReason {
    PACKAGE_NOT_ALLOWED, NO_SESSION, NO_PROFILE, NOT_AN_EXPENSE, INCOME, AMBIGUOUS_AMOUNT, NO_AMOUNT, LOW_CONFIDENCE, DUPLICATE, QUEUE_FULL,
    CAP_EXCEEDED, CATEGORY_UNKNOWN, BANK_OFF, NOTIFICATIONS_OFF,
    /** La fecha del texto («20 nov») queda a mas de 36 h del dia en que llego el aviso: aviso viejo reentregado, no se guarda solo. */
    STALE_DATE,
    /** Compra en otra moneda (USD, EUR, UF...): no se guarda como pesos; la persona la anota a mano con el monto en pesos. */
    FOREIGN_CURRENCY,
    /** Compra en cuotas con tarjeta de credito: se anota por el TOTAL y la persona la confirma (nunca se guarda sola). */
    INSTALLMENT_PURCHASE,
    /** Compra en cuotas cuyo aviso no dice el total: el monto es UNA cuota y la persona debe poner el total. */
    INSTALLMENT_TOTAL_UNKNOWN,
    /** Cobro de una cuota de una compra anterior («Cuota 2 de 6»): no es un gasto nuevo; la persona decide. */
    INSTALLMENT_CHARGE,
    /**
     * Aviso de una fuente que la persona tenia encendida pero que hoy NO esta verificada (BankPresets.VERIFIED): no se lee su texto, no
     * crea borrador ni se guarda solo. Va sin texto ni forma del aviso. Se apaga desde Gastos automaticos («Ya no disponible por ahora»).
     */
    SOURCE_UNAVAILABLE,
}

/** [shape]: que campos traia el aviso y su largo (sin contenido); null en diagnosticos antiguos o si no se leyo el aviso. */
data class DiagEntry(val atMillis: Long, val bankId: String?, val reason: DiagReason, val maskedText: String, val shape: NoticeShape? = null)

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

    // Palabras que se dejan legibles en el modo estricto: formato del aviso, no datos de la persona.
    private val KEEP = setOf(
        "clp", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "sept", "set", "oct", "nov", "dic", "hoy", "ayer", "de", "en", "a", "con", "tu",
        "compra", "compraste", "pago", "pagaste", "reembolso", "devolucion", "visa", "mastercard", "debito", "credito", "tarjeta", "billetera", "google", "wallet",
    )

    /**
     * Modo estricto (Billetera Google): el comercio va AL INICIO, sin «en» que lo anuncie, asi que [mask] lo dejaria legible. Aqui toda
     * palabra queda con su inicial y «*» salvo las de formato ([KEEP]); los digitos, «#». Mismo tope.
     */
    fun maskStrict(text: String?): String {
        val digits = buildString { for (c in text.orEmpty().take(SOURCE_MAX)) append(if (c.isDigit()) '#' else if (c == '\n' || c == '\r' || c == '\t') ' ' else c) }
        return digits.split(' ').joinToString(" ") { t -> if (word(t) in KEEP) t else hide(t) }.take(MAX)
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
class DiagnosticsLog(private val store: TextStore, onFailure: (String) -> Unit = {}, private val clock: () -> Long) {
    // Agregar lee con readChecked y, ante un fallo pasajero, NO pisa el historial: la entrada espera en memoria (R7, CheckedJsonList)
    private val entries = CheckedJsonList(store, ::parse, ::encode, MAX, onFailure)

    @Synchronized
    fun list(): List<DiagEntry> = entries.view()

    @Synchronized
    fun add(reason: DiagReason, bankId: String?, rawText: String?, shape: NoticeShape? = null, strict: Boolean = false) {
        val e = DiagEntry(clock(), bankId, reason, if (strict) MaskText.maskStrict(rawText) else MaskText.mask(rawText), shape)
        entries.update { items -> (listOf(e) + items.filterNot { it == e }).take(MAX) }
    }

    @Synchronized
    fun clear() = entries.clear()

    /**
     * «Borrar» de una entrada: quita las de esa hora y devuelve cuantas quito (0 si no habia: no reescribe nada). LANZA si no se pudo
     * leer o escribir: un fallo pasajero del Keystore no se toma como «lista vacia» y no pisa lo guardado.
     */
    @Synchronized
    fun removeAt(atMillis: Long): Int {
        // Lo que esperaba en memoria se escribe antes (si se puede), para que no reaparezca despues de borrarlo
        entries.flush()
        val items = parse(store.readChecked())
        val keep = items.filterNot { it.atMillis == atMillis }
        val removed = items.size - keep.size
        if (removed > 0) store.writeChecked(if (keep.isEmpty()) null else encode(keep))
        return removed
    }

    /**
     * «Borrar todos»: borra el bloque cifrado y su copia en cuarentena (.bad) y devuelve cuantas habia. LANZA (sin borrar) si la lectura
     * falla de forma pasajera: la persona reintenta. Un bloque ilegible para siempre ya quedo apartado y se cuenta como 0.
     */
    @Synchronized
    fun clearAll(): Int {
        val count = parseOrEmpty(store.readChecked()).size + entries.pendingCount
        store.writeChecked(null)
        entries.discardPending()
        return count
    }

    private fun parseOrEmpty(raw: String?): List<DiagEntry> = try {
        parse(raw)
    } catch (e: Exception) {
        emptyList()
    }

    /** Lanza si el JSON esta dañado (no se adivina que borrar). */
    private fun parse(raw: String?): List<DiagEntry> {
        val a = JSONArray(raw ?: "[]")
        return (0 until a.length()).map {
            val o = a.getJSONObject(it)
            DiagEntry(o.getLong("at"), if (o.isNull("bank")) null else o.getString("bank"), DiagReason.valueOf(o.getString("reason")), o.getString("text"), o.optJSONObject("shape")?.let(NoticeShape::fromJson))
        }
    }

    private fun encode(items: List<DiagEntry>): String {
        val a = JSONArray()
        items.forEach { a.put(JSONObject().put("at", it.atMillis).put("bank", it.bankId ?: JSONObject.NULL).put("reason", it.reason.name).put("text", it.maskedText).put("shape", it.shape?.toJson() ?: JSONObject.NULL)) }
        return a.toString()
    }

    companion object {
        const val MAX = 20
    }
}

/**
 * Argumentos de `clearDiagnostics` del puente: sin la clave `atMillis` = borrar todas; con un entero >= 0 = borrar esa hora. Cualquier
 * otro valor (null, texto, decimal, negativo, fuera de rango) es invalido (null): NUNCA se interpreta como «borrar todas».
 */
sealed class DiagClearRequest {
    object All : DiagClearRequest()

    data class At(val atMillis: Long) : DiagClearRequest()

    companion object {
        const val KEY = "atMillis"

        fun parse(data: JSONObject): DiagClearRequest? {
            if (!data.has(KEY)) return All
            val at = when (val v = data.opt(KEY)) {
                is Int -> v.toLong()
                is Long -> v
                // Un numero JS puede llegar como Double: solo si es entero exacto y cabe en Long
                is Double -> if (v.isFinite() && v == Math.rint(v) && kotlin.math.abs(v) < MAX_EXACT) v.toLong() else return null
                else -> return null
            }
            return if (at >= 0) At(at) else null
        }

        /** 2^53: sobre eso un Double ya no representa enteros exactos. */
        private const val MAX_EXACT = 9_007_199_254_740_992.0
    }
}
