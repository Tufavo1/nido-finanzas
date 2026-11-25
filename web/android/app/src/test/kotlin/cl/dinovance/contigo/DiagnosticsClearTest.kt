// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.DiagClearRequest
import cl.dinovance.contigo.capture.DiagReason
import cl.dinovance.contigo.capture.DiagnosticsLog
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.NoticeLedger
import cl.dinovance.contigo.capture.SafeTextStore
import cl.dinovance.contigo.security.BlobCipher
import cl.dinovance.contigo.security.SecureKeyValueStore
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/** «Borrar» / «Borrar todos» de «Avisos que no pude leer» (plugin clearDiagnostics): solo el diagnostico local, nada mas. */
class DiagnosticsClearTest {
    private val dir: File = Files.createTempDirectory("contigo-diag").toFile().also { it.deleteOnExit() }
    private val failures = mutableListOf<String>()
    private val clock = AtomicLong(1_795_273_230_000L)
    private val bank = "cl.demo.banco"
    private val owner = "u1:h1"

    private fun kv(c: BlobCipher) = SecureKeyValueStore(dir, c) { FileStorage(it) }
    private fun text(kv: SecureKeyValueStore, key: String) =
        SafeTextStore({ kv.get(key) }, { v -> if (v == null) kv.remove(key) else kv.set(key, v) }) { synchronized(failures) { failures += it } }
    private fun files() = dir.walkTopDown().filter { it.isFile }.toList()
    private fun disk(): String = files().joinToString("|") { String(it.readBytes(), Charsets.ISO_8859_1) }

    private val cipher = JvmAesCipher()
    private val store = kv(cipher)
    private val diag = DiagnosticsLog(text(store, "diag-log")) { clock.getAndIncrement() }

    /** Tres entradas con horas distintas: devuelve sus atMillis (la mas nueva primero, como las muestra la lista). */
    private fun seed(): List<Long> {
        diag.add(DiagReason.NO_AMOUNT, "santander", "Hola, revisa tu cuenta 12345")
        diag.add(DiagReason.DUPLICATE, "santander", "Compraste \$4.500 en Cafe Demo")
        diag.add(DiagReason.STALE_DATE, null, "Compra \$9.990 el 20 nov")
        return diag.list().map { it.atMillis }
    }

    @Test
    fun `borrar una entrada por atMillis quita solo esa y devuelve 1`() {
        val (newest, middle, oldest) = seed()
        assertEquals(1, diag.removeAt(middle))
        assertEquals(listOf(newest, oldest), diag.list().map { it.atMillis })
        assertEquals(listOf(DiagReason.STALE_DATE, DiagReason.NO_AMOUNT), diag.list().map { it.reason })
    }

    @Test
    fun `si dos entradas comparten la misma hora se borran ambas`() {
        val fixed = DiagnosticsLog(text(store, "diag-log")) { 42L }
        fixed.add(DiagReason.NO_AMOUNT, null, "a"); fixed.add(DiagReason.INCOME, null, "b")
        clock.set(100L); diag.add(DiagReason.DUPLICATE, null, "c")
        assertEquals(2, diag.removeAt(42L))
        assertEquals(listOf(100L), diag.list().map { it.atMillis })
    }

    @Test
    fun `borrar todos devuelve cuantas habia y deja la lista vacia`() {
        seed()
        assertEquals(3, diag.clearAll())
        assertTrue(diag.list().isEmpty())
        assertEquals(0, diag.clearAll()) // repetir no falla
    }

    @Test
    fun `atMillis inexistente devuelve 0 y no reescribe el almacen`() {
        seed()
        val file = files().single()
        val before = file.readBytes()
        assertEquals(0, diag.removeAt(123L))
        assertArrayEquals(before, file.readBytes()) // mismo bloque cifrado (un reescrito cambiaria el IV)
        assertEquals(3, diag.list().size)
    }

    @Test
    fun `sin datos guardados borrar por hora devuelve 0`() {
        assertEquals(0, diag.removeAt(1L))
        assertTrue(files().isEmpty())
    }

    @Test
    fun `borrar todos no deja datos en el almacen cifrado ni la cuarentena bad`() {
        seed()
        // Un bloque apartado de antes (cuarentena) tambien es del diagnostico: «borrar todos» lo quita
        val bin = files().single()
        File(bin.path + ".bad").writeBytes(byteArrayOf(1, 2, 3))
        assertEquals(3, diag.clearAll())
        assertTrue(files().isEmpty())
        assertNull(store.get("diag-log"))
    }

    @Test
    fun `no toca borradores, el registro anti duplicados ni otras claves del almacen`() {
        val repo = EncryptedDraftRepository(MemoryStorage(), cipher) { clock.get() }
        val ledger = NoticeLedger(text(store, "ledger-v1"))
        val proc = CaptureProcessor({ setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { clock.get() }, { java.util.UUID.randomUUID().toString() },
            ownerProvider = { owner }, requireOwner = true, diag = diag, ledger = ledger)
        proc.process(bank, "Banco", "Compraste \$12.990 en Cafe Demo con tu tarjeta", clock.get())
        proc.process(bank, "Banco", "Hola, revisa tu cuenta 12345", clock.get())
        // El registro solo se llena con avisos que traen clave del sistema: se siembra directo
        ledger.add(NoticeLedger.Entry(NoticeLedger.sha("id"), NoticeLedger.sha("slot"), NoticeLedger.sha("EXPENSE", 12_990L), 1L, "draft-1", clock.get()))
        store.set("session", "token-demo")
        val drafts = repo.list()
        assertEquals(1, drafts.size)
        val ledgerBefore = store.get("ledger-v1")
        assertTrue(ledgerBefore != null && ledgerBefore != "[]")
        assertTrue(diag.list().isNotEmpty())

        diag.removeAt(diag.list().first().atMillis)
        diag.clearAll()

        assertTrue(diag.list().isEmpty())
        assertEquals(drafts, repo.list())
        assertEquals(ledgerBefore, store.get("ledger-v1"))
        assertEquals("token-demo", store.get("session"))
    }

    @Test
    fun `un fallo pasajero del Keystore no borra nada y se informa como error`() {
        seed()
        val file = files().single()
        val before = file.readBytes()
        val busy = object : BlobCipher {
            override fun encrypt(plain: ByteArray): ByteArray = throw IllegalStateException("keystore ocupado")
            override fun decrypt(blob: ByteArray): ByteArray = throw IllegalStateException("keystore ocupado")
        }
        val flaky = DiagnosticsLog(text(kv(busy), "diag-log")) { 1L }
        assertThrowsAny { flaky.removeAt(before.size.toLong()) }
        assertThrowsAny { flaky.clearAll() }
        assertArrayEquals(before, file.readBytes())
        assertFalse(File(file.path + ".bad").exists())
        assertEquals(3, diag.list().size)
        // Ni el texto del aviso ni montos en lo que se registra del fallo: solo el nombre de la clase
        assertTrue(failures.none { it.contains("Cafe") || it.contains("4.500") || it.contains("keystore") })
    }

    @Test
    fun `si no se puede escribir el borrado se informa como error (no se finge exito)`() {
        seed()
        val ro = object : BlobCipher {
            override fun encrypt(plain: ByteArray): ByteArray = throw IllegalStateException("sin espacio")
            override fun decrypt(blob: ByteArray): ByteArray = cipher.decrypt(blob)
        }
        val log = DiagnosticsLog(text(kv(ro), "diag-log")) { 1L }
        val at = log.list()[1].atMillis
        assertThrowsAny { log.removeAt(at) }
        assertEquals(3, diag.list().size)
    }

    @Test
    fun `un bloque ilegible para siempre se trata como vacio y borrar todos limpia la cuarentena`() {
        seed()
        val other = DiagnosticsLog(text(kv(JvmAesCipher()), "diag-log")) { 1L } // otra clave: el bloque queda en .bad
        assertEquals(0, other.removeAt(1L))
        assertTrue(files().all { it.name.endsWith(".bad") })
        assertEquals(0, other.clearAll())
        assertTrue(files().isEmpty())
    }

    @Test
    fun `concurrencia con el procesador que escribe diagnosticos no pierde entradas nuevas`() {
        val repo = EncryptedDraftRepository(MemoryStorage(), cipher) { clock.get() }
        val proc = CaptureProcessor({ setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { clock.getAndIncrement() },
            { java.util.UUID.randomUUID().toString() }, ownerProvider = { owner }, requireOwner = true, diag = diag)
        val target = seed()[1]
        val writers = 8
        val pool = Executors.newFixedThreadPool(writers + 1)
        val start = CountDownLatch(1)
        val removed = AtomicLong(-1)
        repeat(writers) { i -> pool.execute { start.await(); proc.process(bank, "Banco", "Hola, revisa tu cuenta $i", clock.get()) } }
        pool.execute { start.await(); removed.set(diag.removeAt(target).toLong()) }
        start.countDown()
        pool.shutdown()
        assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS))
        assertEquals(1L, removed.get())
        val left = diag.list()
        assertFalse(left.any { it.atMillis == target })
        assertEquals(3 - 1 + writers, left.size) // ningun diagnostico escrito en paralelo se perdio
        assertEquals(writers, left.count { it.reason == DiagReason.NO_AMOUNT } - 1) // +1: el NO_AMOUNT sembrado
        assertEquals(left.size, left.map { it.atMillis }.toSet().size)
        assertFalse(disk().contains("revisa tu cuenta")) // cifrado en reposo
    }

    @Test
    fun `argumentos del puente sin atMillis borra todo y con un numero entero borra esa hora`() {
        assertEquals(DiagClearRequest.All, DiagClearRequest.parse(JSONObject()))
        assertEquals(DiagClearRequest.At(1_795_273_230_000L), DiagClearRequest.parse(JSONObject("{\"atMillis\":1795273230000}")))
        assertEquals(DiagClearRequest.At(42L), DiagClearRequest.parse(JSONObject("{\"atMillis\":42}"))) // Integer, no Long
        assertEquals(DiagClearRequest.At(1_795_273_230_000L), DiagClearRequest.parse(JSONObject().put("atMillis", 1.79527323E12)))
    }

    @Test
    fun `un atMillis invalido nunca se interpreta como borrar todo`() {
        listOf("{\"atMillis\":null}", "{\"atMillis\":\"123\"}", "{\"atMillis\":1.5}", "{\"atMillis\":-1}", "{\"atMillis\":true}", "{\"atMillis\":1e300}")
            .forEach { assertNull(it, DiagClearRequest.parse(JSONObject(it))) }
    }

    private fun assertThrowsAny(block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            return
        }
        fail("se esperaba un error")
    }
}
