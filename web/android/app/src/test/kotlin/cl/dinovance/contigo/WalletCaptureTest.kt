// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.BankDetector
import cl.dinovance.contigo.capture.BankMatcher
import cl.dinovance.contigo.capture.BankPresets
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.DetectStatus
import cl.dinovance.contigo.capture.DiagReason
import cl.dinovance.contigo.capture.DiagnosticsLog
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.IncomingNotice
import cl.dinovance.contigo.capture.InstalledApp
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.NoticeLedger
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.capture.PurchaseMemory
import cl.dinovance.contigo.capture.TextStore
import cl.nido.parser.Confidence
import cl.nido.parser.Kind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Billetera Google como fuente: deteccion por nombre visible, guardado automatico con las mismas barreras y la regla CROSS-FUENTE
 * (la misma compra avisada por el banco y por Wallet). Avisos SINTETICOS: no hay avisos reales de Wallet verificados.
 */
class WalletCaptureTest {
    private val bank = "cl.demo.falabella"
    private val wallet = "cl.demo.wallet"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private val other = "44444444-4444-4444-8444-444444444444"
    /** 2026-11-23 15:00 en Santiago (UTC-3). */
    private var now = 1_795_456_800_000L
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private var autoOn = true
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = when (packageName) {
            bank -> "banco-falabella"; wallet -> BankPresets.WALLET_ID; else -> null
        }
        override fun autoEnabled(bank: String) = autoOn
        override fun maxClp() = 50_000L
    }
    private var profile: AutoProfile? = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Shell Vespucio 1828 F1") to cat))
    private val notifier = RecordingNotifier()
    private var synced = 0
    private fun mem() = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val memoryStore = mem()
    private val diagStore = mem()
    private val diag = DiagnosticsLog(diagStore) { now }
    private val ledger = NoticeLedger(mem())
    private fun processor() = CaptureProcessor(
        { setOf(bank, wallet) }, repo, notifier, RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile }, onAutoSaved = { synced++ },
        diag = diag, ledger = ledger, purchases = PurchaseMemory(memoryStore),
    )
    private val p = processor()
    private var keys = 0
    private fun send(pkg: String, title: String?, text: String?, proc: CaptureProcessor = p) =
        proc.process(IncomingNotice(pkg, title, text, now, key = "0|$pkg|${keys++}|null|1", whenMillis = now))
    private fun bankBuy(amount: String = "\$20.000", merchant: String? = "SHELL VESPUCIO") =
        send(bank, null, if (merchant == null) "Compra aprobada por $amount" else "Compraste $amount en $merchant Con tu Debito Banco Falabella")
    private fun walletBuy(amount: String = "CLP 20,000", merchant: String = "Shell Vespucio 1828 F1", proc: CaptureProcessor = p) =
        send(wallet, merchant, "23 nov · $amount · Visa ••1234", proc)
    private fun minutes(m: Double) { now += (m * 60_000).toLong() }

    // ---------- deteccion por nombre visible ----------

    @Test
    fun `Billetera Google se reconoce por su nombre visible, sin confundirla con otras billeteras`() {
        listOf("Billetera de Google", "Billetera Google", "Google Wallet", "BILLETERA DE GOOGLE", "Billetera Google App", "  Google  Wallet ").forEach {
            assertEquals(it, BankPresets.WALLET_ID, BankMatcher.bankOf(it))
        }
        listOf(
            "Wallet", "Billetera", "Google", "Google Pay", "GPay", "G Pay", "Samsung Wallet", "Apple Wallet", "Mercado Pago Wallet", "Wallet de Google Peru",
            "Google Wallet Beta Tester", "Billetera Google Empresas", "Mi Billetera", "Tenpo Wallet", "Mach Wallet",
        ).forEach { assertNull(it, BankMatcher.bankOf(it)) }
    }

    @Test
    fun `es una fuente mas de la lista, con id estable y nombre visible`() {
        val preset = BankPresets.byId("billetera-google")
        assertNotNull(preset); assertEquals("Billetera Google", preset!!.displayName); assertTrue(preset.candidatePackages.isEmpty())
        val r = BankDetector.detect(listOf(InstalledApp("x.gw", "Billetera de Google")), emptyMap(), "cl.dinovance.contigo")
        assertEquals("x.gw", r.single { it.bankId == "billetera-google" }.packageName)
        assertEquals(DetectStatus.installed, r.single { it.bankId == "billetera-google" }.status)
    }

    // ---------- solo Wallet: guardado automatico con las mismas barreras de un gasto ----------

    @Test
    fun `solo Wallet, comercio con categoria aprendida, se guarda solo`() {
        assertEquals(Outcome.STORED, walletBuy())
        val d = repo.list().single()
        assertEquals(20_000L, d.candidate.amountClp); assertEquals("Shell Vespucio 1828 F1", d.candidate.merchant)
        assertEquals(Kind.EXPENSE, d.candidate.kind); assertEquals(Confidence.HIGH, d.candidate.confidence); assertEquals("Visa ·1234", d.candidate.account)
        assertTrue(d.autoSaved); assertEquals(DraftStatus.CONFIRMED, d.status); assertEquals(cat, d.categoryId); assertEquals(1, synced)
        assertEquals(now, d.postedAtMillis) // la hora es postTime, no la fecha del texto
    }

    @Test
    fun `solo Wallet, comercio nuevo con categoria general se guarda solo y sin ninguna pregunta`() {
        assertEquals(Outcome.STORED, walletBuy(merchant = "Cafe Nuevo Demo"))
        assertEquals(DraftStatus.PENDING, repo.list().single().status)
        assertTrue(diag.list().any { it.reason == DiagReason.CATEGORY_UNKNOWN })
        profile = profile!!.copy(defaultCategoryId = other)
        minutes(1.0)
        assertEquals(Outcome.STORED, walletBuy(amount = "CLP 4,500", merchant = "Otro Cafe Demo"))
        val d = repo.list().single { it.candidate.amountClp == 4_500L }
        assertTrue(d.autoSaved); assertEquals(other, d.categoryId)
    }

    @Test
    fun `Wallet con la fuente apagada, sin comercio, sobre el tope o con fecha vieja pregunta`() {
        autoOn = false
        walletBuy(); assertTrue(diag.list().first().reason == DiagReason.BANK_OFF)
        autoOn = true; minutes(15.0)
        send(wallet, "Billetera de Google", "CLP 7,000 · 23 nov") // sin comercio
        assertEquals(Confidence.MEDIUM, repo.list().single { it.candidate.amountClp == 7_000L }.candidate.confidence)
        minutes(15.0)
        walletBuy(amount = "CLP 60,000"); assertEquals(DiagReason.CAP_EXCEEDED, diag.list().first().reason)
        minutes(15.0)
        send(wallet, "Shell Vespucio 1828 F1", "20 nov · CLP 9,000") // aviso de hace 3 dias reentregado
        assertEquals(DiagReason.STALE_DATE, diag.list().first().reason)
        assertTrue(repo.list().none { it.autoSaved })
        assertEquals(0, synced)
    }

    @Test
    fun `reembolso de Wallet es ingreso de confianza baja y queda pendiente`() {
        assertEquals(Outcome.STORED, send(wallet, "Reembolso", "Shell Vespucio · CLP 20,000"))
        val d = repo.list().single()
        assertEquals(Kind.INCOME, d.candidate.kind); assertEquals(Confidence.LOW, d.candidate.confidence)
        assertFalse(d.autoSaved); assertEquals(DraftStatus.PENDING, d.status); assertEquals(0, synced)
    }

    @Test
    fun `lo que no es compra no deja borrador`() {
        listOf("Se agregó una tarjeta" to "Visa ••1234", "Compra rechazada" to "Shell · CLP 20,000", "Pago pendiente" to "Shell · CLP 20,000", "Oferta" to "Ahorra CLP 2,000")
            .forEach { (t, x) -> assertEquals(t, Outcome.NOT_A_MOVEMENT, send(wallet, t, x)) }
        assertTrue(repo.list().isEmpty())
        assertEquals(Outcome.NOT_A_MOVEMENT, send(wallet, "Tienda Demo", "USD 12.50"))
    }

    // ---------- regla CROSS-FUENTE ----------

    @Test
    fun `banco primero y Wallet despues - un solo borrador, el segundo es DUPLICATE`() {
        assertEquals(Outcome.STORED, bankBuy())
        minutes(1.0)
        assertEquals(Outcome.DUPLICATE, walletBuy())
        val d = repo.list().single()
        assertEquals(bank, d.sourcePackage); assertEquals("Shell Vespucio", d.candidate.merchant)
        assertEquals(DiagReason.DUPLICATE, diag.list().first().reason)
        assertEquals(1, notifier.shown.size)
    }

    @Test
    fun `Wallet primero y banco despues - gana Wallet`() {
        assertEquals(Outcome.STORED, walletBuy())
        minutes(2.0)
        assertEquals(Outcome.DUPLICATE, bankBuy())
        val d = repo.list().single()
        assertEquals(wallet, d.sourcePackage); assertEquals("Shell Vespucio 1828 F1", d.candidate.merchant)
        assertEquals(1, synced)
    }

    @Test
    fun `el primero sin comercio se completa con el comercio del segundo, sin crear otro`() {
        assertEquals(Outcome.STORED, bankBuy(merchant = null))
        assertNull(repo.list().single().candidate.merchant)
        minutes(3.0)
        assertEquals(Outcome.DUPLICATE, walletBuy())
        val d = repo.list().single()
        assertEquals("Shell Vespucio 1828 F1", d.candidate.merchant); assertEquals(Confidence.HIGH, d.candidate.confidence)
        assertEquals(bank, d.sourcePackage); assertEquals(DraftStatus.PENDING, d.status)
        assertEquals(2, notifier.shown.size) // se vuelve a mostrar con el comercio
    }

    @Test
    fun `si el primero ya se guardo solo y se envio (salio de la bandeja) el segundo igual es duplicado`() {
        profile = profile!!.copy(categories = mapOf(MerchantKey.of("Shell Vespucio") to cat))
        assertEquals(Outcome.STORED, bankBuy())
        val first = repo.list().single()
        assertTrue(first.autoSaved)
        repo.remove(first.id) // ExpenseSyncer lo saca de la cola al enviarlo
        minutes(4.0)
        assertEquals(Outcome.DUPLICATE, walletBuy())
        assertTrue(repo.list().isEmpty()); assertEquals(1, synced)
    }

    @Test
    fun `la memoria sobrevive a la muerte del proceso`() {
        assertEquals(Outcome.STORED, bankBuy())
        minutes(1.0)
        assertEquals(Outcome.DUPLICATE, walletBuy(proc = processor()))
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `montos distintos son dos compras`() {
        assertEquals(Outcome.STORED, bankBuy(amount = "\$20.000"))
        minutes(1.0)
        assertEquals(Outcome.STORED, walletBuy(amount = "CLP 20,500"))
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `mismo monto a 11 minutos son dos compras`() {
        assertEquals(Outcome.STORED, bankBuy())
        minutes(11.0)
        assertEquals(Outcome.STORED, walletBuy())
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `a 9 minutos y 59 segundos todavia es la misma compra`() {
        assertEquals(Outcome.STORED, walletBuy())
        now += 9 * 60_000 + 59_000
        assertEquals(Outcome.DUPLICATE, bankBuy())
    }

    @Test
    fun `misma fuente dos veces, mismo monto, son dos compras (la regla es solo entre fuentes)`() {
        assertEquals(Outcome.STORED, walletBuy())
        minutes(3.0)
        assertEquals(Outcome.STORED, walletBuy())
        assertEquals(2, repo.list().size)
        // Lejos de las de Wallet: dos compras iguales del banco a 3 min tambien son dos (logica de siempre: ventana de 2 min)
        minutes(30.0)
        assertEquals(Outcome.STORED, bankBuy(merchant = "CAFE DEMO"))
        minutes(3.0)
        assertEquals(Outcome.STORED, bankBuy(merchant = "CAFE DEMO"))
        assertEquals(4, repo.list().size)
    }

    @Test
    fun `dos compras reales del banco con su espejo en Wallet quedan dos (emparejamiento uno a uno)`() {
        assertEquals(Outcome.STORED, bankBuy())
        minutes(0.5)
        assertEquals(Outcome.DUPLICATE, walletBuy())
        minutes(4.0)
        assertEquals(Outcome.STORED, bankBuy(merchant = "SHELL VESPUCIO 2"))
        minutes(0.5)
        assertEquals(Outcome.DUPLICATE, walletBuy())
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `el mismo aviso de Wallet reenviado tras ser duplicado sigue siendo duplicado`() {
        assertEquals(Outcome.STORED, bankBuy())
        minutes(1.0)
        val n = IncomingNotice(wallet, "Shell Vespucio 1828 F1", "CLP 20,000", now, key = "k-wallet", whenMillis = now)
        assertEquals(Outcome.DUPLICATE, p.process(n))
        minutes(5.0)
        assertEquals(Outcome.DUPLICATE, p.process(n))
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `un pago de deuda o un ingreso del banco no se cruza con una compra de Wallet`() {
        assertEquals(Outcome.STORED, send(bank, null, "Pagaste \$20.000 a tu CMR Mastercard Premium"))
        minutes(1.0)
        assertEquals(Outcome.STORED, walletBuy())
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `la memoria cross-fuente guarda solo resumenes, ni monto, ni comercio, ni paquete`() {
        bankBuy(); minutes(1.0); walletBuy()
        val raw = memoryStore.v.orEmpty()
        assertTrue(raw.isNotEmpty())
        listOf("20000", "20.000", "20,000", "Shell", "SHELL", bank, wallet, "1234").forEach { assertFalse(it, raw.contains(it)) }
    }

    @Test
    fun `el diagnostico de Wallet enmascara el comercio y la tarjeta`() {
        autoOn = false
        walletBuy()
        val t = diag.list().first().maskedText
        assertFalse(t, t.contains("Shell")); assertFalse(t, t.contains("Vespucio")); assertFalse(t, t.contains("1234")); assertFalse(t, t.contains("20"))
    }
}
