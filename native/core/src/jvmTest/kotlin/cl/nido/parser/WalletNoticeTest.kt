// Copyright (c) 2026 Dinovance
package cl.nido.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Avisos de BILLETERA GOOGLE (Google Wallet). Textos SINTETICOS armados a partir de UN ejemplo que vio el dueño en pantalla
 * («Shell Vespucio 1828 F1  23 nov  CLP 20,000»); NO hay avisos reales de Wallet verificados (titulo/texto/paquete). Por eso se
 * prueban todas las particiones razonables entre titulo y texto.
 */
class WalletNoticeTest {
    private val pkg = "wallet.demo"
    private val p = NotificationParser(setOf(pkg))
    private val zone = ZoneId.of("America/Santiago")
    /** 23 nov 2026 15:00 en Santiago. */
    private val posted = ZonedDateTime.of(2026, 11, 23, 15, 0, 0, 0, zone).toInstant().toEpochMilli()
    private val offset = zone.rules.getOffset(java.time.Instant.ofEpochMilli(posted)).totalSeconds * 1000L

    private fun wallet(title: String?, text: String?, at: Long = posted) = p.parseDetailed(pkg, title, text, at, NoticeStyle.WALLET, offset)
    private fun must(title: String?, text: String?): ParsedCandidate = wallet(title, text).let { assertNotNull(it.candidate, "titulo=$title texto=$text rechazo=${it.rejection}"); it.candidate!! }
    private val auto = CaptureSettings(CaptureMode.AUTO, 1_000_000)

    // ---------- 1) monto ----------

    @Test
    fun `CLP con coma de miles, punto de miles, sin separador y como sufijo`() {
        assertEquals(20_000L, must("Shell Vespucio 1828 F1  23 nov  CLP 20,000", null).amountClp)
        assertEquals(1_250_000L, must("Tienda Demo", "CLP 1,250,000").amountClp)
        assertEquals(20_000L, must("Tienda Demo", "CLP 20.000").amountClp)
        assertEquals(20_000L, must("Tienda Demo", "CLP 20000").amountClp)
        assertEquals(20_000L, must("Tienda Demo", "20,000 CLP").amountClp)
        assertEquals(20_000L, must("Tienda Demo", "\$ 20,000").amountClp)
        assertEquals(20_000L, must("Tienda Demo", "\$20,000").amountClp)
        assertEquals(20_000L, must("Tienda Demo", "CLP 20,000").amountClp)
        assertEquals(990L, must("Tienda Demo", "CLP 990").amountClp)
    }

    @Test
    fun `monto ambiguo o con decimales queda sin monto, nunca se adivina`() {
        listOf("CLP 20,00", "CLP 20,000.50", "CLP 20.000,50", "CLP 20,000.00", "\$12,99", "CLP 1,25,000", "CLP 20,0000").forEach {
            val r = wallet("Tienda Demo", it)
            assertNull(r.candidate, it)
        }
    }

    @Test
    fun `moneda extranjera se descarta, no se convierte ni se guarda como pesos`() {
        listOf("USD 12.50", "US\$ 12.50", "EUR 30", "COP 20,000", "ARS 15,000", "PEN 40", "12.50 USD", "20,000 COP", "MXN 300", "€ 12", "BRL 50").forEach {
            val r = wallet("Tienda Demo  23 nov", it)
            assertNull(r.candidate, it)
            // 2026-11-24: motivo propio (antes DISCARDED) para que el diagnostico diga «moneda extranjera»; sigue sin candidato
            assertEquals(ParseRejection.FOREIGN_CURRENCY, r.rejection, it)
        }
    }

    @Test
    fun `el numero de calle del comercio y el dia no se confunden con el monto`() {
        val c = must("Shell Vespucio 1828", "CLP 20,000")
        assertEquals(20_000L, c.amountClp); assertEquals("Shell Vespucio 1828", c.merchant)
        val d = must("Shell Vespucio 1828 CLP 20,000", null)
        assertEquals(20_000L, d.amountClp); assertEquals("Shell Vespucio 1828", d.merchant)
    }

    // ---------- 2) comercio y fecha, en todas las particiones ----------

    @Test
    fun `todas las particiones del ejemplo real dan el mismo gasto`() {
        val cases = listOf(
            "Shell Vespucio 1828 F1  23 nov  CLP 20,000" to null,
            "Shell Vespucio 1828 F1" to "23 nov CLP 20,000",
            "Shell Vespucio 1828 F1" to "CLP 20,000 · 23 nov",
            "Shell Vespucio 1828 F1" to "CLP 20,000 • 23 nov",
            "Shell Vespucio 1828 F1" to "23 nov - CLP 20,000",
            "CLP 20,000" to "Shell Vespucio 1828 F1",
            "CLP 20,000" to "Shell Vespucio 1828 F1 · 23 nov",
            null to "Shell Vespucio 1828 F1\n23 nov\nCLP 20,000",
            "Shell Vespucio 1828 F1" to "23 de nov. · CLP 20,000 · Visa ••1234",
            "Shell Vespucio 1828 F1" to "CLP 20,000 · Mastercard ••5678",
            "Shell Vespucio 1828 F1" to "CLP 20,000 · Débito",
            "Shell Vespucio 1828 F1" to "CLP 20,000 · Crédito",
            "Shell Vespucio 1828 F1" to "Hoy · CLP 20,000",
            "Shell Vespucio 1828 F1" to "23 NOV · CLP 20,000",
            "Compra en Shell Vespucio 1828 F1" to "CLP 20,000",
            "Pagaste CLP 20,000 en Shell Vespucio 1828 F1" to null,
            "Billetera de Google" to "Shell Vespucio 1828 F1 · CLP 20,000",
        )
        cases.forEach { (t, x) ->
            val c = must(t, x)
            assertEquals(20_000L, c.amountClp, "$t | $x")
            assertEquals("Shell Vespucio 1828 F1", c.merchant, "$t | $x")
            assertEquals(Kind.EXPENSE, c.kind, "$t | $x")
            assertEquals(Confidence.HIGH, c.confidence, "$t | $x")
            assertNull(c.installment)
        }
    }

    @Test
    fun `comercio en mayusculas pasa a titulo y tiene tope de largo`() {
        assertEquals("Lider Express", must("LIDER EXPRESS", "CLP 12,990").merchant)
        val long = "Comercio " + "X".repeat(200)
        assertTrue(must(long, "CLP 1,000").merchant!!.length <= 60)
    }

    @Test
    fun `meses abreviados en espanol se reconocen y no quedan en el comercio`() {
        listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "sept", "oct", "nov", "dic", "Nov.", "DIC", "septiembre").forEach { m ->
            val c = must("Cafe Demo", "5 $m · CLP 3,500")
            assertEquals("Cafe Demo", c.merchant, m); assertEquals(3_500L, c.amountClp, m)
        }
        assertEquals("Cafe Demo", must("Cafe Demo", "ayer · CLP 3,500").merchant)
    }

    @Test
    fun `cuenta solo con los ultimos 4 digitos de la tarjeta`() {
        assertEquals("Tarjeta ·1234", must("Cafe Demo", "CLP 3,500 · Tarjeta ••1234").account)
        assertEquals("Visa ·1234", must("Cafe Demo", "CLP 3,500 · Visa ••1234").account)
        assertEquals("Mastercard ·5678", must("Cafe Demo", "CLP 3,500 · Mastercard •••• 5678").account)
        assertEquals("Débito", must("Cafe Demo", "CLP 3,500 · Débito").account)
        // Un numero largo jamas se conserva entero
        val c = must("Cafe Demo", "CLP 3,500 · Visa ••4111111111111234")
        assertEquals("Visa ·1234", c.account)
        assertFalse(c.toString().contains("41111111"))
        assertNull(must("Cafe Demo", "CLP 3,500").account)
    }

    @Test
    fun `sin comercio es confianza media y pide confirmacion`() {
        val c = must("Billetera de Google", "CLP 20,000 · 23 nov")
        assertNull(c.merchant); assertEquals(Confidence.MEDIUM, c.confidence)
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c, auto, hasLearnedCategory = true))
    }

    @Test
    fun `con comercio y monto claros se puede guardar solo (mismas reglas que un gasto)`() {
        val c = must("Shell Vespucio 1828 F1", "CLP 20,000 · 23 nov")
        assertEquals(CaptureDecision.AUTO_SAVE, AutoCaptureRules.decide(c, auto, hasLearnedCategory = true))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c, auto, hasLearnedCategory = false))
    }

    @Test
    fun `fecha del texto de otro dia por mas de 36 horas marca el aviso como viejo`() {
        assertFalse(wallet("Cafe Demo", "23 nov · CLP 3,500").staleDate)
        assertFalse(wallet("Cafe Demo", "22 nov · CLP 3,500").staleDate) // ayer: dentro del margen
        assertFalse(wallet("Cafe Demo", "hoy · CLP 3,500").staleDate)
        assertFalse(wallet("Cafe Demo", "CLP 3,500").staleDate) // sin fecha: manda postTime
        assertTrue(wallet("Cafe Demo", "20 nov · CLP 3,500").staleDate)
        assertTrue(wallet("Cafe Demo", "23 oct · CLP 3,500").staleDate)
        assertTrue(wallet("Cafe Demo", "26 nov · CLP 3,500").staleDate) // en el futuro
        // 1 de enero visto el 31 de diciembre: el año se elige cerca de postTime (no un año entero de diferencia)
        val dec31 = ZonedDateTime.of(2026, 12, 31, 22, 0, 0, 0, zone).toInstant().toEpochMilli()
        assertFalse(wallet("Cafe Demo", "1 ene · CLP 3,500", dec31).staleDate)
        assertFalse(wallet("Cafe Demo", "31 dic · CLP 3,500", dec31 + 20L * 3_600_000).staleDate)
    }

    @Test
    fun `la fecha del texto no cambia la hora del aviso (huella con postTime)`() {
        val a = must("Cafe Demo", "20 nov · CLP 3,500")
        val b = p.parseDetailed(pkg, "Cafe Demo", "20 nov · CLP 3,500", posted, NoticeStyle.WALLET, offset).candidate!!
        assertEquals(a.fingerprint, b.fingerprint)
        assertEquals(Fingerprint.of(pkg, "Cafe Demo\n20 nov · CLP 3,500", 3_500L, posted), a.fingerprint)
    }

    // ---------- 3) que es una compra y que no ----------

    @Test
    fun `lo que no es un movimiento de Wallet se descarta`() {
        listOf(
            "Oferta especial" to "Ahorra CLP 5,000 en tu proxima compra",
            "Promo" to "CLP 2,000 de descuento en Shell",
            "Se agregó una tarjeta" to "Visa ••1234 ya está en Billetera de Google",
            "Tu tarjeta está lista" to "Paga con tu Mastercard ••5678",
            "Tu tarjeta está por vencer" to "Visa ••1234 vence pronto",
            "Verifica tu tarjeta" to "Ingresa el código que te enviamos",
            "Compra rechazada" to "Shell Vespucio · CLP 20,000",
            "Pago declinado" to "Shell Vespucio · CLP 20,000",
            "Compra fallida" to "Shell Vespucio · CLP 20,000",
            "Pago pendiente" to "Shell Vespucio · CLP 20,000",
            "Tu pase de embarque" to "Vuelo LA 123 · 23 nov",
            "Tu entrada" to "Concierto Demo · 23 nov",
            "Boleto de bus" to "Santiago - Valparaíso · 23 nov",
            "Transferencia recibida" to "CLP 20,000",
        ).forEach { (t, x) ->
            val r = wallet(t, x)
            assertNull(r.candidate, "$t | $x")
            assertEquals(ParseRejection.DISCARDED, r.rejection, "$t | $x")
        }
    }

    @Test
    fun `reembolso y devolucion son ingreso de confianza baja que nunca se guarda solo`() {
        listOf("Reembolso" to "Shell Vespucio · CLP 20,000", "Devolución" to "CLP 20,000 · Shell Vespucio", "Refund" to "Shell Vespucio CLP 20,000").forEach { (t, x) ->
            val r = wallet(t, x)
            val c = r.candidate
            assertNotNull(c, "$t | $x")
            assertEquals(Kind.INCOME, c!!.kind); assertEquals(Confidence.LOW, c.confidence); assertFalse(r.extraIncome)
            assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(c, auto, hasLearnedCategory = true))
        }
    }

    @Test
    fun `una compra de Wallet nunca es pago de deuda, transferencia ni ingreso`() {
        listOf(
            "Pagaste CLP 20,000 a tu tarjeta" to null,
            "Abono Metro" to "CLP 1,000",
            "Recarga Bip" to "CLP 5,000",
        ).forEach { (t, x) ->
            val c = must(t, x)
            assertEquals(Kind.EXPENSE, c.kind, "$t | $x")
        }
    }

    @Test
    fun `varios montos distintos bajan la confianza`() {
        val c = must("Cafe Demo", "CLP 3,500 · CLP 4,000")
        assertEquals(Confidence.MEDIUM, c.confidence)
        assertTrue(wallet("Cafe Demo", "CLP 3,500 · CLP 4,000").ambiguousAmount)
    }

    @Test
    fun `texto vacio o sin monto no es movimiento`() {
        assertEquals(ParseRejection.NO_TEXT, wallet(null, "  ").rejection)
        assertEquals(ParseRejection.NO_AMOUNT, wallet("Shell Vespucio", "23 nov").rejection)
    }

    @Test
    fun `el estilo de banco no cambia (CLP con coma ahora se lee, $ con coma sigue ambiguo)`() {
        val bank = { t: String -> p.parse(pkg, null, t, posted) }
        assertEquals(20_000L, bank("Compra aprobada por CLP 20,000 en Shell")?.amountClp)
        assertEquals(20_000L, bank("Compra aprobada por 20,000 CLP en Shell")?.amountClp)
        assertNull(bank("Compra aprobada por \$12,990 en Tienda"))
        assertNull(bank("Compra por COP 20,000 en Tienda"))
        assertEquals(12_990L, bank("Compraste \$12.990 en Tienda Demo")?.amountClp)
    }

    @Test
    fun `comercio con caracteres invisibles se limpia`() {
        assertEquals("Cafe Demo", must("Cafe​ Demo‮", "CLP 3,500").merchant?.replace("  ", " "))
    }
}
