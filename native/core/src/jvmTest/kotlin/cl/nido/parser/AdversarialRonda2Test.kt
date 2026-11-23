// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource

/** QA ronda 2 sobre las correcciones del parser (textos SINTETICOS). */
class AdversarialRonda2Test {
    private val parser = Fixtures.parser()
    private val at = 1_795_273_230_000L
    private fun parse(text: String) = parser.parse("cl.demo.banco", null, text, at)

    // (f) Formatos con decimales: ningun monto con decimales debe leerse como un numero distinto con confianza alta.
    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = [
        "Compra por \$12,99 en TIENDA DEMO",
        "Compra por \$12.99 en TIENDA DEMO",
        "Compra por \$12,5 en TIENDA DEMO",
    ])
    fun `un monto con decimales de estilo extranjero no se lee como 12 pesos con confianza alta (R2-09)`(text: String) {
        val got = parse(text)
        assertTrue(got == null || got.confidence != Confidence.HIGH, "«$text» dio ${got?.amountClp} con confianza ${got?.confidence}: un gasto de 12 pesos falso, guardable solo en modo automatico")
    }

    // (e) Comercios legitimos que empiezan con digito (7-Eleven, 3B...) pierden el comercio (el filtro «en 3 cuotas» es demasiado amplio).
    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = [
        "Compra por \$12.990 en 7-ELEVEN DEMO|7-Eleven Demo",
        "Compra por \$8.990 en 3B DEMO SPA|3b Demo Spa",
        "Compra por \$5.990 en 99 CENTAVOS DEMO|99 Centavos Demo",
    ])
    fun `un comercio que empieza con digito se conserva (R2-10)`(text: String, merchant: String) {
        assertEquals(merchant.lowercase(), parse(text)?.merchant?.lowercase())
    }

    // EVIDENCIA (deben pasar): montos y comercios legitimos
    @Test
    fun `montos con coma decimal y miles, extranjeros y espacios se leen bien o se descartan (R2-11)`() {
        assertEquals(12_990L, parse("Compra por \$12.990,50 en TIENDA DEMO")?.amountClp)
        assertEquals(1_234_567L, parse("Compra por \$1.234.567,89 en TIENDA DEMO")?.amountClp)
        assertEquals(1_234_567L, parse("Compra por \$1 234 567 en TIENDA")?.amountClp)
        assertNull(parse("Compra por USD 12,99 en SHOP DEMO"))
        assertNull(parse("Compra por 12,99 USD en SHOP"))
        assertNull(parse("Compra por EUR 12,99 en SHOP"))
        assertNull(parse("Compra por \$1,234,567 en TIENDA DEMO"))
    }

    @Test
    fun `comercios con tildes, enie, emoji, ampersand, apostrofe, comillas se conservan (R2-12)`() {
        assertEquals("Café 🍕 Demo", parse("Compra por \$12.990 en CAFÉ 🍕 DEMO")?.merchant)
        assertEquals("Pizza ❤️ Demo", parse("Compra por \$12.990 en PIZZA ❤️ DEMO")?.merchant)
        assertEquals("Ñuñoa Demo", parse("Compra por \$12.990 en Ñuñoa Demo")?.merchant)
        assertEquals("McDonald's Demo", parse("Compra por \$12.990 en McDonald's Demo")?.merchant)
        assertEquals("Tienda “Demo” Spa", parse("Compra por \$12.990 en Tienda “Demo” Spa")?.merchant)
        assertEquals("Cafe Demo", parse("Compra por \$12.990 en Cafe Demo")?.merchant)
    }

    @Test
    fun `un emoji con unidor de ancho cero conserva su secuencia (R2-13)`() {
        // «Chef 👨‍🍳» lleva U+200D; UnsafeChars lo borra y deja dos emoji sueltos (👨🍳). Cosmetico, pero cambia el nombre del comercio.
        assertEquals("Chef 👨‍🍳 Demo", parse("Compra por \$12.990 en CHEF 👨‍🍳 DEMO")?.merchant)
    }

    @Test
    fun `el espacio duro del comercio se normaliza a espacio normal (R2-14)`() {
        // Con U+00A0 el comercio es distinto de «Cafe Demo» para la deduplicacion y para aprender categorias.
        assertEquals("Cafe Demo", parse("Compra por \$12.990 en Cafe\u00A0Demo")?.merchant)
    }
}
