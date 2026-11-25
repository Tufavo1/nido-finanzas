// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.BankPresets
import cl.dinovance.contigo.capture.CaptureNotifier
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.DiagReason
import cl.dinovance.contigo.capture.DiagnosticsLog
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.sync.ExpenseNote
import cl.dinovance.contigo.capture.IncomingNotice
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.NoticeLedger
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.capture.PurchaseMemory
import cl.dinovance.contigo.capture.TextStore
import cl.nido.parser.Installment
import cl.nido.parser.InstallmentPlan
import cl.nido.parser.InstallmentRole
import cl.nido.parser.PaymentMedium
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Compra en cuotas con tarjeta de credito (decision del dueno 2026-11-24): se registra por el TOTAL, queda SIEMPRE pendiente con su
 * motivo propio y las cuotas viajan como dato en el borrador. Banco con guardado automatico ACTIVADO y categoria por defecto: lo que
 * queda pendiente es porque la regla lo exige.
 */
class CompraEnCuotasFlujoTest {
    private val bank = "cl.demo.falabella"
    private val wallet = "cl.demo.wallet"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    /** 2026-11-23 15:00 en Santiago (UTC-3). */
    private var now = 1_795_456_800_000L
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = when (packageName) {
            bank -> "banco-falabella"; wallet -> BankPresets.WALLET_ID; else -> null
        }
        override fun autoEnabled(bank: String) = true
        override fun maxClp() = 50_000L
    }
    private val profile = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Prueba-Emu") to cat), defaultCategoryId = cat)
    private fun mem() = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val diag = DiagnosticsLog(mem()) { now }
    private val p = CaptureProcessor(
        { setOf(bank, wallet) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile },
        diag = diag, ledger = NoticeLedger(mem()), purchases = PurchaseMemory(mem()),
    )
    private var keys = 0
    private fun send(pkg: String, title: String?, text: String) =
        p.process(IncomingNotice(pkg, title, text, now, key = "0|$pkg|${keys++}|null|1", whenMillis = now))
    private fun reasons() = diag.list().map { it.reason }
    private fun seconds(s: Int) { now += s * 1000L }

    @Test
    fun `QA - compra CMR de 30000 en 3 cuotas de 10000 queda PENDIENTE por el total con motivo propio`() {
        assertEquals(Outcome.STORED, send(bank, null, "Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard"))
        val d = repo.list().single()
        assertEquals(DraftStatus.PENDING, d.status); assertFalse(d.autoSaved)
        assertEquals(30_000L, d.candidate.amountClp); assertNull(d.candidate.installment)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, 10_000L), d.candidate.installmentPlan)
        assertEquals("Prueba-Emu", d.candidate.merchant); assertEquals(PaymentMedium.CREDIT, d.candidate.medium)
        assertFalse("no es un monto ambiguo falso", d.ambiguousAmount)
        assertTrue(DiagReason.INSTALLMENT_PURCHASE in reasons())
        assertFalse(DiagReason.AMBIGUOUS_AMOUNT in reasons())
    }

    @Test
    fun `en 3 cuotas sin valor de cuota - total pendiente y la cuota desconocida`() {
        assertEquals(Outcome.STORED, send(bank, null, "Compraste \$45.000 en Tienda Demo en 3 cuotas Con tu CMR Mastercard"))
        val d = repo.list().single()
        assertEquals(DraftStatus.PENDING, d.status); assertEquals(45_000L, d.candidate.amountClp)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, null), d.candidate.installmentPlan)
        assertEquals(listOf(DiagReason.INSTALLMENT_PURCHASE), reasons())
    }

    @Test
    fun `12 cuotas de 9990 sin total - pendiente, monto ambiguo y el diagnostico dice que falta el total`() {
        assertEquals(Outcome.STORED, send(bank, null, "Compraste en Tienda Demo en 12 cuotas de \$9.990 Con tu CMR Mastercard"))
        val d = repo.list().single()
        assertEquals(DraftStatus.PENDING, d.status); assertEquals(9_990L, d.candidate.amountClp)
        assertEquals(Installment(1, 12), d.candidate.installment); assertTrue(d.ambiguousAmount)
        assertEquals(listOf(DiagReason.INSTALLMENT_TOTAL_UNKNOWN), reasons())
    }

    @Test
    fun `cuota 2 de 6 de una compra anterior - pendiente y marcada como cobro de cuota, no compra nueva`() {
        assertEquals(Outcome.STORED, send(bank, null, "Cuota 2 de 6 por \$15.000 en PRUEBA-EMU Con tu CMR Mastercard"))
        val d = repo.list().single()
        assertEquals(DraftStatus.PENDING, d.status); assertEquals(15_000L, d.candidate.amountClp)
        assertEquals(InstallmentRole.PRIOR_CHARGE, d.candidate.installmentPlan?.role)
        assertEquals(listOf(DiagReason.INSTALLMENT_CHARGE), reasons())
        assertEquals("PRIOR_CHARGE", d.toJson().getString("installmentRole"))
    }

    @Test
    fun `el borrador expone las cuotas en el JSON sin romper la forma de installment`() {
        send(bank, null, "Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard")
        val o = repo.list().single().toJson()
        assertEquals(30_000L, o.getLong("amountClp")); assertTrue(o.isNull("installment"))
        assertEquals("PURCHASE", o.getString("installmentRole"))
        assertEquals(3, o.getInt("installmentCount")); assertEquals(10_000L, o.getLong("installmentValueClp"))
        // Ida y vuelta por la bandeja cifrada
        assertEquals(repo.list().single(), Draft.fromJson(JSONObject(o.toString())))
    }

    @Test
    fun `un borrador guardado antes (sin campos de cuotas) se lee igual y sin plan`() {
        val old = JSONObject().put("id", "x").put("amountClp", 10_000).put("merchant", "Tienda").put("kind", "EXPENSE").put("confidence", "HIGH")
            .put("installment", JSONObject().put("n", 1).put("total", 3)).put("fingerprint", "f").put("postedAtMillis", 1L)
            .put("createdAtMillis", 1L).put("status", "PENDING")
        val d = Draft.fromJson(old)
        assertNull(d.candidate.installmentPlan); assertEquals(Installment(1, 3), d.candidate.installment)
        val o = d.toJson()
        assertTrue(o.isNull("installmentRole")); assertTrue(o.isNull("installmentCount")); assertTrue(o.isNull("installmentValueClp"))
    }

    @Test
    fun `banco en cuotas y luego Billetera con el total dan UN solo borrador (mismo monto, 10 min)`() {
        assertEquals(Outcome.STORED, send(bank, null, "Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard"))
        seconds(20)
        assertEquals(Outcome.DUPLICATE, send(wallet, "PRUEBA-EMU", "CLP 30,000 · Mastercard ••5766"))
        val d = repo.list().single()
        assertEquals(bank, d.sourcePackage); assertEquals(DraftStatus.PENDING, d.status)
        assertEquals(InstallmentRole.PURCHASE, d.candidate.installmentPlan?.role)
    }

    @Test
    fun `Billetera sin comercio y luego banco en cuotas - un borrador pendiente que se completa con el comercio y las cuotas`() {
        assertEquals(Outcome.STORED, send(wallet, null, "CLP 30,000 · Mastercard ••5766"))
        assertEquals(DraftStatus.PENDING, repo.list().single().status)
        seconds(20)
        assertEquals(Outcome.DUPLICATE, send(bank, null, "Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard"))
        val d = repo.list().single()
        assertEquals(wallet, d.sourcePackage); assertEquals("Prueba-Emu", d.candidate.merchant)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, 10_000L), d.candidate.installmentPlan)
    }

    @Test
    fun `dos compras reales en cuotas por el mismo total con su espejo de Billetera siguen siendo dos (uno a uno)`() {
        send(bank, null, "Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard")
        seconds(150)
        send(bank, null, "Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard")
        seconds(10)
        assertEquals(Outcome.DUPLICATE, send(wallet, "PRUEBA-EMU", "CLP 30,000 · Mastercard ••5766"))
        seconds(10)
        assertEquals(Outcome.DUPLICATE, send(wallet, "PRUEBA-EMU", "CLP 30,000 · Mastercard ••5766"))
        assertEquals(2, repo.list().size)
    }

    /** Documenta el limite: si el banco solo dice la cuota (sin total) y Billetera el total, los montos no calzan y quedan DOS borradores. */
    @Test
    fun `banco solo con la cuota y Billetera con el total - dos borradores (limite documentado)`() {
        assertEquals(Outcome.STORED, send(bank, null, "Compraste en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard"))
        seconds(20)
        assertEquals(Outcome.STORED, send(wallet, "PRUEBA-EMU", "CLP 30,000 · Mastercard ••5766"))
        assertEquals(2, repo.list().size)
        val cuota = repo.list().first { it.sourcePackage == bank }
        assertEquals(DraftStatus.PENDING, cuota.status); assertTrue(cuota.candidate.installmentTotalUnknown)
    }

    /** Hallazgo de QA: un entero sin «$» no es monto (no se amplia lo que se guarda) y el diagnostico dice «sin monto», jamas «otra moneda». */
    @Test
    fun `QA - entero sin signo peso queda como sin monto, no como otra moneda, en banco y en Billetera`() {
        for (pkg in listOf(bank, wallet)) {
            assertEquals(Outcome.NOT_A_MOVEMENT, send(pkg, null, "Compraste 4321 PRUEBA-EMU TIENDA"))
            assertEquals(Outcome.NOT_A_MOVEMENT, send(pkg, null, "Compraste 12990 PRUEBA-EMU LAS CONDES"))
            assertEquals(Outcome.NOT_A_MOVEMENT, send(pkg, "PRUEBA-EMU", "12990"))
        }
        assertTrue(repo.list().isEmpty())
        assertEquals(List(6) { DiagReason.NO_AMOUNT }, reasons())
    }

    @Test
    fun `la notificacion ofrece Guardar solo si el monto es el total, nunca para una cuota anterior ni sin total`() {
        send(bank, null, "Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard"); seconds(150)
        send(bank, null, "Compraste en Tienda Demo en 12 cuotas de \$9.990 Con tu CMR Mastercard"); seconds(150)
        send(bank, null, "Cuota 2 de 6 por \$15.000 en PRUEBA-EMU Con tu CMR Mastercard")
        val by = repo.list().associateBy { it.candidate.amountClp }
        val save = listOf(CaptureNotifier.ACTION_SAVE, CaptureNotifier.ACTION_CHANGE_CATEGORY, CaptureNotifier.ACTION_IGNORE)
        val review = listOf(CaptureNotifier.ACTION_OPEN, CaptureNotifier.ACTION_IGNORE)
        assertEquals(save, CaptureNotifier.actionsFor(by.getValue(30_000L)))
        assertEquals(review, CaptureNotifier.actionsFor(by.getValue(9_990L)))
        assertEquals(review, CaptureNotifier.actionsFor(by.getValue(15_000L)))
        assertFalse(by.getValue(15_000L).savableFromNotification); assertTrue(by.getValue(30_000L).savableFromNotification)
    }

    @Test
    fun `la nota del gasto conserva las cuotas en pesos chilenos`() {
        send(bank, null, "Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard"); seconds(150)
        send(bank, null, "Compraste \$1.199.880 en Tienda Demo en 12 cuotas Con tu CMR Mastercard")
        val by = repo.list().associateBy { it.candidate.amountClp }
        assertEquals("Prueba-Emu (3 cuotas de \$10.000)", ExpenseNote.of(by.getValue(30_000L).candidate))
        assertEquals("Tienda Demo (12 cuotas)", ExpenseNote.of(by.getValue(1_199_880L).candidate))
        // Sin cambios para lo de siempre
        assertEquals("Tienda (cuota 1/3)", ExpenseNote.of(cl.nido.parser.ParsedCandidate(10_000, "Tienda", cl.nido.parser.Kind.EXPENSE, cl.nido.parser.Confidence.HIGH, Installment(1, 3), "f")))
        assertEquals("cuota 1/3", ExpenseNote.of(cl.nido.parser.ParsedCandidate(10_000, null, cl.nido.parser.Kind.EXPENSE, cl.nido.parser.Confidence.HIGH, Installment(1, 3), "f")))
        assertEquals("Tienda", ExpenseNote.of(cl.nido.parser.ParsedCandidate(10_000, " Tienda ", cl.nido.parser.Kind.EXPENSE, cl.nido.parser.Confidence.HIGH, null, "f")))
    }
}
