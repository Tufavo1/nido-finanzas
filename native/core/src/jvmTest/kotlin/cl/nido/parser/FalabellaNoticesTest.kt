// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** Avisos OFICIALES de Banco Falabella y CMR, tal como los entrego el dueno. Compraste = gasto, Recibiste = ingreso, Pagaste = pago de deuda. */
class FalabellaNoticesTest {
    private val p = NotificationParser(setOf("cl.demo.cmr"))
    private fun c(t: String) = p.parseDetailed("cl.demo.cmr", null, t, 1_700_000_000_000).let { assertNotNull(it.candidate, "rechazo=${it.rejection} :: $t"); it.candidate!! }

    @Test
    fun `compra con debito`() {
        val x = c("Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl Con tu Debito Banco Falabella")
        assertEquals(Kind.EXPENSE, x.kind); assertEquals(6_778L, x.amountClp); assertEquals(Confidence.HIGH, x.confidence)
        assertEquals("Ganaderia Rio Bueno S.a", x.merchant); assertEquals("Débito Banco Falabella", x.account)
    }

    @Test
    fun `compra con debito en supermercado`() {
        val x = c("Compraste \$4.760 en Sta Isabel Penalolengr Santiago Chl Con tu Debito Banco Falabella")
        assertEquals(Kind.EXPENSE, x.kind); assertEquals(4_760L, x.amountClp)
        assertEquals("Sta Isabel Penalolengr", x.merchant); assertEquals("Débito Banco Falabella", x.account)
    }

    @Test
    fun `compra con tarjeta CMR terminada en cuatro digitos y aviso de seguridad`() {
        val x = c("Compraste \$20.798 en Merpago Joseestebanrom Las Condes Chl Con tu CMR Mastercard PRemium Terminada en 5766. Si no la realisaste tu, revisa los movimientos de tus adicionales en tu app.")
        assertEquals(Kind.EXPENSE, x.kind); assertEquals(20_798L, x.amountClp); assertEquals(Confidence.HIGH, x.confidence)
        assertEquals("Merpago Joseestebanrom", x.merchant); assertEquals("CMR Mastercard Premium ·5766", x.account)
    }

    @Test
    fun `recibiste es ingreso aunque diga Ingresa a la App`() {
        val x = c("Recibiste \$10.000 Te trasnfirieron \$10.000 a tu Cuenta Banco Falabella 2236. !Ingresa a la App y revisa tus movimientos!")
        assertEquals(Kind.INCOME, x.kind); assertEquals(10_000L, x.amountClp); assertNull(x.merchant)
        assertEquals("Cuenta Banco Falabella ·2236", x.account)
        val y = c("Recibiste \$1.000 Te transfirieron \$1.000 a tu Cuenta Banco Falabella 2236. !Ingresa a la App y revisa tus movimientos!")
        assertEquals(Kind.INCOME, y.kind); assertEquals(1_000L, y.amountClp)
    }

    @Test
    fun `pagaste a tu tarjeta es pago de deuda, con o sin hora`() {
        for (t in listOf(
            "Pagaste \$34.400 a tu CMR Mastercard Premium. Revisa más detalles en tu app",
            "Pagaste \$34.400 14:35 a tu CMR Mastercard Premium. Revisa mas detalles en tu app.",
            "Pagaste \$34.400 a las 14:35 a tu CMR Mastercard Premium. Revisa mas detalles en tu app.",
        )) {
            val x = c(t)
            assertEquals(Kind.DEBT_PAYMENT, x.kind, t); assertEquals(34_400L, x.amountClp, t)
            assertNull(x.merchant, t); assertEquals("CMR Mastercard Premium", x.account, t)
        }
    }

    @Test
    fun `pagaste en un comercio sigue siendo gasto`() {
        val x = c("Pagaste \$5.000 en Cafe Demo con tu tarjeta")
        assertEquals(Kind.EXPENSE, x.kind); assertEquals("Cafe Demo", x.merchant)
    }

    @Test
    fun `ciudades de varias palabras se quitan y el nombre del comercio no`() {
        assertEquals("Tienda Demo", c("Compraste \$2.000 en Tienda Demo Vina del Mar Chl Con tu Debito Banco Falabella").merchant)
        assertEquals("Tienda Demo", c("Compraste \$2.000 en Tienda Demo Puente Alto Chl Con tu Debito Banco Falabella").merchant)
        assertEquals("Panaderia Rio Bueno", c("Compraste \$2.000 en Panaderia Rio Bueno Santiago Chl Con tu Debito Banco Falabella").merchant)
    }
}
