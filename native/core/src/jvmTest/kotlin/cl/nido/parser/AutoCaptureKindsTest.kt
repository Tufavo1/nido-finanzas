// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Pedido del dueño: «Recibiste» (INCOME) se guarda solo como ingreso extra con las mismas barreras que un gasto (modo AUTO,
 * confianza ALTA, dentro del tope). «Pagaste a tu tarjeta» (DEBT_PAYMENT) y «Transferiste» (TRANSFER_OUT) siempre preguntan.
 */
class AutoCaptureKindsTest {
    private val auto = CaptureSettings(CaptureMode.AUTO, 50_000L)
    private fun c(kind: Kind, amount: Long = 10_000, merchant: String? = null, confidence: Confidence = Confidence.HIGH) =
        ParsedCandidate(amount, merchant, kind, confidence, null, "f")

    @Test
    fun `un ingreso de confianza alta dentro del tope se guarda solo aunque no tenga comercio ni categoria`() {
        assertEquals(CaptureDecision.AUTO_SAVE, AutoCaptureRules.decide(c(Kind.INCOME), auto, hasLearnedCategory = false))
    }

    @Test
    fun `un ingreso sobre el tope, en modo confirmar o de confianza media pregunta`() {
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c(Kind.INCOME, amount = 50_001), auto, false))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c(Kind.INCOME), CaptureSettings(CaptureMode.CONFIRM, 50_000L), false))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c(Kind.INCOME, confidence = Confidence.MEDIUM), auto, false))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c(Kind.INCOME, amount = 0), auto, false))
    }

    @Test
    fun `el tope es inclusivo tambien para un ingreso`() {
        assertEquals(CaptureDecision.AUTO_SAVE, AutoCaptureRules.decide(c(Kind.INCOME, amount = 50_000), auto, false))
    }

    @Test
    fun `pago de deuda y transferencia nunca se guardan solos`() {
        for (k in listOf(Kind.DEBT_PAYMENT, Kind.TRANSFER_OUT)) {
            assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c(k, merchant = "Juan Perez"), CaptureSettings(CaptureMode.AUTO, Long.MAX_VALUE), true), k.name)
        }
    }

    @Test
    fun `un gasto sigue pidiendo comercio y una categoria`() {
        assertEquals(CaptureDecision.AUTO_SAVE, AutoCaptureRules.decide(c(Kind.EXPENSE, merchant = "Cafe"), auto, true))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c(Kind.EXPENSE, merchant = "Cafe"), auto, false))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c(Kind.EXPENSE), auto, true))
    }

    // Solo la plata que te mandan («Recibiste», «Te transfirieron») es candidata a ingreso extra guardado solo. Un abono, una
    // devolucion o una reversa tambien es INCOME, pero no es un «ingreso extra»: la persona lo revisa.
    private val parser = NotificationParser(setOf("cl.demo.banco"))
    private fun extra(title: String?, text: String) = parser.parseDetailed("cl.demo.banco", title, text, 1_700_000_000_000)

    @Test
    fun `recibiste y te transfirieron son ingreso extra`() {
        for ((t, b) in listOf(
            "Recibiste \$1.000" to "Te transfirieron \$1.000 a tu Cuenta Banco Falabella. Ingresa a la app",
            null to "Recibiste \$10.000 Te trasnfirieron \$10.000 a tu Cuenta Banco Falabella 2236.",
            null to "RECIBISTE \$5.000 DE JUAN PEREZ",
            null to "Te transfirieron \$20.000 a tu cuenta",
            null to "Recibiste una transferencia de \$60.000 de Persona Demo el 12/11/2026.",
        )) {
            val r = extra(t, b)
            assertEquals(Kind.INCOME, r.candidate?.kind, b)
            assertEquals(true, r.extraIncome, b)
        }
    }

    @Test
    fun `abonos, devoluciones y reversas no son ingreso extra`() {
        for (b in listOf(
            "Abono por \$10.000 de CAFE DEMO NORTE",
            "Reversa de compra por \$6.778 en Ganaderia Rio Bueno con tu Debito Banco Falabella",
            "Anulaste \$6.778 en Ganaderia Rio Bueno", "Devolucion de \$6.778 de Ganaderia Rio Bueno",
            "Recibiste una devolución de \$5.000 de Tienda Demo",
        )) {
            val r = extra(null, b)
            assertEquals(Kind.INCOME, r.candidate?.kind, b)
            assertEquals(false, r.extraIncome, b)
        }
        assertEquals(false, extra(null, "Compraste \$5.000 en Cafe").extraIncome)
        assertEquals(false, extra("Transferiste \$5.000", "a Juan Perez").extraIncome)
    }
}
