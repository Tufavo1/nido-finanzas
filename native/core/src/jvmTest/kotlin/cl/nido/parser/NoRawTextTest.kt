// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** NFR-01: ningun resultado incluye el texto bruto del aviso. */
class NoRawTextTest {
    @Test
    fun `ningun campo ni toString contiene el texto bruto ni el titulo`() {
        val movimientos = Fixtures.all.filter { it.expected != null }
        assertTrue(movimientos.isNotEmpty())
        for (f in movimientos) {
            val c = Fixtures.parser().parse(f.packageName, f.title, f.text, f.postedAtMillis)
                ?: error("${f.id}: se esperaba un candidato")
            val text = f.text!!
            val campos = listOfNotNull(c.merchant, c.fingerprint, c.toString())
            for (s in campos) {
                assertFalse(s.contains(text), "${f.id}: el resultado contiene el texto bruto")
                assertFalse(s.contains(text.trim().take(25), ignoreCase = true), "${f.id}: contiene el comienzo del aviso")
            }
            assertFalse(c.toString().contains(f.title!!), "${f.id}: contiene el titulo del aviso")
        }
    }

    @Test
    fun `solo expone los campos del contrato`() {
        val nombres = ParsedCandidate::class.java.declaredFields.map { it.name }.toSet()
        assertTrue(nombres == setOf("amountClp", "merchant", "kind", "confidence", "installment", "fingerprint", "account", "installmentPlan"), "campos: $nombres")
    }
}
