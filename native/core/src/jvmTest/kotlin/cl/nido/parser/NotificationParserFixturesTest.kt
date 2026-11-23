// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

/** RF-02 y RF-03: el parser cumple TODOS los fixtures sinteticos (F01-F32 y casos de borde E01-E15). */
class NotificationParserFixturesTest {
    companion object {
        @JvmStatic
        fun fixtures(): List<Fixture> = Fixtures.all
    }

    @Test
    fun `los fixtures estan completos y son sinteticos`() {
        assertEquals(47, Fixtures.all.size)
        for (n in 1..32) assertNotNull(Fixtures.all.find { it.id == "F%02d".format(n) }, "falta F%02d".format(n))
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("fixtures")
    fun `parse cumple el resultado esperado`(f: Fixture) {
        val got = Fixtures.parser().parse(f.packageName, f.title, f.text, f.postedAtMillis)
        val exp = f.expected
        if (exp == null) {
            assertNull(got, "no es un movimiento: debe devolver null")
            return
        }
        assertNotNull(got, "es un movimiento: no debe devolver null")
        got!!
        assertEquals(exp.amountClp, got.amountClp, "monto")
        assertEquals(exp.kind, got.kind, "tipo")
        assertEquals(exp.confidence, got.confidence, "confianza")
        assertEquals(exp.installment, got.installment, "cuota")
        // En abonos y devoluciones el comercio no se exige: no se propone gasto.
        if (exp.kind == Kind.EXPENSE) {
            if (exp.merchant == null) assertTrue(got.merchant.isNullOrBlank(), "sin comercio: debe quedar vacio, fue '${got.merchant}'")
            else assertEquals(exp.merchant, got.merchant, "comercio")
        }
        assertTrue(got.fingerprint.isNotBlank(), "toda captura lleva huella")
    }
}
