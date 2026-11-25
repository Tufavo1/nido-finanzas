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
    private val NOT_CHARGED = listOf("no aprobad", "fallid", "preaprobad", "intent", "reconocemos", "sospechos", "bloqueamos", "no autoriz", "no pagaste", "no compraste", "no transferiste", "no se pudo", "no pudo")
    // Palabras cortas: solo valen enteras ("cupo" si, "cupon" ya esta arriba; "pin" si, "pintura" no).
    private val WHOLE_WORDS = listOf("pin", "token", "ingresa", "cupo", "gana")
    private val FOREIGN_CURRENCY = Regex("US\\$|\\bUSD\\b|\\bEUR\\b|€|\\bUF\\b", RegexOption.IGNORE_CASE)
    // Otras monedas (Billetera Google muestra el codigo ISO junto al monto: «COP 20,000», «ARS 15,000»). Solo en MAYUSCULAS y pegadas a
    // un numero, para no descartar un comercio que contenga esas letras («Pen Drive Store»). Nunca se convierten ni se guardan como pesos.
    private val OTHER_CURRENCY = Regex("\\b(?:COP|ARS|PEN|MXN|BRL|GBP|JPY|CAD|AUD|CHF|CNY|UYU|BOB|PYG)[\\s  ]*\\$?[\\s  ]*\\d|\\d[\\s  ]*(?:COP|ARS|PEN|MXN|BRL|GBP|JPY|CAD|AUD|CHF|CNY|UYU|BOB|PYG)\\b|£|\\bR\\$")

    // Cada palabra debe empezar una palabra del aviso: "clave" cuenta, "esclavo" no.
    private val DISCARD_WORDS: Regex =
        ((SECURITY + PROMOTION + BALANCE + REJECTED + DEBT_PAYMENT + NOT_CHARGED).joinToString("|") + "|" + WHOLE_WORDS.joinToString("|", "(?:", ")\\b"))
            .let { "\\b(?:$it)" }
            .toRegex()

    private val CLOSING_PHRASE = Regex("\\bingresa a (?:la|tu) app(?:licacion)?\\b")

    // «9,99 dólares», «10 dolares»: la palabra pegada a un numero (no basta «dólar» suelto en el nombre de un comercio).
    private val DOLLAR_WORD = Regex("\\d[\\d.,]*[\\s\u00a0]*d[oó]lar(?:es)?\\b", RegexOption.IGNORE_CASE)

    /**
     * Compra en otra moneda (USD, US$, EUR, UF, «dólares», COP...). Nunca se convierte ni se guarda como pesos: el parser responde
     * [ParseRejection.FOREIGN_CURRENCY] para que el diagnostico diga «compra en moneda extranjera, anotala a mano». Es amplio a
     * proposito («Compra en USD por $10» no puede quedar como $10 pesos); el costo es perder un comercio llamado «Usd Store».
     */
    fun isForeignCurrency(rawText: String): Boolean =
        FOREIGN_CURRENCY.containsMatchIn(rawText) || OTHER_CURRENCY.containsMatchIn(rawText) || DOLLAR_WORD.containsMatchIn(rawText)

    /** Claves, promociones, saldo, rechazos, estado de cuenta... La moneda extranjera va aparte ([isForeignCurrency]). */
    fun shouldDiscard(rawText: String, rawTitle: String?): Boolean {
        // «!Ingresa a la App y revisa tus movimientos!» es un cierre habitual de los avisos de movimiento, no una instruccion.
        val haystack = CLOSING_PHRASE.replace(TextNormalizer.forKeywords(listOfNotNull(rawTitle, rawText).joinToString(" ")), " ")
        return DISCARD_WORDS.containsMatchIn(haystack)
    }
}
