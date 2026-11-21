// Copyright (c) 2026 Dinovance
package cl.nido.parser

/**
 * Caracteres que no deben llegar a un nombre de comercio: de control, de formato (invierten o ocultan texto: U+202E,
 * U+200B, U+2066-2069, U+FEFF, U+00AD...) y separadores de linea o parrafo. Permiten suplantar visualmente al comercio (H-10).
 */
object UnsafeChars {
    fun isUnsafe(c: Char): Boolean = when (c.category) {
        CharCategory.CONTROL, CharCategory.FORMAT, CharCategory.LINE_SEPARATOR, CharCategory.PARAGRAPH_SEPARATOR,
        CharCategory.PRIVATE_USE -> true
        else -> false
    }

    fun containsUnsafe(s: String): Boolean = s.indices.any { isUnsafeAt(s, it) }

    /** Quita lo inseguro (los avisos se limpian en vez de rechazarse). */
    fun strip(s: String): String = buildString { s.indices.forEach { if (!isUnsafeAt(s, it)) append(s[it]) } }

    // El unidor de ancho cero (U+200D) entre dos emoji forma una secuencia legitima (👨‍🍳): se conserva (R2-13).
    private fun isUnsafeAt(s: String, i: Int): Boolean {
        val c = s[i]
        if (c == '\u200D' && i > 0 && i < s.lastIndex && isPictographic(s[i - 1]) && isPictographic(s[i + 1])) return false
        return isUnsafe(c)
    }

    private fun isPictographic(c: Char): Boolean = c.isSurrogate() || c == '\uFE0F' || c.code in 0x2190..0x2BFF
}
