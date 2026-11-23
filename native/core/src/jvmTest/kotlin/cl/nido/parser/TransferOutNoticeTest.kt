// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * «Transferiste $X a NOMBRE»: puede ser un gasto o un pago de deuda y lo decide la persona (pedido del dueño).
 * Antes salía como EXPENSE (con isTransfer) y podía guardarse solo; ahora es [Kind.TRANSFER_OUT]. Datos SINTÉTICOS.
 */
class TransferOutNoticeTest {
    private val pkg = "cl.demo.banco"
    private val p = NotificationParser(setOf(pkg))
    private fun parse(title: String?, body: String?) = p.parseDetailed(pkg, title, body, 1_700_000_000_000).candidate

    @Test
    fun `transferiste en una sola frase es TRANSFER_OUT con el destinatario`() {
        val c = parse(null, "Transferiste \$5.000 a Juan Perez. Revisa más detalles en tu app")
        assertNotNull(c); c!!
        assertEquals(Kind.TRANSFER_OUT, c.kind)
        assertEquals(5_000L, c.amountClp)
        assertEquals("Juan Perez", c.merchant)
        assertEquals(Confidence.HIGH, c.confidence)
        assertNull(c.installment)
    }

    @Test
    fun `aviso partido titulo con monto y cuerpo con el destinatario`() {
        val c = parse("Transferiste \$5.000", "a Juan Perez. Revisa más detalles en tu app")
        assertNotNull(c); c!!
        assertEquals(Kind.TRANSFER_OUT, c.kind)
        assertEquals(5_000L, c.amountClp)
        assertEquals("Juan Perez", c.merchant)
        assertEquals(Confidence.HIGH, c.confidence)
    }

    @Test
    fun `aviso partido en mayusculas y sin tildes`() {
        val c = parse("TRANSFERISTE \$12.500", "A JUAN PEREZ. REVISA MAS DETALLES EN TU APP")
        assertNotNull(c); c!!
        assertEquals(Kind.TRANSFER_OUT, c.kind)
        assertEquals(12_500L, c.amountClp)
        assertEquals("Juan Perez", c.merchant)
        assertNull(c.account, "«en tu app» no es una cuenta")
    }

    @Test
    fun `el nombre en mayusculas con tilde se lee bien y sin la ciudad`() {
        val c = parse(null, "Transferiste \$3.000 a MARÍA JOSÉ NÚÑEZ Santiago Chl")
        assertEquals(Kind.TRANSFER_OUT, c?.kind)
        assertEquals("María José Núñez", c?.merchant)
    }

    @Test
    fun `la cuenta de origen se guarda si aparece`() {
        val c = parse(null, "Transferiste \$20.000 a Juan Perez con tu Cuenta Corriente Banco Falabella 12342236.")
        assertEquals(Kind.TRANSFER_OUT, c?.kind)
        assertEquals("Juan Perez", c?.merchant)
        assertEquals("Cuenta Corriente Banco Falabella ·2236", c?.account)
    }

    @Test
    fun `la cuenta de origen con desde tu cuenta`() {
        val c = parse(null, "Transferiste \$20.000 a Juan Perez desde tu Cuenta Banco Falabella 2236")
        assertEquals("Juan Perez", c?.merchant)
        assertEquals("Cuenta Banco Falabella ·2236", c?.account)
    }

    @Test
    fun `sin destinatario la confianza es MEDIA`() {
        val c = parse("Transferiste \$5.000", "Revisa más detalles en tu app")
        assertNotNull(c); c!!
        assertEquals(Kind.TRANSFER_OUT, c.kind)
        assertNull(c.merchant)
        assertEquals(Confidence.MEDIUM, c.confidence)
    }

    @Test
    fun `hiciste una transferencia tambien es TRANSFER_OUT`() {
        val c = parse(null, "Hiciste una transferencia de \$8.000 a Juana Ejemplo el 10/11/2026.")
        assertEquals(Kind.TRANSFER_OUT, c?.kind)
        assertEquals("Juana Ejemplo", c?.merchant)
        assertEquals(Confidence.HIGH, c?.confidence)
    }

    @Test
    fun `transferencia realizada con el nombre antes del monto (F08) es TRANSFER_OUT`() {
        val c = parse("Banco Demo", "Transferencia realizada a Juana Ejemplo por \$20.000 el 10/11/2026.")
        assertEquals(Kind.TRANSFER_OUT, c?.kind)
        assertEquals("Juana Ejemplo", c?.merchant)
    }

    @Test
    fun `compraste pagaste a tu CMR y recibiste no cambian`() {
        assertEquals(Kind.EXPENSE, parse("Compraste \$6.778", "en Ganaderia Rio Bueno S.a Santiago Chl. Con tu Débito Banco Falabella")?.kind)
        assertEquals(Kind.DEBT_PAYMENT, parse("Pagaste \$300", "a tu CMR Mastercard Premium. Revisa mas detalles en tu app.")?.kind)
        assertEquals(Kind.INCOME, parse("Recibiste \$1.000", "Te transfirieron \$1.000 a tu Cuenta Banco Falabella. Ingresa a la app")?.kind)
        assertEquals(Kind.INCOME, parse(null, "Recibiste una transferencia de \$60.000 de Persona Demo el 12/11/2026.")?.kind)
    }

    @Test
    fun `compraste en un comercio que se llama transferencias sigue siendo gasto`() {
        assertEquals(Kind.EXPENSE, parse(null, "Compraste \$4.000 en Transferencias Express SPA")?.kind)
    }

    @Test
    fun `un retiro sigue como esta`() {
        val c = parse(null, "Retiro en cajero por \$40.000 el 13/11/2026.")
        assertEquals(Kind.EXPENSE, c?.kind)
        assertEquals(Confidence.LOW, c?.confidence)
        assertNull(c?.merchant)
    }

    @Test
    fun `no transferiste y transferencias fallidas o rechazadas se descartan`() {
        assertNull(parse(null, "No transferiste \$5.000 a Juan Perez. Revisa tu app"))
        assertNull(parse("No transferiste \$5.000", "a Juan Perez"))
        assertNull(parse(null, "Transferencia fallida por \$5.000 a Juan Perez"))
        assertNull(parse(null, "Tu transferencia de \$5.000 a Juan Perez fue rechazada"))
    }

    @Test
    fun `una transferencia nunca se guarda sola en modo automatico`() {
        val c = parse(null, "Transferiste \$5.000 a Juan Perez. Revisa más detalles en tu app")!!
        assertEquals(Confidence.HIGH, c.confidence)
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c, CaptureSettings(CaptureMode.AUTO, 9_999_999_999L), hasLearnedCategory = true))
    }
}
