// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.random.Random

/** El parser corre dentro de un servicio del sistema: ningun texto puede hacerlo lanzar (estandares, Backend). */
class RobustnessTest {
    private val parser = Fixtures.parser()
    private val pieces = listOf("$", "1.", "000", ",5", "CLP", "pesos", " en ", " por ", "cuota", " de ", "1", "abono", "\n", "\u0000", "\uD83D", "Ñ", "99999999999999999999", "US$", "*", "(", "\\", "[")

    @Test
    fun `miles de textos aleatorios no lanzan y los montos devueltos son validos`() {
        val random = Random(42)
        repeat(5_000) {
            val text = (1..random.nextInt(1, 25)).joinToString("") { pieces[random.nextInt(pieces.size)] }
            val got = parser.parse("cl.demo.banco", text, text, random.nextLong(0, Long.MAX_VALUE / 2))
            if (got != null) {
                assertTrue(got.amountClp in 1 until MoneyExtractor.MAX_AMOUNT_CLP, "monto fuera de rango: ${got.amountClp}")
                assertTrue((got.merchant?.length ?: 0) <= 60)
            }
        }
    }

    @Test
    fun `un texto enorme se procesa sin fallar`() {
        val huge = "Compra por $1.000 en " + "A".repeat(500_000)
        parser.parse("cl.demo.banco", null, huge, 0L)
    }
}
