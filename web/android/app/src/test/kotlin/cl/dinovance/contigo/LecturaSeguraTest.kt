// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoSavedEntry
import cl.dinovance.contigo.capture.AutoSavedLog
import cl.dinovance.contigo.capture.DiagReason
import cl.dinovance.contigo.capture.DiagnosticsLog
import cl.dinovance.contigo.capture.NoticeLedger
import cl.dinovance.contigo.capture.PurchaseMemory
import cl.dinovance.contigo.capture.SafeTextStore
import cl.dinovance.contigo.capture.SeenNotices
import cl.dinovance.contigo.capture.TextStore
import cl.dinovance.contigo.security.BlobCipher
import cl.dinovance.contigo.security.SecureKeyValueStore
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.security.ProviderException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * R7, lectura segura antes de escribir: un fallo PASAJERO del Keystore durante add/mark* no puede pisar lo guardado (historial de
 * diagnostico, guardados automaticos y, lo mas grave, el registro anti-duplicados de avisos). Archivos reales cifrados (AES-GCM).
 */
class LecturaSeguraTest {
    private val dir: File = Files.createTempDirectory("contigo-r7").toFile().also { it.deleteOnExit() }
    private val cipher = FlakyCipher(JvmAesCipher())
    private val failures = java.util.Collections.synchronizedList(mutableListOf<String>())
    private val kv = SecureKeyValueStore(dir, cipher) { FileStorage(it) }
    private fun text(key: String) = SafeTextStore({ kv.get(key) }, { v -> if (v == null) kv.remove(key) else kv.set(key, v) }) { failures += it }

    private fun blob(): File = dir.listFiles().orEmpty().single { it.name.endsWith(".bin") }
    private fun bad(): List<File> = dir.listFiles().orEmpty().filter { it.name.endsWith(".bad") }
    private fun entry(id: String, at: Long = NOW) = AutoSavedEntry(id, 12_990, "Cafe Central", at, false, "u1:h1")

    @Test
    fun `diagnostico - un fallo pasajero durante add deja el archivo byte a byte y sin bad, y la entrada se escribe al volver`() {
        val log = DiagnosticsLog(text("diag-log"), { failures += it }) { NOW }
        log.add(DiagReason.NO_AMOUNT, "santander", "Compraste \$1.000 en Cafe")
        log.add(DiagReason.DUPLICATE, "santander", "Compraste \$2.000 en Pan")
        val before = blob().readBytes()

        cipher.failing.set(true)
        log.add(DiagReason.LOW_CONFIDENCE, "santander", "Compraste \$3.000 en Taxi")
        assertArrayEquals(before, blob().readBytes())
        assertTrue(bad().isEmpty())

        cipher.failing.set(false)
        log.add(DiagReason.BANK_OFF, "santander", "Compraste \$4.000 en Luz")
        assertEquals(listOf(DiagReason.BANK_OFF, DiagReason.LOW_CONFIDENCE, DiagReason.DUPLICATE, DiagReason.NO_AMOUNT), DiagnosticsLog(text("diag-log")) { NOW }.list().map { it.reason })
        // Solo nombres de clase, jamas texto ni montos del aviso
        assertTrue(failures.isNotEmpty() && failures.all { it == "ProviderException" })
    }

    @Test
    fun `guardados automaticos - add y mark durante un fallo pasajero no pisan el historial`() {
        val log = AutoSavedLog(text("auto-log")) { NOW }
        log.add(entry("a"))
        log.add(entry("b"))
        val before = blob().readBytes()

        cipher.failing.set(true)
        log.add(entry("c"))
        log.markSynced("a")
        log.markRejected("b")
        log.markNotified("a")
        assertArrayEquals(before, blob().readBytes())
        assertTrue(bad().isEmpty())

        cipher.failing.set(false)
        log.add(entry("d"))
        val stored = AutoSavedLog(text("auto-log")) { NOW }.list()
        assertEquals(listOf("d", "c", "b", "a"), stored.map { it.id })
        assertTrue(stored.first { it.id == "a" }.synced && stored.first { it.id == "a" }.notified)
        assertTrue(stored.first { it.id == "b" }.rejected)
    }

    @Test
    fun `registro anti-duplicados - un fallo pasajero durante add no borra el aviso conocido y sigue deduplicando al volver`() {
        val ledger = NoticeLedger(text("notice-ledger"))
        ledger.add(NoticeLedger.Entry("conocido", "slot", "money", 1L, "draft-1", NOW))
        val before = blob().readBytes()

        cipher.failing.set(true)
        ledger.add(NoticeLedger.Entry("nuevo", "slot2", "money", 2L, "draft-2", NOW))
        assertArrayEquals(before, blob().readBytes())
        assertTrue(bad().isEmpty())
        // En este proceso el nuevo ya deduplica aunque no se haya escrito
        assertTrue(ledger.has("nuevo"))

        cipher.failing.set(false)
        assertTrue(ledger.has("conocido"))
        ledger.add(NoticeLedger.Entry("otro", "slot3", "money", 3L, "draft-3", NOW))
        // Un proceso nuevo (lo que queda en disco) reconoce los tres
        val fresh = NoticeLedger(text("notice-ledger"))
        assertTrue(fresh.has("conocido"))
        assertTrue(fresh.has("nuevo"))
        assertTrue(fresh.has("otro"))
    }

    @Test
    fun `memoria cross-fuente y avisos vistos - un fallo pasajero no borra lo guardado`() {
        val purchases = PurchaseMemory(text("purchase-memory"))
        purchases.add("cl.banco.demo", 12_990, NOW, "draft-1", NOW)
        val seen = SeenNotices(text("seen-notices"))
        seen.mark("cl.banco.demo", "k1", NOW)
        val before = dir.listFiles().orEmpty().filter { it.name.endsWith(".bin") }.associate { it.name to it.readBytes() }

        cipher.failing.set(true)
        purchases.add("cl.banco.demo", 5_000, NOW, "draft-2", NOW)
        assertNotNull(purchases.claim("com.google.android.apps.walletnfcrel", 5_000, NOW + 1_000, NOW))
        seen.mark("cl.banco.demo", "k2", NOW)
        before.forEach { (name, bytes) -> assertArrayEquals(name, bytes, File(dir, name).readBytes()) }
        assertTrue(bad().isEmpty())

        cipher.failing.set(false)
        // Lo guardado antes del fallo sigue tapando a su espejo y el aviso visto sigue visto
        val freshPurchases = PurchaseMemory(text("purchase-memory"))
        assertNotNull(freshPurchases.claim("com.google.android.apps.walletnfcrel", 12_990, NOW + 2_000, NOW))
        assertTrue(SeenNotices(text("seen-notices")).has("cl.banco.demo", "k1", NOW))
        seen.mark("cl.banco.demo", "k3", NOW)
        val freshSeen = SeenNotices(text("seen-notices"))
        assertTrue(freshSeen.has("cl.banco.demo", "k2", NOW) && freshSeen.has("cl.banco.demo", "k3", NOW))
    }

    @Test
    fun `fallo permanente (clave perdida) mantiene la cuarentena bad y la entrada nueva se guarda`() {
        val ledger = NoticeLedger(text("notice-ledger"))
        ledger.add(NoticeLedger.Entry("viejo", "slot", "money", 1L, "draft-1", NOW))
        cipher.lostKey.set(true)
        ledger.add(NoticeLedger.Entry("nuevo", "slot", "money", 2L, "draft-2", NOW))
        assertEquals(1, bad().size)
        cipher.lostKey.set(false)
        val fresh = NoticeLedger(text("notice-ledger"))
        assertTrue(fresh.has("nuevo"))
        assertFalse(fresh.has("viejo"))
    }

    @Test
    fun `los tres almacenes leen con readChecked y escriben con writeChecked al modificar`() {
        val spy = SpyStore()
        DiagnosticsLog(spy) { NOW }.add(DiagReason.NO_AMOUNT, null, "x")
        AutoSavedLog(spy) { NOW }.apply { add(entry("a")); markSynced("a"); markRejected("a"); markNotified("a"); remove("a") }
        NoticeLedger(spy).add(NoticeLedger.Entry("i", "s", "m", 1L, "d", NOW))
        PurchaseMemory(spy).add("p", 1, NOW, "d", NOW)
        SeenNotices(spy).mark("p", "k", NOW)
        assertEquals(0, spy.plainReads.get())
        assertEquals(0, spy.plainWrites.get())
        assertTrue(spy.checkedReads.get() > 0 && spy.checkedWrites.get() > 0)
    }

    @Test
    fun `varios hilos con el Keystore intermitente no pierden avisos conocidos ni dejan bad`() {
        val ledger = NoticeLedger(text("notice-ledger"))
        ledger.add(NoticeLedger.Entry("base", "s", "m", 0L, "d0", NOW))
        cipher.flakyEvery.set(3)
        val pool = Executors.newFixedThreadPool(8)
        val start = CountDownLatch(1)
        val threads = 8
        val perThread = 15
        repeat(threads) { t ->
            pool.submit {
                start.await()
                repeat(perThread) { i -> ledger.add(NoticeLedger.Entry("t$t-$i", "s$t", "m", i.toLong(), "d$t$i", NOW)) }
            }
        }
        start.countDown()
        pool.shutdown()
        assertTrue(pool.awaitTermination(30, TimeUnit.SECONDS))
        cipher.flakyEvery.set(0)
        ledger.add(NoticeLedger.Entry("final", "s", "m", 99L, "dF", NOW))
        assertTrue(bad().isEmpty())
        val fresh = NoticeLedger(text("notice-ledger"))
        assertTrue(fresh.has("base"))
        repeat(threads) { t -> repeat(perThread) { i -> assertTrue("t$t-$i", fresh.has("t$t-$i")) } }
        assertTrue(fresh.has("final"))
    }

    /**
     * Keystore de prueba. [failing]: descifrar falla de forma pasajera pero cifrar funciona (el caso que borraba: lee «vacio» y escribe
     * encima). [lostKey]: clave perdida (permanente). [flakyEvery]: cifrar o descifrar falla 1 de cada N llamadas.
     */
    class FlakyCipher(private val real: BlobCipher) : BlobCipher {
        val failing = AtomicBoolean(false)
        val lostKey = AtomicBoolean(false)
        val flakyEvery = AtomicInteger(0)
        private val calls = AtomicInteger(0)

        private fun check() {
            val n = flakyEvery.get()
            if (n > 0 && calls.incrementAndGet() % n == 0) throw ProviderException("Keystore ocupado")
        }

        override fun encrypt(plain: ByteArray): ByteArray { check(); return real.encrypt(plain) }

        override fun decrypt(blob: ByteArray): ByteArray {
            if (lostKey.get()) throw javax.crypto.AEADBadTagException("otra clave")
            if (failing.get()) throw ProviderException("Keystore ocupado")
            check()
            return real.decrypt(blob)
        }
    }

    /** Cuenta que metodo de lectura/escritura se uso. */
    class SpyStore : TextStore {
        private var value: String? = null
        val plainReads = AtomicInteger()
        val plainWrites = AtomicInteger()
        val checkedReads = AtomicInteger()
        val checkedWrites = AtomicInteger()
        override fun read(): String? { plainReads.incrementAndGet(); return value }
        override fun readChecked(): String? { checkedReads.incrementAndGet(); return value }
        override fun write(value: String?) { plainWrites.incrementAndGet(); this.value = value }
        override fun writeChecked(value: String?) { checkedWrites.incrementAndGet(); this.value = value }
    }

    private companion object {
        const val NOW = 1_764_000_000_000L
    }
}
