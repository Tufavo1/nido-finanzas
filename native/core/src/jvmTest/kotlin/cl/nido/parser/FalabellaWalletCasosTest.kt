// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Casos chilenos de Banco Falabella/CMR y Billetera Google (2026-11-24). Textos SINTETICOS con el formato de los avisos reales de
 * Falabella («Compraste $X en COMERCIO Ciudad Chl Con tu ...»); los de Wallet no estan verificados con avisos reales.
 */
class FalabellaWalletCasosTest {
    private val bankPkg = "cl.demo.cmr"
    private val walletPkg = "cl.demo.wallet"
    private val p = NotificationParser(setOf(bankPkg, walletPkg))
    /** 2026-11-18 16:53 UTC = 13:53 en Santiago (UTC-3). */
    private val post = 1_795_000_000_000L
    private val offset = -3L * 60 * 60 * 1000

    private fun bank(t: String, title: String? = null) = p.parseDetailed(bankPkg, title, t, post, NoticeStyle.BANK, offset)
    private fun wallet(title: String?, t: String) = p.parseDetailed(walletPkg, title, t, post, NoticeStyle.WALLET, offset)
    private fun c(r: ParseResult): ParsedCandidate { assertNotNull(r.candidate, "rechazo=${r.rejection}"); return r.candidate!! }

    // ---------- montos ----------

    @Test
    fun `montos chilenos con y sin signo peso`() {
        assertEquals(1_056_339L, c(bank("Compraste \$1.056.339 en Tienda Demo Santiago Chl Con tu CMR Mastercard Terminada en 5766")).amountClp)
        assertEquals(12_990L, c(bank("Compraste \$12.990 en Tienda Demo")).amountClp)
        assertEquals(12_990L, c(bank("Compraste 12.990 CLP en Tienda Demo")).amountClp)
        assertEquals(12_990L, c(bank("Compraste CLP 12.990 en Tienda Demo")).amountClp)
        assertEquals(12_990L, c(bank("Compraste \$ 12.990 en Tienda Demo")).amountClp)
    }

    @Test
    fun `un numero sin signo ni CLP no es monto (puede ser un codigo)`() {
        val r = bank("Compraste 12.990 en Tienda Demo")
        assertNull(r.candidate); assertEquals(ParseRejection.NO_AMOUNT, r.rejection)
    }

    // ---------- moneda extranjera: nunca como pesos, con su propio motivo ----------

    @Test
    fun `compras en dolares no se guardan como pesos y dicen que son moneda extranjera`() {
        for (t in listOf(
            "Compraste USD 9,99 en NETFLIX.COM con tu CMR",
            "Compraste US\$ 9.99 en Spotify con tu CMR",
            "Compraste 9,99 USD en Steam",
            "Compraste USD 10 en Steam con tu CMR",
            "Compraste 9,99 dólares en Amazon",
            "Compraste USD 9,99 (\$9.450) en Netflix",
        )) {
            val r = bank(t)
            assertNull(r.candidate, t); assertEquals(ParseRejection.FOREIGN_CURRENCY, r.rejection, t)
        }
        for ((title, t) in listOf("Tienda Demo" to "USD 9.99 · Visa ••1234", "Tienda Demo" to "US\$9,99 · Visa ••1234", "Tienda Demo" to "EUR 9,99 · Visa ••1234")) {
            val r = wallet(title, t)
            assertNull(r.candidate, t); assertEquals(ParseRejection.FOREIGN_CURRENCY, r.rejection, t)
        }
    }

    @Test
    fun `un signo peso con decimales tampoco se adivina`() {
        assertNull(bank("Compraste \$9,99 en Amazon").candidate)
        assertNull(bank("Compraste \$9.99 en Amazon").candidate)
    }

    @Test
    fun `una clave con un monto en dolares sigue siendo clave, no compra`() {
        assertEquals(ParseRejection.DISCARDED, bank("Tu código de verificación es 123456 para la compra de USD 9,99").rejection)
    }

    // ---------- cuotas: el monto de la compra no es la cuota ----------

    @Test
    fun `N cuotas de X registra el TOTAL con las cuotas como dato (decision del dueno 2026-11-24)`() {
        val r = bank("Compraste \$30.000 en Falabella en 3 cuotas de \$10.000 con tu CMR")
        val x = c(r)
        assertEquals(30_000L, x.amountClp); assertNull(x.installment)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, 10_000L), x.installmentPlan)
        assertEquals("Falabella", x.merchant); assertFalse(r.ambiguousAmount)
    }

    @Test
    fun `en N cuotas sin el valor de la cuota registra el total y la cuota queda desconocida`() {
        val r = bank("Compraste \$30.000 en Falabella en 3 cuotas con tu CMR")
        assertEquals(30_000L, c(r).amountClp); assertNull(r.candidate!!.installment)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, null), r.candidate!!.installmentPlan)
        assertFalse(r.ambiguousAmount)
        val w = wallet("Tienda Demo", "CLP 30,000 en 3 cuotas · CMR ••5766")
        assertEquals(30_000L, c(w).amountClp); assertFalse(w.ambiguousAmount)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, null), w.candidate!!.installmentPlan)
    }

    @Test
    fun `una sola cuota no es ambigua`() {
        assertFalse(bank("Compraste \$30.000 en Falabella en 1 cuota con tu CMR").ambiguousAmount)
    }

    // ---------- reversos y devoluciones: nunca gasto ----------

    @Test
    fun `reverso, anulacion y devolucion son ingreso que no se guarda solo`() {
        for (t in listOf(
            "Reverso de compra por \$12.990 en Tienda Demo",
            "Se anuló tu compra de \$12.990 en Tienda Demo",
            "Anulamos tu compra de \$12.990 en Tienda Demo",
            "Reversamos tu compra de \$12.990 en Tienda Demo",
            "Devolución de \$12.990 a tu CMR Mastercard",
            "Tu compra de \$12.990 fue devuelta a tu CMR",
        )) {
            val r = bank(t)
            assertEquals(Kind.INCOME, c(r).kind, t); assertFalse(r.extraIncome, t)
        }
    }

    // ---------- claves, promociones, saldo, estado de cuenta: nunca gasto ----------

    @Test
    fun `claves, promociones, saldo y estado de cuenta no son movimiento`() {
        for (t in listOf(
            "Tu clave dinámica es 123456",
            "Código de verificación 482913 para tu compra de \$12.990 en Tienda Demo",
            "Aprovecha 20% en compras sobre \$50.000",
            "Tu estado de cuenta CMR ya está disponible. Monto facturado \$250.000",
            "Tu saldo disponible es \$1.056.339",
            "Pago mínimo \$25.000 de tu CMR vence el 5 dic",
        )) assertNull(bank(t).candidate, t)
    }

    // ---------- pago de tarjeta y avance ----------

    @Test
    fun `pago recibido de la CMR es pago de deuda, nunca gasto`() {
        for (t in listOf("Recibimos tu pago de \$34.400 a tu CMR", "Pago recibido por \$34.400 en tu CMR Mastercard", "Pago de tu CMR por \$34.400 realizado")) {
            val x = c(bank(t))
            assertEquals(Kind.DEBT_PAYMENT, x.kind, t); assertNull(x.merchant, t)
        }
        assertEquals(Kind.EXPENSE, c(bank("Pago aprobado de \$5.000 en Cafe Demo con tu tarjeta")).kind)
    }

    @Test
    fun `avance en efectivo es retiro, sin comercio y de confianza baja`() {
        for (t in listOf("Realizaste un avance de \$100.000 con tu CMR", "Súper Avance aprobado por \$500.000")) {
            val x = c(bank(t))
            assertEquals(Kind.EXPENSE, x.kind, t); assertEquals(Confidence.LOW, x.confidence, t); assertNull(x.merchant, t)
        }
    }

    // ---------- dos montos ----------

    @Test
    fun `dos montos en el mismo aviso quedan pendientes`() {
        val r = bank("Compraste \$12.990 en Tienda Demo. Comisión \$500")
        assertEquals(12_990L, c(r).amountClp); assertTrue(r.ambiguousAmount)
        assertTrue(wallet("Tienda Demo", "CLP 12,990 · CLP 500 · Visa ••1234").ambiguousAmount)
    }

    // ---------- comercio con ruido ----------

    @Test
    fun `comercio en mayusculas con comuna, ciudad y CL al final`() {
        assertEquals("Copec Las Condes", c(bank("Compraste \$25.000 en COPEC LAS CONDES SANTIAGO CL Con tu Debito Banco Falabella")).merchant)
        assertEquals("Panadería La Española", c(bank("Compraste \$8.500 en PANADERÍA LA ESPAÑOLA ÑUÑOA CHL Con tu Debito Banco Falabella")).merchant)
        assertEquals("Copec", c(bank("Compraste \$25.000 en COPEC SANTIAGO CHILE")).merchant)
        // «CL» o «Chile» solo se cortan tras una comuna conocida: el nombre no se mutila
        assertEquals("Farmacia Cl", c(bank("Compraste \$2.000 en FARMACIA CL")).merchant)
    }

    // ---------- credito vs debito ----------

    @Test
    fun `CMR y credito explicito son credito, Redcompra Cuenta Vista CuentaRUT y Debito son debito, la marca sola no dice`() {
        fun medium(t: String) = c(bank(t)).medium
        assertEquals(PaymentMedium.CREDIT, medium("Compraste \$5.000 en Tienda Demo Con tu CMR Mastercard Terminada en 5766"))
        assertEquals(PaymentMedium.CREDIT, medium("Compraste \$5.000 en Tienda Demo con tu Tarjeta de Crédito Visa"))
        assertEquals(PaymentMedium.DEBIT, medium("Compraste \$5.000 en Tienda Demo con tu Redcompra"))
        assertEquals(PaymentMedium.DEBIT, medium("Compraste \$5.000 en Tienda Demo con tu Cuenta Vista"))
        assertEquals(PaymentMedium.DEBIT, medium("Compraste \$5.000 en Tienda Demo con tu CuentaRUT"))
        assertEquals(PaymentMedium.DEBIT, medium("Compraste \$5.000 en Tienda Demo Con tu Debito Banco Falabella"))
        assertEquals(PaymentMedium.UNKNOWN, medium("Compraste \$5.000 en Tienda Demo con tu Visa terminada en 1234"))
        assertEquals(PaymentMedium.UNKNOWN, medium("Compraste \$5.000 en Tienda Demo con tu Mastercard"))
        assertEquals(PaymentMedium.UNKNOWN, c(wallet(null, "Pagaste \$12.990 en COPEC con Visa •••• 1234")).medium)
        assertEquals(PaymentMedium.DEBIT, c(wallet("Tienda Demo", "CLP 12,990 · Mastercard Débito ••4321")).medium)
        assertEquals(PaymentMedium.CREDIT, c(wallet("Tienda Demo", "CLP 12,990 · CMR ••5766")).medium)
    }

    // ---------- avisos viejos ----------

    @Test
    fun `aviso de banco con fecha de otro dia queda marcado como viejo`() {
        assertTrue(bank("Compraste \$5.000 en Tienda Demo el 10 nov").staleDate)
        assertTrue(bank("Compraste \$5.000 en Tienda Demo el 10/11/2026 a las 14:35").staleDate)
        assertTrue(bank("Compraste \$5.000 en Tienda Demo el 10-11-2026").staleDate)
        assertTrue(bank("Compraste \$5.000 en Tienda Demo el 10/11 a las 14:35").staleDate)
        assertFalse(bank("Compraste \$5.000 en Tienda Demo el 18/11/2026 a las 13:50").staleDate)
        assertFalse(bank("Compraste \$5.000 en Tienda Demo el 17 nov").staleDate) // dentro del margen de 36 h
        assertFalse(bank("Compraste \$5.000 en Tienda Demo").staleDate)
        // «Cuota 1/3» no es una fecha
        assertFalse(bank("Compraste \$5.000 en Tienda Demo cuota 1/3").staleDate)
        assertEquals("Tienda Demo", c(bank("Compraste \$5.000 en Tienda Demo el 10/11/2026 a las 14:35")).merchant)
    }

    // ---------- Billetera Google ----------

    @Test
    fun `Wallet en espanol con tarjeta enmascarada`() {
        val x = c(wallet(null, "Pagaste \$12.990 en COPEC con Visa •••• 1234"))
        assertEquals(12_990L, x.amountClp); assertEquals("Copec", x.merchant); assertEquals("Visa ·1234", x.account); assertEquals(Confidence.HIGH, x.confidence)
        val y = c(wallet("COPEC LAS CONDES", "CLP 12,990 · Visa ••1234"))
        assertEquals(12_990L, y.amountClp); assertEquals("Copec Las Condes", y.merchant)
    }

    @Test
    fun `Wallet en ingles no deja Tap to pay como comercio`() {
        val x = c(wallet(null, "Tap to pay: CLP 12,990 at COPEC"))
        assertEquals(12_990L, x.amountClp); assertEquals("Copec", x.merchant)
        assertEquals("Copec", c(wallet(null, "You paid CLP 12,990 at COPEC")).merchant)
    }

    @Test
    fun `Wallet descarta claves y avisos que no son pago`() {
        assertNull(wallet(null, "Tu código de verificación es 123456").candidate)
        assertNull(wallet(null, "Se agregó tu tarjeta Visa ••1234 a Billetera de Google").candidate)
        assertNull(wallet("Tienda Demo", "Pago rechazado · CLP 12,990").candidate)
    }

    @Test
    fun `el aviso del banco y el de Wallet de la misma compra dan el mismo monto (base de la regla cross-fuente)`() {
        val b = c(bank("Compraste \$12.990 en COPEC LAS CONDES SANTIAGO CL Con tu Debito Banco Falabella"))
        val w = c(wallet(null, "Pagaste \$12.990 en COPEC con Visa •••• 1234"))
        assertEquals(b.amountClp, w.amountClp); assertEquals(Kind.EXPENSE, b.kind); assertEquals(Kind.EXPENSE, w.kind)
    }
}
