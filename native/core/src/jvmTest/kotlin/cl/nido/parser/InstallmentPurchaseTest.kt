// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Decision del dueno (2026-11-24): una compra en cuotas con tarjeta de credito se registra por el TOTAL (lo que se debe y lo que usa
 * del cupo) y queda SIEMPRE pendiente; las cuotas se conservan como dato. El cobro de una cuota de una compra anterior no es gasto nuevo.
 * Textos SINTETICOS con el formato de los avisos de Banco Falabella/CMR.
 */
class InstallmentPurchaseTest {
    private val bankPkg = "cl.demo.cmr"
    private val walletPkg = "cl.demo.wallet"
    private val p = NotificationParser(setOf(bankPkg, walletPkg))
    private val post = 1_795_000_000_000L
    private val offset = -3L * 60 * 60 * 1000
    private val auto = CaptureSettings(CaptureMode.AUTO, 50_000L)

    private fun bank(t: String) = p.parseDetailed(bankPkg, null, t, post, NoticeStyle.BANK, offset)
    private fun wallet(title: String?, t: String) = p.parseDetailed(walletPkg, title, t, post, NoticeStyle.WALLET, offset)
    private fun c(r: ParseResult): ParsedCandidate { assertNotNull(r.candidate, "rechazo=${r.rejection}"); return r.candidate!! }

    @Test
    fun `N cuotas de X con el total, el monto es el TOTAL y las cuotas quedan como dato`() {
        val r = bank("Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard")
        val x = c(r)
        assertEquals(30_000L, x.amountClp)
        assertNull(x.installment, "el monto no es una cuota")
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, 10_000L), x.installmentPlan)
        assertEquals("Prueba-Emu", x.merchant)
        assertEquals(PaymentMedium.CREDIT, x.medium)
        assertEquals(Kind.EXPENSE, x.kind)
        assertFalse(r.ambiguousAmount, "el total es claro: no es monto ambiguo")
        assertFalse(x.installmentTotalUnknown)
    }

    @Test
    fun `en N cuotas sin el valor de la cuota, total y cuota desconocida, no ambiguo`() {
        val r = bank("Compraste \$45.000 en Tienda Demo en 3 cuotas Con tu CMR Mastercard")
        val x = c(r)
        assertEquals(45_000L, x.amountClp); assertNull(x.installment)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, null), x.installmentPlan)
        assertEquals("Tienda Demo", x.merchant)
        assertFalse(r.ambiguousAmount)
    }

    @Test
    fun `cuotas sin interes con y sin valor de cuota`() {
        val a = c(bank("Compraste \$30.000 en Tienda Demo en 3 cuotas sin interés de \$10.000 Con tu CMR Mastercard"))
        assertEquals(30_000L, a.amountClp); assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, 10_000L), a.installmentPlan)
        val b = c(bank("Compraste \$30.000 en Tienda Demo en 3 cuotas sin interés Con tu CMR Mastercard"))
        assertEquals(30_000L, b.amountClp); assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, null), b.installmentPlan)
    }

    @Test
    fun `fixture F04 - primera cuota informada aparte, total 45000`() {
        val x = c(bank("Compra en 3 cuotas sin interés por \$45.000 en PRUEBA ELECTRO. Primera cuota: \$15.000."))
        assertEquals(45_000L, x.amountClp); assertNull(x.installment)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, 15_000L), x.installmentPlan)
    }

    @Test
    fun `compra con intereses - el total va antes de las cuotas aunque N por cuota no calce`() {
        val x = c(bank("Compraste \$30.000 en Tienda Demo en 3 cuotas de \$11.200 Con tu CMR Mastercard"))
        assertEquals(30_000L, x.amountClp); assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, 11_200L), x.installmentPlan)
    }

    @Test
    fun `12 cuotas de 9990 sin total, no se inventa el total, monto ambiguo y la cuota como dato`() {
        val r = bank("Compraste en Tienda Demo en 12 cuotas de \$9.990 Con tu CMR Mastercard")
        val x = c(r)
        assertEquals(9_990L, x.amountClp, "no se multiplica: 12 x 9.990 podria no ser el total")
        assertEquals(Installment(1, 12), x.installment, "el monto es UNA cuota")
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 12, 9_990L), x.installmentPlan)
        assertTrue(r.ambiguousAmount)
        assertTrue(x.installmentTotalUnknown)
    }

    @Test
    fun `cobro de cuota 2 de 6 de una compra anterior, no es compra nueva ni suma el total`() {
        val r = bank("Cuota 2 de 6 por \$15.000 en Tienda Demo Con tu CMR Mastercard")
        val x = c(r)
        assertEquals(15_000L, x.amountClp)
        assertEquals(Installment(2, 6), x.installment)
        assertEquals(InstallmentPlan(InstallmentRole.PRIOR_CHARGE, 6, 15_000L), x.installmentPlan)
        assertEquals(Kind.EXPENSE, x.kind)
        assertFalse(x.installmentTotalUnknown)
    }

    @Test
    fun `una sola cuota o sin cuotas no es compra en cuotas`() {
        assertNull(c(bank("Compraste \$30.000 en Falabella en 1 cuota con tu CMR")).installmentPlan)
        assertNull(c(bank("Compraste \$12.990 en Tienda Demo Con tu CMR Mastercard")).installmentPlan)
    }

    @Test
    fun `Billetera con cuotas, el total y pendiente`() {
        val x = c(wallet("Tienda Demo", "CLP 30,000 en 3 cuotas · CMR ••5766"))
        assertEquals(30_000L, x.amountClp)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, null), x.installmentPlan)
        assertEquals("Tienda Demo", x.merchant)
    }

    @Test
    fun `toda compra o cuota en cuotas pide confirmar aunque sea de confianza alta y bajo el tope`() {
        for (t in listOf(
            "Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard",
            "Compraste \$45.000 en Tienda Demo en 3 cuotas Con tu CMR Mastercard",
            "Compraste en Tienda Demo en 12 cuotas de \$9.990 Con tu CMR Mastercard",
            "Cuota 2 de 6 por \$15.000 en Tienda Demo Con tu CMR Mastercard",
        )) {
            val x = c(bank(t))
            assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(x, auto, hasLearnedCategory = true), t)
        }
        // Control: la misma compra sin cuotas si se guarda sola
        assertEquals(CaptureDecision.AUTO_SAVE, AutoCaptureRules.decide(c(bank("Compraste \$30.000 en PRUEBA-EMU Con tu CMR Mastercard")), auto, true))
    }
}
