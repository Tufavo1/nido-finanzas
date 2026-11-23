// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Variantes realistas de avisos de bancos chilenos (Falabella/CMR, Santander, BancoEstado, Banco de Chile). Textos sinteticos basados en los oficiales. */
class BankNoticeHardeningTest {
    private val p = NotificationParser(setOf("b"))
    private fun parse(t: String) = p.parse("b", null, t, 1_700_000_000_000L)
    private fun kind(t: String) = parse(t)?.kind

    @Test
    fun `reversas, anulaciones y devoluciones nunca son un gasto`() {
        listOf(
            "Reversa de compra por \$6.778 en Ganaderia Rio Bueno con tu Debito Banco Falabella",
            "REVERSA \$6.778 EN LIDER", "Anulaste \$6.778 en Ganaderia Rio Bueno", "Anulacion de compra \$6.778 en Ganaderia Rio Bueno",
            "Se anulo la compra: anulada \$6.778 en Lider", "Devolucion de \$6.778 de Ganaderia Rio Bueno", "Reverso de cargo \$6.778 en Lider",
        ).forEach { assertEquals(Kind.INCOME, kind(it), it) }
    }

    @Test
    fun `montos con CLP antes o despues se leen`() {
        assertEquals(6778L, parse("Compraste 6.778 CLP en Ganaderia Rio Bueno")?.amountClp)
        assertEquals(6778L, parse("Compraste CLP 6.778 en Ganaderia Rio Bueno")?.amountClp)
        assertEquals(6778L, parse("Compraste \$6.778 CLP en Ganaderia Rio Bueno")?.amountClp)
        assertEquals("Ganaderia Rio Bueno", parse("Compraste \$6.778 CLP en Ganaderia Rio Bueno")?.merchant)
    }

    @Test
    fun `tipos de aviso de los bancos`() {
        assertEquals(Kind.EXPENSE, kind("Pagaste \$5.000 en Cafe Central con tu Debito Santander"))
        assertEquals(Kind.EXPENSE, kind("PAGASTE \$5.000 EN CAFE CENTRAL"))
        assertEquals(Kind.EXPENSE, kind("Pagaste \$9.990 a Netflix con tu Credito Banco de Chile"))
        assertEquals(Kind.DEBT_PAYMENT, kind("Pagaste \$34.400 a tu CMR Mastercard Premium. Revisa mas detalles en tu app"))
        assertEquals(Kind.DEBT_PAYMENT, kind("Pagaste \$34.400 14:35 a tu CMR Mastercard Premium"))
        assertEquals(Kind.DEBT_PAYMENT, kind("PAGASTE \$12.000 A TU TARJETA BANCO DE CHILE"))
        assertEquals(Kind.INCOME, kind("Recibiste \$10.000 de Juan Perez en tu Cuenta BancoEstado"))
        assertEquals(Kind.INCOME, kind("Recibiste \$10.000 Te trasnfirieron \$10.000 a tu Cuenta Banco Falabella 2236. !Ingresa a la App y revisa tus movimientos!"))
        assertEquals(Kind.EXPENSE, kind("Compraste \$12.000 en Lider con tu Tarjeta de Credito Santander"))
    }

    @Test
    fun `retiraste es retiro, sin comercio y confianza baja`() {
        val c = parse("Retiraste \$40.000 en cajero Banco Falabella")!!
        assertNull(c.merchant); assertEquals(Confidence.LOW, c.confidence)
    }

    @Test
    fun `compra en cuotas no deja las cuotas como comercio`() {
        assertEquals("Falabella", parse("Compraste \$30.000 en Falabella en 3 cuotas con tu CMR")?.merchant)
    }

    @Test
    fun `la cuenta solo lleva nombre y ultimos 4 digitos`() {
        assertEquals("Cuenta Corriente ·5678", parse("Compraste \$6.778 en Tienda Con tu Cuenta Corriente 12345678")?.account)
        assertEquals("CMR Mastercard ·3456", parse("Compraste \$6.778 en Tienda Con tu CMR Mastercard Terminada en 123456.")?.account)
        assertEquals("Débito Banco Falabella", parse("Compraste \$6.778 en Ganaderia Rio Bueno Santiago Chl Con tu Debito Banco Falabella Si no la realizaste tu, llama al 600 123 4567")?.account)
        assertEquals("Cuenta Bancoestado", parse("Recibiste \$10.000 de Juan Perez en tu Cuenta BancoEstado")?.account)
        assertNull(parse("Recibiste \$10.000 de Juan. Revisa tus movimientos en tu app")?.account)
        assertNull(parse("Compraste \$6.778 en Lider. Mas detalles en tu app")?.account)
    }

    @Test
    fun `en ningun aviso la cuenta contiene mas de cuatro digitos seguidos ni texto largo`() {
        listOf(
            "Compraste \$6.778 en Tienda Con tu Cuenta Corriente 123456789012", "Compraste \$1.000 en X con tu Debito 1234 5678 9012 3456",
            "Pagaste \$34.400 a tu CMR Mastercard Premium 4111111111111111", "Recibiste \$10.000 a tu Cuenta Banco Falabella 22364455",
            "Compraste \$6.778 en Tienda Con tu CMR Mastercard Terminada en 5766. Si no la realisaste tu, revisa los movimientos de tus adicionales en tu app.",
        ).forEach { t ->
            val a = parse(t)?.account
            if (a != null) {
                assertTrue(Regex("\\d{5,}").find(a) == null && a.length <= 70 && !a.contains("revisa", true) && !a.contains("Si no", true), t + " -> " + a)
            }
        }
    }

    @Test
    fun `los avisos oficiales siguen igual`() {
        val g = parse("Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl Con tu Debito Banco Falabella")!!
        assertEquals(Kind.EXPENSE, g.kind); assertEquals(6778L, g.amountClp); assertEquals("Débito Banco Falabella", g.account)
        val c = parse("Compraste \$20.798 en Merpago Joseestebanrom Las Condes Chl Con tu CMR Mastercard PRemium Terminada en 5766. Si no la realisaste tu, revisa los movimientos de tus adicionales en tu app.")!!
        assertEquals("Merpago Joseestebanrom", c.merchant); assertEquals("CMR Mastercard Premium ·5766", c.account)
        assertNotNull(parse("Pagaste \$34.400 a tu CMR Mastercard Premium. Revisa mas detalles en tu app")?.takeIf { it.kind == Kind.DEBT_PAYMENT && it.merchant == null })
    }
}
