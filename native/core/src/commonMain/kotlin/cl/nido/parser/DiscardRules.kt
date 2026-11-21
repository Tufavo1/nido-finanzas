// Copyright (c) 2026 Dinovance
package cl.nido.parser

/**
 * Avisos que nunca son un movimiento a registrar (RF-03). Se evalua ANTES de leer ningun monto,
 * porque un aviso con clave o promocion puede traer un monto que no es un gasto.
 */
internal object DiscardRules {
    private val SECURITY = listOf("clave", "codigo", "contrasena", "password", "otp")
    private val PROMOTION = listOf("oferta", "descuento", "cupon", "promocion", "ahorra", "aprovecha", "sorteo")
    private val BALANCE = listOf("saldo")
    private val REJECTED = listOf("rechazad", "declinad", "no autorizad", "fondos insuficientes")
    private val DEBT_PAYMENT = listOf("pago cuota", "pago de cuota", "pago minimo", "recuerda", "estado de cuenta", "monto facturado", "linea de credito")
    // Avisos de credito, fraude, intentos y rechazos que no son un cobro (H-09).
    private val NOT_CHARGED = listOf("no aprobad", "fallid", "preaprobad", "intent", "reconocemos", "sospechos", "bloqueamos", "no autoriz")
    // Palabras cortas: solo valen enteras ("cupo" si, "cupon" ya esta arriba; "pin" si, "pintura" no).
    private val WHOLE_WORDS = listOf("pin", "token", "ingresa", "cupo", "gana")
    private val FOREIGN_CURRENCY = Regex("US\\$|\\bUSD\\b|\\bEUR\\b|€|\\bUF\\b", RegexOption.IGNORE_CASE)

    // Cada palabra debe empezar una palabra del aviso: "clave" cuenta, "esclavo" no.
    private val DISCARD_WORDS: Regex =
        ((SECURITY + PROMOTION + BALANCE + REJECTED + DEBT_PAYMENT + NOT_CHARGED).joinToString("|") + "|" + WHOLE_WORDS.joinToString("|", "(?:", ")\\b"))
            .let { "\\b(?:$it)" }
            .toRegex()

    fun shouldDiscard(rawText: String, rawTitle: String?): Boolean {
        if (FOREIGN_CURRENCY.containsMatchIn(rawText)) return true
        val haystack = TextNormalizer.forKeywords(listOfNotNull(rawTitle, rawText).joinToString(" "))
        return DISCARD_WORDS.containsMatchIn(haystack)
    }
}
