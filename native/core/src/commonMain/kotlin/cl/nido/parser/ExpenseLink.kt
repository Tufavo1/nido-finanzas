// Copyright (c) 2026 Dinovance
package cl.nido.parser

/** Resultado de validar nido://gasto?monto=..&comercio=..&fecha=.. (RF-27). */
sealed class ExpenseLink {
    /** [date] en formato AAAA-MM-DD, o null (= hoy). */
    data class Valid(val amountClp: Long, val merchant: String?, val date: String?) : ExpenseLink()

    data class Invalid(val reason: String) : ExpenseLink()
}

/** Una sola implementacion de la validacion del enlace profundo para Android e iOS (TypeScript la repite como segunda capa). */
object ExpenseLinkParser {
    private const val MAX_MERCHANT = 60
    private const val MAX_AMOUNT_DIGITS = 10
    private val SHAPE = Regex("^nido://gasto(?:\\?([^#]*))?$", RegexOption.IGNORE_CASE)
    private val AMOUNT = Regex("^[0-9]{1,$MAX_AMOUNT_DIGITS}$")
    private val DATE = Regex("^([0-9]{4})-([0-9]{2})-([0-9]{2})$")

    /** [todayYear], [todayMonth] (1-12) y [todayDay]: la fecha de hoy, explicita para poder probar. */
    fun parse(url: String, todayYear: Int, todayMonth: Int, todayDay: Int): ExpenseLink {
        val shape = SHAPE.find(url) ?: return invalid("El enlace no es de Contigo.")
        val params = parseQuery(shape.groupValues[1])
        val amount = readAmount(params["monto"]) ?: return invalid("El monto debe ser un numero entero de pesos valido.")
        val merchant = readMerchant(params["comercio"])
        if (merchant is MerchantResult.Bad) return invalid("El comercio no es valido.")
        val date = readDate(params["fecha"]?.singleOrNull(), todayYear, todayMonth, todayDay)
        return ExpenseLink.Valid(amount, (merchant as MerchantResult.Ok).value, date)
    }

    private fun invalid(reason: String) = ExpenseLink.Invalid(reason)

    private sealed class MerchantResult {
        data class Ok(val value: String?) : MerchantResult()
        object Bad : MerchantResult()
    }

    // Monto ausente o repetido (ambiguo) = invalido.
    private fun readAmount(values: List<String>?): Long? {
        val raw = values?.singleOrNull() ?: return null
        if (!AMOUNT.matches(raw)) return null
        return raw.toLong().takeIf(ClpAmount::isValid)
    }

    private fun readMerchant(values: List<String>?): MerchantResult {
        if (values == null) return MerchantResult.Ok(null)
        val raw = values.singleOrNull() ?: return MerchantResult.Bad
        if (UnsafeChars.containsUnsafe(raw)) return MerchantResult.Bad
        val merchant = raw.trim()
        if (merchant.length > MAX_MERCHANT) return MerchantResult.Bad
        return MerchantResult.Ok(merchant.ifEmpty { null })
    }

    /** Fecha existente y no futura, o null (= hoy), igual que el parser de avisos (RF-02). */
    private fun readDate(raw: String?, ty: Int, tm: Int, td: Int): String? {
        val m = raw?.let { DATE.find(it) } ?: return null
        val (y, mo, d) = m.groupValues.drop(1).map { it.toInt() }
        val exists = mo in 1..12 && d in 1..daysInMonth(y, mo)
        val notFuture = (y * 10_000 + mo * 100 + d) <= (ty * 10_000 + tm * 100 + td)
        return if (exists && notFuture) raw else null
    }

    private fun daysInMonth(year: Int, month: Int): Int = when (month) {
        2 -> if (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) 29 else 28
        4, 6, 9, 11 -> 30
        else -> 31
    }

    private fun parseQuery(query: String): Map<String, List<String>> {
        val out = LinkedHashMap<String, MutableList<String>>()
        if (query.isEmpty()) return out
        for (pair in query.split('&')) {
            if (pair.isEmpty()) continue
            val eq = pair.indexOf('=')
            val key = decode(if (eq < 0) pair else pair.substring(0, eq))
            val value = if (eq < 0) "" else decode(pair.substring(eq + 1))
            out.getOrPut(key) { mutableListOf() }.add(value)
        }
        return out
    }

    /** Decodifica %XX (UTF-8) y "+" como espacio, igual que URLSearchParams; un %XX roto queda literal. */
    private fun decode(s: String): String {
        val bytes = ArrayList<Byte>(s.length)
        var i = 0
        while (i < s.length) {
            val c = s[i]
            val hex = if (c == '%' && i + 2 < s.length + 0 && i + 2 <= s.length - 1) s.substring(i + 1, i + 3).toIntOrNull(16) else null
            when {
                hex != null -> { bytes.add(hex.toByte()); i += 3 }
                c == '+' -> { bytes.add(' '.code.toByte()); i++ }
                else -> { c.toString().encodeToByteArray().forEach(bytes::add); i++ }
            }
        }
        return bytes.toByteArray().decodeToString()
    }
}
