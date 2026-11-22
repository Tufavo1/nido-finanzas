// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.MaskText
import cl.dinovance.contigo.sync.ApiBasePolicy
import cl.dinovance.contigo.sync.ApiBasePolicy.Decision
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HardeningRonda4Test {
    private val base = "https://contigo.demo.test/supabase"

    @Test
    fun `S-18 la primera direccion valida se acepta`() {
        assertEquals(Decision.Accept(base), ApiBasePolicy.decide(null, base))
        assertEquals(Decision.Accept(null), ApiBasePolicy.decide(null, null))
    }

    @Test
    fun `S-18 el mismo origen se acepta aunque cambie la ruta o las mayusculas del host`() {
        assertEquals(Decision.Accept("https://contigo.demo.test/otra"), ApiBasePolicy.decide(base, "https://contigo.demo.test/otra"))
        assertEquals(Decision.Accept("https://CONTIGO.demo.test/supabase"), ApiBasePolicy.decide(base, "https://CONTIGO.demo.test/supabase"))
        assertEquals(Decision.Accept("https://contigo.demo.test:443/supabase"), ApiBasePolicy.decide(base, "https://contigo.demo.test:443/supabase"))
    }

    @Test
    fun `S-18 otro host, subdominio, puerto, http, con usuario o borrar la direccion se rechazan`() {
        listOf("https://evil.test/supabase", "https://contigo.demo.test.evil.test/x", "https://x.contigo.demo.test/x", "https://contigo.demo.test:8443/x")
            .forEach { assertEquals(it, Decision.Reject("API_BASE_LOCKED"), ApiBasePolicy.decide(base, it)) }
        assertEquals(Decision.Reject("API_BASE_LOCKED"), ApiBasePolicy.decide(base, null))
        assertEquals(Decision.Reject("INVALID_ARGUMENT"), ApiBasePolicy.decide(base, "https://user@contigo.demo.test/x"))
        assertEquals(Decision.Reject("INVALID_ARGUMENT"), ApiBasePolicy.decide(base, "http://contigo.demo.test/x"))
        assertEquals(Decision.Reject("INVALID_ARGUMENT"), ApiBasePolicy.decide(null, "http://x.test"))
        assertEquals(Decision.Reject("INVALID_ARGUMENT"), ApiBasePolicy.decide(null, "https://" + "a".repeat(250)))
        assertEquals(Decision.Reject("INVALID_ARGUMENT"), ApiBasePolicy.decide(null, "https://"))
    }

    @Test
    fun `S-20 el texto enmascarado tiene tope de 120 y oculta comercio y personas tras en, de, desde y a`() {
        val m = MaskText.mask("Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl Con tu Debito Banco Falabella")
        assertTrue(m, m.startsWith("Compraste \$#.### en G") && m.contains("Con tu Debito Banco Falabella"))
        assertFalse(m, listOf("anaderia", "Rio", "Bueno", "antiago").any { m.contains(it) })
        assertEquals("Pagaste \$#.### en C*** C******.", MaskText.mask("Pagaste \$5.000 en Cafe Central."))
        val t = MaskText.mask("Transferencia de JUAN PEREZ por \$25.000 desde tu cuenta ****1234")
        assertFalse(t, t.contains("UAN") || t.contains("EREZ")); assertTrue(t, t.contains("por \$##.###") && t.contains("desde tu cuenta"))
        assertEquals("Recibiste \$##.### de J*** P**** en tu Cuenta", MaskText.mask("Recibiste \$10.000 de Juan Perez en tu Cuenta"))
        assertEquals(120, MaskText.mask("x ".repeat(500)).length)
    }

    @Test
    fun `S-20 sin comercio ni persona el aviso queda legible para mejorar el parser y los digitos siempre se ocultan`() {
        val m = MaskText.mask("Pagaste \$34.400 a tu CMR Mastercard Premium. Revisa mas detalles en tu app")
        assertEquals("Pagaste \$##.### a tu CMR Mastercard Premium. Revisa mas detalles en tu app", m)
        assertTrue(MaskText.mask("codigo 123456 cuenta 22364455").none { it.isDigit() })
    }
}
