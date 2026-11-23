// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** Avisos REALES de Banco Falabella (titulo + cuerpo) y el medio que debe salir de cada uno. */
class PaymentMediumTest {
    private val p = NotificationParser(setOf("cl.demo.bf"))
    private fun parse(title: String, body: String) = p.parseDetailed("cl.demo.bf", title, body, 1_700_000_000_000).candidate!!

    @Test
    fun `Compraste con debito baja la cuenta`() {
        val c = parse("Compraste \$6.778 en Ganadera Rio Bueno S.a Santiago Chl", "Con tu Debito Banco Falabella.")
        assertEquals(Kind.EXPENSE, c.kind); assertEquals(PaymentMedium.DEBIT, c.medium)
    }

    @Test
    fun `Compraste con la CMR es credito y no toca la cuenta`() {
        val c = parse(
            "Compraste \$10.399 en Merpago Joseestebanrom Las Condes Chl",
            "Con tu CMR Mastercard Premium terminada en 5766. Si no la realizaste tu, revisa los movimientos de tus adicionales en tu app.",
        )
        assertEquals(Kind.EXPENSE, c.kind); assertEquals(10_399L, c.amountClp); assertEquals(PaymentMedium.CREDIT, c.medium)
        assertEquals("CMR Mastercard Premium ·5766", c.account)
    }

    @Test
    fun `Pagaste a la CMR es pago de deuda hacia una tarjeta de credito`() {
        val c = parse("Pagaste \$100", "a tu CMR Mastercard Premium. Revisa más detalles en tu app.")
        assertEquals(Kind.DEBT_PAYMENT, c.kind); assertEquals(PaymentMedium.CREDIT, c.medium)
    }

    @Test
    fun `Recibiste a tu cuenta es ingreso en debito`() {
        val c = parse("Recibiste \$1.000", "Te transfirieron \$1.000 a tu Cuenta Banco Falabella 2236. ¡Ingresa a la App y revisa tus movimientos!")
        assertEquals(Kind.INCOME, c.kind); assertEquals(PaymentMedium.DEBIT, c.medium)
    }

    @Test
    fun `Giraste con cargo a tu tarjeta no dice el medio y se trata como debito`() {
        val r = p.parseDetailed("cl.demo.bf", "Giraste \$15.000 en un cajero automatico", "con cargo a tu tarjeta.", 1_700_000_000_000)
        val c = r.candidate
        assertEquals(15_000L, c?.amountClp)
        assertEquals(PaymentMedium.UNKNOWN, c?.medium)
    }

    @Test
    fun `sin medio nombrado es desconocido y el debito manda sobre la marca`() {
        assertEquals(PaymentMedium.UNKNOWN, PaymentMediumClassifier.of(null))
        assertEquals(PaymentMedium.UNKNOWN, PaymentMediumClassifier.of("Tarjeta"))
        assertEquals(PaymentMedium.DEBIT, PaymentMediumClassifier.of("Débito Mastercard"))
        assertEquals(PaymentMedium.CREDIT, PaymentMediumClassifier.of("Visa ·1234"))
    }

    @Test
    fun `Transferiste a una persona sale de la cuenta y siempre se pregunta`() {
        val c = p.parseDetailed("cl.demo.bf", "Transferiste \$10.000 a Maria Perez", "", 1_700_000_000_000).candidate!!
        assertEquals(Kind.TRANSFER_OUT, c.kind); assertEquals(10_000L, c.amountClp)
        assertEquals(PaymentMedium.UNKNOWN, c.medium)
        val auto = AutoCaptureRules.decide(c, CaptureSettings(CaptureMode.AUTO), hasLearnedCategory = true)
        assertEquals(CaptureDecision.ASK, auto)
    }
}
