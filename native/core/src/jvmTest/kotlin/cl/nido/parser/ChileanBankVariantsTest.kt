// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Robustez GENERICA del parser frente a variantes tipicas de avisos de banco en Chile (Compra aprobada, Cargo, Giro, Abono, Pago de
 * cuenta, Transferencia; con o sin tildes, en mayusculas, «$» pegado o con espacio, miles con punto, «CLP»). Textos SINTETICOS:
 * no copian ni atribuyen avisos de ningun banco. Los unicos avisos reales verificados son los de Banco Falabella/CMR
 * (FalabellaNoticesTest); Santander, BancoEstado y Banco de Chile NO tienen avisos reales verificados.
 * Regla: ante la duda el aviso queda para que decida la persona (AutoCaptureRules = ASK), nunca se adivina un guardado solo.
 */
class ChileanBankVariantsTest {
    private val p = NotificationParser(setOf("b"))
    private fun parse(t: String, title: String? = null) = p.parse("b", title, t, 1_700_000_000_000L)
    private fun must(t: String, title: String? = null): ParsedCandidate = parse(t, title).also { assertNotNull(it, t) }!!
    private val auto = CaptureSettings(CaptureMode.AUTO, 1_000_000)
    private fun asks(c: ParsedCandidate) = AutoCaptureRules.decide(c, auto, hasLearnedCategory = true) == CaptureDecision.ASK

    @Test
    fun `compra aprobada en todas sus formas`() {
        listOf(
            "Compra aprobada por \$12.990 en LIDER EXPRESS",
            "COMPRA APROBADA POR \$12.990 EN LIDER EXPRESS",
            "compra aprobada por \$ 12.990 en Lider Express",
            "Compra aprobada por\$12.990 en Lider Express",
            "Compra aprobada por \$12990 en Lider Express",
            "Compra aprobada por CLP 12.990 en Lider Express",
            "Compra aprobada por 12.990 CLP en Lider Express",
            "Compra aprobada por \$12.990,00 en Lider Express",
            "Compra aprobada por \$ 12.990 en Lider Express",
            "Compra aprobada por 12.990 pesos en Lider Express",
        ).forEach { t ->
            val c = must(t)
            assertEquals(12_990L, c.amountClp, t); assertEquals(Kind.EXPENSE, c.kind, t)
            assertEquals("Lider Express", c.merchant, t); assertEquals(Confidence.HIGH, c.confidence, t)
        }
    }

    @Test
    fun `compra aprobada con el detalle en el cuerpo y el titulo sin monto`() {
        val c = must("Por \$12.990 en ALMACEN DEMO con tu tarjeta terminada en 0000", title = "Compra aprobada")
        assertEquals(12_990L, c.amountClp); assertEquals("Almacen Demo", c.merchant); assertEquals(Kind.EXPENSE, c.kind)
    }

    @Test
    fun `cargo con comercio es gasto, sin comercio queda para la persona`() {
        val a = must("Cargo por \$8.000 en Servicio Demo con tu tarjeta de crédito")
        assertEquals(Kind.EXPENSE, a.kind); assertEquals(8_000L, a.amountClp); assertEquals("Servicio Demo", a.merchant)
        val b = must("CARGO EN TU CUENTA \$8.000")
        assertEquals(Kind.EXPENSE, b.kind); assertNull(b.merchant); assertEquals(Confidence.MEDIUM, b.confidence)
        assertEquals(true, asks(b))
    }

    @Test
    fun `giro es un retiro de efectivo, con o sin tilde, y nunca se guarda solo`() {
        listOf("Giro de \$20.000 en cajero automatico", "GIRO EN CAJERO POR \$20.000", "Giraste \$20.000 en cajero", "Giro realizado por \$20.000 en cajero automático").forEach { t ->
            val c = must(t)
            assertEquals(Kind.EXPENSE, c.kind, t); assertEquals(20_000L, c.amountClp, t)
            assertNull(c.merchant, t); assertEquals(Confidence.LOW, c.confidence, t)
            assertEquals(true, asks(c), t)
        }
    }

    @Test
    fun `abono y deposito son ingreso que revisa la persona`() {
        listOf("Abono de \$50.000 en tu cuenta", "ABONO EN TU CUENTA POR \$50.000", "Depósito recibido por \$50.000", "Deposito de \$ 50.000 en tu cuenta").forEach { t ->
            val r = p.parseDetailed("b", null, t, 1_700_000_000_000L)
            assertEquals(Kind.INCOME, r.candidate?.kind, t); assertEquals(50_000L, r.candidate?.amountClp, t)
            assertFalse(r.extraIncome, t) // no es «Recibiste»: no se guarda solo como ingreso extra
        }
    }

    @Test
    fun `pago de cuenta de un servicio es gasto con el comercio`() {
        val c = must("Pago de cuenta por \$25.000 a Empresa Demo Luz")
        assertEquals(Kind.EXPENSE, c.kind); assertEquals(25_000L, c.amountClp); assertEquals("Empresa Demo Luz", c.merchant)
        val d = must("PAGO DE CUENTA \$25.000 A EMPRESA DEMO LUZ")
        assertEquals(Kind.EXPENSE, d.kind); assertEquals("Empresa Demo Luz", d.merchant)
    }

    @Test
    fun `transferencias que salen en sus formas habituales`() {
        listOf(
            "Transferencia a Juana Demo por \$15.000",
            "Transferencia de fondos por \$15.000 a Juana Demo",
            "TRANSFERENCIA REALIZADA A JUANA DEMO POR \$15.000",
            "Transferencia electrónica por \$15.000 a Juana Demo",
        ).forEach { t ->
            val c = must(t)
            assertEquals(Kind.TRANSFER_OUT, c.kind, t); assertEquals(15_000L, c.amountClp, t); assertEquals("Juana Demo", c.merchant, t)
            assertEquals(true, asks(c), t) // una transferencia nunca se guarda sola
        }
        assertEquals(Kind.INCOME, must("Transferencia recibida por \$15.000 de Juana Demo").kind)
    }

    @Test
    fun `moneda extranjera y UF se descartan como hoy`() {
        listOf(
            "Compra aprobada por USD 12,99 en Tienda Online", "Compra aprobada por US\$ 20 en Tienda Online", "Cargo por UF 1,5 en Seguro Demo",
            "Compra aprobada por 12,99 usd en Tienda Online", "Cargo por EUR 30 en Tienda",
        ).forEach { assertNull(parse(it), it) }
    }

    @Test
    fun `montos con decimales extranjeros o coma de miles no se adivinan`() {
        assertNull(parse("Compra aprobada por \$12,99 en Tienda"))
        assertNull(parse("Compra aprobada por \$12,990 en Tienda"))
    }

    @Test
    fun `aviso sin monto o solo con texto generico no es movimiento`() {
        assertNull(parse("Compra aprobada en tu tarjeta"))
        assertNull(parse("Tienes un nuevo movimiento. Revisa tu app"))
    }

    @Test
    fun `cualquier variante sin comercio claro o de confianza no alta pide confirmacion`() {
        listOf("Compra aprobada \$12.990", "Cargo \$8.000", "Giro \$20.000", "Pago \$5.000").mapNotNull { parse(it) }.forEach { assertEquals(true, asks(it), it.toString()) }
    }
}
