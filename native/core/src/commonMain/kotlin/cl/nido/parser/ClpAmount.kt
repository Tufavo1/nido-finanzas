// Copyright (c) 2026 Dinovance
package cl.nido.parser

/** Importes en pesos chilenos: enteros, sin centavos, con limite de la columna amount de la base. */
object ClpAmount {
    /** El monto debe ser menor a este valor (limite de la columna). */
    const val MAX_EXCLUSIVE = 10_000_000_000L

    fun isValid(amount: Long): Boolean = amount in 1 until MAX_EXCLUSIVE

    /** "1.250.000" o "4500" (digitos con puntos de miles) a pesos; null si no es un monto valido. */
    fun parse(digits: String): Long? = digits.replace(".", "").toLongOrNull()?.takeIf(::isValid)

    /** 12990 -> "$12.990", sin depender de la configuracion regional. */
    fun format(amount: Long): String = "$" + amount.toString().reversed().chunked(3).joinToString(".").reversed()
}
