// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftCleanup
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.security.BlobCipher
import cl.dinovance.contigo.sync.ExpenseSyncer
import cl.dinovance.contigo.sync.HttpResult
import cl.dinovance.contigo.sync.HttpTransport
import cl.dinovance.contigo.sync.SendNow
import cl.dinovance.contigo.sync.SendNowReply
import cl.dinovance.contigo.sync.SendNowRunner
import cl.dinovance.contigo.sync.SessionSource
import cl.dinovance.contigo.sync.SyncReport
import cl.dinovance.contigo.sync.SyncResult
import cl.dinovance.contigo.sync.SyncStatusStore
import cl.nido.parser.Confidence
import cl.nido.parser.Kind
import cl.nido.parser.ParsedCandidate
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Las 3 piezas del plugin que quedaron pendientes tras la falla de QA 2026-11-24 («Enviar ahora» no hacia nada):
 * 1) «Enviar ahora» (syncNow) responde cuantos salieron, fallaron o necesitan a la persona, nunca un exito mudo;
 * 2) «Vaciar movimientos pendientes» (clearPending) borra SOLO los PENDIENTES del dueno activo, bajo el cerrojo del envio;
 * 3) «Borrar lo capturado» (clearCaptured) sigue siendo total, pero dice cuantos confirmados sin enviar se llevo.
 * Datos SINTETICOS.
 */
class EnviarAhoraYVaciarTest {
    private val owner = "u1:h1"
    private var now = 1_795_532_400_000L
    private val storage = MemoryStorage()
    private val cipher = FlakyCipher(JvmAesCipher())
    private val repo = EncryptedDraftRepository(storage, cipher) { now }
    private val notifier = RecordingNotifier()
    private val syncer = ExpenseSyncer(repo, { null as AutoProfile? }, { owner }, { "https://api.demo.test/supabase" }, NoSession, NoNet, NoStatus, { now })
    private val pool = Executors.newSingleThreadExecutor()
    private val timer = Executors.newSingleThreadScheduledExecutor()

    @After
    fun cerrar() { pool.shutdownNow(); timer.shutdownNow() }

    /** Keystore que puede fallar de forma PASAJERA (no es clave perdida): la cola no debe tocarse. */
    private class FlakyCipher(val real: BlobCipher) : BlobCipher {
        var busy = false
        override fun encrypt(plain: ByteArray) = if (busy) throw java.security.ProviderException("keystore ocupado") else real.encrypt(plain)
        override fun decrypt(blob: ByteArray) = if (busy) throw java.security.ProviderException("keystore ocupado") else real.decrypt(blob)
    }
    private object NoSession : SessionSource { override fun accessToken(nowSeconds: Long) = null; override fun refresh() = false }
    private object NoNet : HttpTransport { override fun post(url: String, headers: Map<String, String>, body: String) = HttpResult(500, "") }
    private object NoStatus : SyncStatusStore { override fun recordSuccess(nowMillis: Long) {}; override fun recordError(kind: String, nowMillis: Long) {} }

    private fun draft(status: DraftStatus, ownerKey: String? = owner, kind: Kind = Kind.EXPENSE, rejected: Boolean = false) = Draft(
        java.util.UUID.randomUUID().toString(),
        ParsedCandidate(amountClp = 12_990, merchant = "Prueba Tienda", kind = kind, confidence = Confidence.HIGH, installment = null, fingerprint = "f-${java.util.UUID.randomUUID()}"),
        now, now, status, "cl.demo.banco", ownerKey, syncRejected = rejected,
    ).also { assertTrue(repo.add(it)) }

    // ---- 1) «Enviar ahora»

    @Test
    fun `Enviar ahora entrega las cuentas del envio y solo agenda el segundo plano si hay que reintentar`() {
        assertEquals(SendNowReply(2, 0, 1, "NEEDS_PERSON", scheduleBackground = false), SendNow.reply(SyncReport(SyncResult.NEEDS_PERSON, 2, 0, 1)))
        assertEquals(SendNowReply(1, 0, 0, "ALL_SENT", scheduleBackground = false), SendNow.reply(SyncReport(SyncResult.ALL_SENT, 1, 0, 0)))
        assertEquals(SendNowReply(0, 3, 0, "RETRY", scheduleBackground = true), SendNow.reply(SyncReport(SyncResult.RETRY, 0, 3, 0)))
        assertEquals(SendNowReply(0, 0, 0, "NO_SESSION", scheduleBackground = false), SendNow.reply(SyncReport(SyncResult.NO_SESSION, 0, 0, 0)))
    }

    @Test
    fun `si el envio falla (excepcion) responde FAILED y agenda el segundo plano - jamas un exito mudo`() {
        assertEquals(SendNowReply(0, 0, 0, SendNow.FAILED, scheduleBackground = true), SendNow.reply(null))
        val replies = LinkedBlockingQueue<SendNowReply>()
        val scheduled = AtomicInteger()
        val errors = mutableListOf<String>()
        SendNowRunner(pool, timer, 5_000).start({ throw IllegalStateException("monto 12990 de Prueba Tienda") }, { scheduled.incrementAndGet() }, { synchronized(errors) { errors += it } }, { replies.put(it) })
        val r = replies.poll(5, TimeUnit.SECONDS)!!
        assertEquals(SendNow.FAILED, r.result)
        assertEquals(1, scheduled.get())
        assertEquals("solo el nombre de la clase, nunca el mensaje", listOf("IllegalStateException"), synchronized(errors) { errors.toList() })
    }

    @Test
    fun `el envio corre fuera del hilo que llama y responde una sola vez con las cuentas`() {
        val caller = Thread.currentThread()
        var ranOn: Thread? = null
        val replies = LinkedBlockingQueue<SendNowReply>()
        SendNowRunner(pool, timer, 5_000).start({ ranOn = Thread.currentThread(); SyncReport(SyncResult.ALL_SENT, 2, 0, 0) }, { fail("no hay que reintentar") }, {}, { replies.put(it) })
        assertEquals(SendNowReply(2, 0, 0, "ALL_SENT", false), replies.poll(5, TimeUnit.SECONDS))
        assertTrue(ranOn != null && ranOn != caller)
        assertEquals("una sola respuesta", null, replies.poll(200, TimeUnit.MILLISECONDS))
    }

    @Test
    fun `pasado el tope responde IN_PROGRESS, agenda el segundo plano y no responde dos veces cuando termina`() {
        val release = CountDownLatch(1)
        val finished = CountDownLatch(1)
        val replies = LinkedBlockingQueue<SendNowReply>()
        val scheduled = AtomicInteger()
        SendNowRunner(pool, timer, 100).start({ release.await(); SyncReport(SyncResult.ALL_SENT, 1, 0, 0).also { finished.countDown() } }, { scheduled.incrementAndGet() }, {}, { replies.put(it) })
        val first = replies.poll(5, TimeUnit.SECONDS)!!
        assertEquals(SendNowReply(0, 0, 0, SendNow.IN_PROGRESS, scheduleBackground = true), first)
        assertEquals(1, scheduled.get())
        release.countDown()
        assertTrue(finished.await(5, TimeUnit.SECONDS))
        assertEquals(null, replies.poll(300, TimeUnit.MILLISECONDS))
    }

    @Test
    fun `el tope de Enviar ahora es de 20 s`() {
        assertEquals(20_000L, SendNow.DEADLINE_MILLIS)
    }

    // ---- 2) «Vaciar movimientos pendientes»

    @Test
    fun `clearPending borra solo los PENDIENTES del dueno activo, cancela SOLO sus notificaciones y avisa el cambio`() {
        val pend1 = draft(DraftStatus.PENDING)
        val pend2 = draft(DraftStatus.PENDING, kind = Kind.INCOME)
        val saved = draft(DraftStatus.CONFIRMED)
        val ajeno = draft(DraftStatus.PENDING, ownerKey = "u2:h2")
        var changed = 0
        assertEquals(2, DraftCleanup.clearPendingNow(syncer, repo, owner, notifier) { changed++ })
        assertEquals(setOf(pend1.id, pend2.id), notifier.cancelled.toSet())
        assertEquals(setOf(saved.id, ajeno.id), repo.list().map { it.id }.toSet())
        assertEquals(1, changed)
        // Nada que borrar: no avisa ni cancela nada
        assertEquals(0, DraftCleanup.clearPendingNow(syncer, repo, owner, notifier) { changed++ })
        assertEquals(1, changed); assertEquals(2, notifier.cancelled.size)
        // Sin dueno activo no borra nada
        assertEquals(0, DraftCleanup.clearPendingNow(syncer, repo, null, notifier) { changed++ })
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `clearPending ante un fallo pasajero del Keystore lanza sin borrar ni cancelar nada (A1)`() {
        draft(DraftStatus.PENDING); draft(DraftStatus.CONFIRMED)
        val before = storage.bytes!!.copyOf()
        cipher.busy = true
        var changed = 0
        try {
            DraftCleanup.clearPendingNow(syncer, repo, owner, notifier) { changed++ }
            fail("debia lanzar para que el plugin responda STORE_UNAVAILABLE")
        } catch (e: java.security.ProviderException) {
            // esperado
        }
        assertArrayEquals(before, storage.bytes)
        assertEquals(null, storage.quarantined)
        assertTrue(notifier.cancelled.isEmpty()); assertEquals(0, changed)
        cipher.busy = false
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `clearPending espera al envio en curso (mismo cerrojo) en vez de cruzarse con el`() {
        draft(DraftStatus.PENDING)
        val inside = CountDownLatch(1)
        val release = CountDownLatch(1)
        val sending = Thread { syncer.coordinated { inside.countDown(); release.await() } }.apply { start() }
        assertTrue(inside.await(5, TimeUnit.SECONDS))
        val result = LinkedBlockingQueue<Int>()
        Thread { result.put(DraftCleanup.clearPendingNow(syncer, repo, owner, notifier) {}) }.start()
        assertEquals("no entra mientras el envio tiene el cerrojo", null, result.poll(300, TimeUnit.MILLISECONDS))
        release.countDown()
        assertEquals(1, result.poll(5, TimeUnit.SECONDS))
        sending.join(5_000)
    }

    // ---- 3) «Borrar lo capturado» (total, por privacidad)

    @Test
    fun `Borrar lo capturado borra TODO y dice cuantos confirmados sin enviar del dueno se llevo`() {
        draft(DraftStatus.PENDING)
        val saved = draft(DraftStatus.CONFIRMED)
        draft(DraftStatus.CONFIRMED, rejected = true)
        draft(DraftStatus.CONFIRMED, ownerKey = "u2:h2")
        assertEquals(1, DraftCleanup.clearAllNow(syncer, repo, owner, notifier))
        assertTrue("borrado total, tambien lo confirmado y lo ajeno", repo.list().isEmpty())
        assertEquals(4, notifier.cancelled.size); assertTrue(saved.id in notifier.cancelled)
        assertEquals(0, DraftCleanup.clearAllNow(syncer, repo, owner, notifier))
    }

    // ---- Contrato del plugin (codigo Android: no corre en la JVM, se revisa el fuente)

    private val plugin = File("src/main/kotlin/cl/dinovance/contigo/plugin/ContigoNativePlugin.kt").readText()
    private fun body(name: String) = plugin.substringAfter("fun $name(").substringBefore("@PluginMethod")

    @Test
    fun `contrato - syncNow responde las cuentas con SendNowRunner y nunca un resolve vacio`() {
        val b = body("syncNow")
        assertTrue(b.contains("sendNowRunner.start(")); assertTrue(plugin.contains("SendNowRunner(")); assertTrue(b.contains("syncer.syncWithReport()"))
        assertTrue(b.contains("SyncScheduler.enqueue(context)"))
        for (k in listOf("\"sent\"", "\"failed\"", "\"needsPerson\"", "\"result\"")) assertTrue(k, b.contains(k))
        assertFalse(b.contains("call.resolve()"))
    }

    @Test
    fun `contrato - clearPending existe, usa el cerrojo del envio y rechaza STORE_UNAVAILABLE`() {
        assertTrue(plugin.contains("@PluginMethod\n    fun clearPending(call: PluginCall)"))
        val b = body("clearPending")
        assertTrue(b.contains("DraftCleanup.clearPendingNow(graph.syncer"))
        assertTrue(b.contains("\"removed\"")); assertTrue(b.contains("STORE_UNAVAILABLE"))
        assertTrue(b.contains("e.javaClass.simpleName"))
    }

    @Test
    fun `contrato - clearCaptured sigue siendo total y responde unsentRemoved`() {
        val b = body("clearCaptured")
        assertTrue(b.contains("DraftCleanup.clearAllNow(graph.syncer"))
        assertTrue(b.contains("\"unsentRemoved\""))
        for (k in listOf("graph.recent.clear()", "graph.autoLog.clear()", "graph.diagnostics.clear()", "graph.clearProfile()")) assertTrue(k, b.contains(k))
    }

    @Test
    fun `el plugin no escribe en Logcat`() {
        assertFalse(Regex("\\bLog\\.[a-z]\\(").containsMatchIn(plugin))
        assertFalse(plugin.contains("printStackTrace"))
    }
}
