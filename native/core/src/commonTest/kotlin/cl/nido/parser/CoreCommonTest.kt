// Copyright (c) 2026 Dinovance
package cl.nido.parser

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CoreCommonTest {
    @Test
    fun sha256KnownVectors() {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", Sha256.hex(ByteArray(0)))
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", Sha256.hex("abc".encodeToByteArray()))
        assertEquals(
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
            Sha256.hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq".encodeToByteArray()),
        )
    }

    @Test
    fun clpAmountParseAndFormat() {
        assertEquals(1_250_000L, ClpAmount.parse("1.250.000"))
        assertEquals(4500L, ClpAmount.parse("4500"))
        assertNull(ClpAmount.parse("0"))
        assertNull(ClpAmount.parse("10.000.000.000"))
        assertEquals("$12.990", ClpAmount.format(12_990))
        assertEquals("$999", ClpAmount.format(999))
        assertEquals("$1.250.000", ClpAmount.format(1_250_000))
    }

    @Test
    fun keywordNormalizationStripsAccents() {
        assertEquals("devolucion de cuota ñ".replace('ñ', 'n'), TextNormalizer.forKeywords("  Devolución   de CUOTA Ñ "))
    }

    private fun link(url: String) = ExpenseLinkParser.parse(url, 2026, 11, 21)

    @Test
    fun validLinks() {
        assertEquals(ExpenseLink.Valid(4500, "Cafe Demo", null), link("nido://gasto?monto=4500&comercio=Cafe%20Demo"))
        assertEquals(ExpenseLink.Valid(12_000, null, null), link("NIDO://gasto?monto=12000&x=1"))
        assertEquals(ExpenseLink.Valid(900, "Kiosco", "2026-11-14"), link("nido://gasto?monto=900&comercio=Kiosco&fecha=2026-11-14"))
        assertEquals("Panadería El Ñandú", (link("nido://gasto?monto=3200&comercio=Panader%C3%ADa%20El%20%C3%91and%C3%BA") as ExpenseLink.Valid).merchant)
        assertEquals(9_999_999_999L, (link("nido://gasto?monto=9999999999") as ExpenseLink.Valid).amountClp)
    }

    @Test
    fun invalidDatesBecomeToday() {
        assertNull((link("nido://gasto?monto=1000&fecha=2026-02-31") as ExpenseLink.Valid).date)
        assertNull((link("nido://gasto?monto=1000&fecha=2026-12-30") as ExpenseLink.Valid).date)
        assertNull((link("nido://gasto?monto=1000&fecha=manana") as ExpenseLink.Valid).date)
    }

    @Test
    fun rejectedLinks() {
        listOf(
            "nido://gasto?monto=0", "nido://gasto?monto=-5", "nido://gasto?monto=1e3", "nido://gasto?monto=12.5", "nido://gasto?monto=",
            "nido://gasto", "nido://gasto?monto=10000000000", "nido://gasto?monto=100&monto=200", "http://gasto?monto=1000",
            "javascript:alert(1)", "contigo://gasto?monto=1000", "nido://otro?monto=1000", "nido://gasto/extra?monto=1000",
            "nido://usuario@gasto?monto=1000", "nido://gasto?monto=1000&comercio=" + "a".repeat(61),
            "nido://gasto?monto=1000&comercio=Kiosco%00Demo", "nido://gasto?monto=1000&comercio=Kiosco%0ADemo", "", "no es un enlace",
        ).forEach { assertIs<ExpenseLink.Invalid>(link(it), it) }
        assertTrue(link("nido://gasto?monto=1000&comercio=" + "a".repeat(60)) is ExpenseLink.Valid)
    }

    private fun cand(kind: Kind = Kind.EXPENSE, conf: Confidence = Confidence.HIGH, amount: Long = 12_990, merchant: String? = "Almacen") =
        ParsedCandidate(amount, merchant, kind, conf, null, "f")

    @Test
    fun autoCaptureRules() {
        val auto = CaptureSettings(CaptureMode.AUTO, 50_000)
        assertEquals(CaptureSettings(CaptureMode.CONFIRM, 50_000), CaptureSettings())
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(cand(), CaptureSettings(), true))
        assertEquals(CaptureDecision.AUTO_SAVE, AutoCaptureRules.decide(cand(), auto, true))
        assertEquals(CaptureDecision.AUTO_SAVE, AutoCaptureRules.decide(cand(amount = 50_000), auto, true))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(cand(amount = 50_001), auto, true))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(cand(conf = Confidence.MEDIUM), auto, true))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(cand(), auto, false))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(cand(merchant = null), auto, true))
        // Cambio pedido por el dueño: un ingreso de confianza alta dentro del tope se guarda solo (ingreso extra).
        assertEquals(CaptureDecision.AUTO_SAVE, AutoCaptureRules.decide(cand(kind = Kind.INCOME), auto, true))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(cand(kind = Kind.DEBT_PAYMENT), auto, true))
        assertEquals(CaptureDecision.ASK, AutoCaptureRules.decide(cand(kind = Kind.TRANSFER_OUT), auto, true))
    }
}
