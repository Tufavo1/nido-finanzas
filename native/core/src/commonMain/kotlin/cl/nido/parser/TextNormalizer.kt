// Copyright (c) 2026 Dinovance
package cl.nido.parser

internal object TextNormalizer {
    private val WHITESPACE = Regex("\\s+")

    // Sin java.text.Normalizer (no existe en common): tildes y dieresis del espanol y lenguas cercanas, a mano.
    private const val ACCENTED = "áàäâãåéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ"
    private const val PLAIN = "aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC"

    /** Minusculas, sin tildes y con espacios simples: solo para comparar palabras clave, no para mostrar. */
    fun forKeywords(text: String): String {
        val plain = buildString(text.length) {
            for (c in text) {
                val i = ACCENTED.indexOf(c)
                append(if (i >= 0) PLAIN[i] else c)
            }
        }
        return plain.lowercase().collapseSpaces()
    }

    /** Minusculas y sin tildes, caracter por caracter (misma longitud): sirve para ubicar posiciones en el texto original. */
    fun fold(text: String): String = buildString(text.length) {
        for (c in text) {
            val i = ACCENTED.indexOf(c)
            append((if (i >= 0) PLAIN[i] else c).lowercaseChar())
        }
    }

    /** Minusculas y espacios simples, conservando tildes y letras: base de la huella. */
    fun forFingerprint(text: String): String = text.lowercase().collapseSpaces()

    private fun String.collapseSpaces(): String = WHITESPACE.replace(this, " ").trim()
}
