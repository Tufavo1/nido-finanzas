// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test

/** Aviso real reportado: «Pagaste $100 a tu CMR Mastercard Premium. Revisa mas detalles en tu app». No trae comercio, solo la tarjeta. */
class CmrNoticeTest {
    private val p = NotificationParser(setOf("cl.demo.cmr"))
    private fun parse(t: String) = p.parseDetailed("cl.demo.cmr", null, t, 1_700_000_000_000)

    @Test
    fun `el aviso de pago a la tarjeta CMR es un pago de deuda, no un gasto`() {
        val r = parse("Pagaste \$100 a tu CMR Mastercard Premium. Revisa más detalles en tu app")
        assertNotNull(r.candidate, "rechazo=${r.rejection}")
        val c = r.candidate!!
        assertEquals(100L, c.amountClp)
        assertEquals(Kind.DEBT_PAYMENT, c.kind)
        assertEquals(Confidence.HIGH, c.confidence)
        assertEquals(null, c.merchant)
        assertEquals("CMR Mastercard Premium", c.account)
    }

    @Test
    fun `con titulo y sin tildes tambien`() {
        val r = p.parseDetailed("cl.demo.cmr", "CMR Falabella", "Pagaste \$12.990 a tu CMR Mastercard. Revisa mas detalles en tu app", 1L)
        assertEquals(12_990L, r.candidate?.amountClp)
        assertEquals(Confidence.HIGH, r.candidate?.confidence)
    }

    @Test
    fun `una tarjeta que no es CMR sigue sin inventar comercio`() {
        val c = parse("Pagaste \$5.000 a tu tarjeta Visa").candidate
        assertEquals(null, c?.merchant)
    }

    @Test
    fun `compra con comercio y ciudad queda como gasto sin la ciudad`() {
        val c = parse("Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl").candidate!!
        assertEquals(6_778L, c.amountClp); assertEquals(Kind.EXPENSE, c.kind); assertEquals(Confidence.HIGH, c.confidence)
        assertEquals("Ganaderia Rio Bueno S.a", c.merchant)
    }

    @Test
    fun `Recibiste es un ingreso, nunca un gasto`() {
        val c = parse("Recibiste \$1.000").candidate!!
        assertEquals(1_000L, c.amountClp); assertEquals(Kind.INCOME, c.kind)
    }

    @Test
    fun `ciudad con pais de tres letras se corta solo si es el final del aviso`() {
        assertEquals("Cafe Demo", parse("Compraste \$2.000 en Cafe Demo Valparaiso Chl").candidate?.merchant)
        assertEquals("Tienda Chl Demo", parse("Compraste \$2.000 en Tienda Chl Demo").candidate?.merchant)
    }
}
