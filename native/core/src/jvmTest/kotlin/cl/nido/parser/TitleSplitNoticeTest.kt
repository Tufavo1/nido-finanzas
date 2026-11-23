// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Aviso REAL de Banco Falabella en el teléfono: el monto viene en el TÍTULO y el detalle en el cuerpo. Antes solo se leía el
 * cuerpo y salía «no encontré un monto». Diagnóstico real: «Pagaste $### | a tu CMR Mastercard Premium. Revisa mas detalles en tu app.»
 */
class TitleSplitNoticeTest {
    private val pkg = "cl.android"
    private val p = NotificationParser(setOf(pkg))
    private fun parse(title: String?, body: String?) = p.parseDetailed(pkg, title, body, 1_700_000_000_000)

    @Test
    fun `pago a la tarjeta con el monto en el titulo`() {
        val r = parse("Pagaste \$300", "a tu CMR Mastercard Premium. Revisa mas detalles en tu app.")
        assertNotNull(r.candidate, "rechazo=${r.rejection}")
        val c = r.candidate!!
        assertEquals(300L, c.amountClp)
        assertEquals(Kind.DEBT_PAYMENT, c.kind)
        assertEquals("CMR Mastercard Premium", c.account)
    }

    @Test
    fun `compra con todo en el titulo y sin cuerpo`() {
        val c = parse("Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl", null).candidate
        assertNotNull(c)
        assertEquals(6_778L, c!!.amountClp)
        assertEquals(Kind.EXPENSE, c.kind)
        assertEquals("Ganaderia Rio Bueno S.a", c.merchant)
    }

    @Test
    fun `compra con el monto en el titulo y el comercio en el cuerpo`() {
        val c = parse("Compraste \$6.778", "en Ganaderia Rio Bueno S.a Santiago Chl. Con tu Débito Banco Falabella")?.candidate
        assertNotNull(c)
        assertEquals(6_778L, c!!.amountClp)
        assertEquals(Kind.EXPENSE, c.kind)
        assertEquals("Ganaderia Rio Bueno S.a", c.merchant)
    }

    @Test
    fun `ingreso con el verbo en el titulo y el mismo monto en el cuerpo`() {
        val c = parse("Recibiste \$1.000", "Te transfirieron \$1.000 a tu Cuenta Banco Falabella. Ingresa a la app").candidate
        assertNotNull(c)
        assertEquals(1_000L, c!!.amountClp)
        assertEquals(Kind.INCOME, c.kind)
    }

    @Test
    fun `un titulo con otro monto no pisa el monto del cuerpo`() {
        val c = parse("Aviso \$9.990", "Compraste \$5.000 en Tienda Demo").candidate
        assertEquals(5_000L, c?.amountClp)
    }

    @Test
    fun `sin monto en ningun lado sigue rechazado`() {
        assertNull(parse("Banco Falabella", "Revisa tu app").candidate)
        assertNull(parse(null, null).candidate)
    }
}
