// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** parseDetailed explica por que un aviso no produjo gasto (diagnostico local); parse sigue igual. */
class ParseDetailedTest {
    private val p = NotificationParser(setOf("cl.demo.banco"))
    private fun d(text: String?, title: String? = null) = p.parseDetailed("cl.demo.banco", title, text, 1_700_000_000_000)

    @Test
    fun `una compra normal trae candidato y ningun rechazo`() {
        val r = d("Compra por \$4.500 en Cafe Central con tu tarjeta")
        assertNotNull(r.candidate); assertNull(r.rejection); assertFalse(r.ambiguousAmount)
    }

    @Test
    fun `texto vacio, descartado y sin monto tienen motivo propio`() {
        assertEquals(ParseRejection.NO_TEXT, d("   ").rejection)
        assertEquals(ParseRejection.NO_TEXT, d(null).rejection)
        assertEquals(ParseRejection.DISCARDED, d("Tu clave es 123456, monto \$4.500").rejection)
        assertEquals(ParseRejection.NO_AMOUNT, d("Hola, tienes un mensaje nuevo del banco").rejection)
        assertEquals(ParseRejection.NOT_ALLOWED, p.parseDetailed("cl.otro", null, "Compra por \$4.500", 1L).rejection)
    }

    @Test
    fun `dos montos distintos sin cuotas marcan monto ambiguo pero siguen dando candidato`() {
        val r = d("Compra por \$4.500 en Cafe Central, comision \$9.900")
        assertTrue(r.ambiguousAmount); assertNotNull(r.candidate)
    }

    @Test
    fun `parse y parseDetailed dan el mismo candidato`() {
        val t = "Compra por \$4.500 en Cafe Central"
        assertEquals(p.parse("cl.demo.banco", null, t, 5L), p.parseDetailed("cl.demo.banco", null, t, 5L).candidate)
    }
}
