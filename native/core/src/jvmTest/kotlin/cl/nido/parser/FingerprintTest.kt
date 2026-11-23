// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** RF-04: huella de deduplicacion (paquete + texto normalizado + monto + minuto). */
class FingerprintTest {
    private val f30 = Fixtures.byId("F30")
    private val parser = Fixtures.parser()
    private val base = f30.postedAtMillis // 12:00:30, mitad del minuto

    private fun fp(pkg: String = f30.packageName, title: String? = f30.title, text: String? = f30.text, at: Long = base): String {
        val c = parser.parse(pkg, title, text, at)
        assertNotNull(c, "el aviso debe ser un movimiento")
        return c!!.fingerprint
    }

    @Test
    fun `el mismo movimiento en dos avisos dentro del mismo minuto tiene la misma huella`() {
        assertEquals(fp(), fp(at = base + 15_000))
    }

    @Test
    fun `el titulo distinto no cambia la huella`() {
        assertEquals(fp(), fp(title = "Otro titulo del mismo aviso"))
    }

    @Test
    fun `mayusculas y espacios de mas no cambian la huella`() {
        assertEquals(fp(), fp(text = "  " + f30.text!!.uppercase().replace(" ", "  ") + " "))
    }

    @Test
    fun `distinto monto da distinta huella`() {
        assertNotEquals(fp(), fp(text = f30.text!!.replace("$6.500", "$6.600")))
    }

    @Test
    fun `distinto minuto da distinta huella`() {
        assertNotEquals(fp(), fp(at = base + 90_000))
    }

    @Test
    fun `distinto comercio con el mismo monto da distinta huella`() {
        assertNotEquals(fp(), fp(text = f30.text!!.replace("CAFE DEMO NORTE", "TIENDA DEMO SUR")))
    }

    @Test
    fun `distinto paquete da distinta huella`() {
        assertNotEquals(fp(), fp(pkg = "cl.demo.billetera"))
    }

    @Test
    fun `la huella es un resumen hexadecimal que no contiene el texto`() {
        val h = fp()
        assertTrue(Regex("^[0-9a-f]{32,}$").matches(h), "esperaba hex de 32+ caracteres, fue '$h'")
        assertTrue(!h.contains("6500") && !h.contains("CAFE", ignoreCase = true))
    }
}
