// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.AutoSavedLog
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.DraftActions
import cl.dinovance.contigo.capture.DraftRepository
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.capture.TextStore
import cl.dinovance.contigo.sync.ExpenseSyncer
import cl.dinovance.contigo.sync.HttpResult
import cl.dinovance.contigo.sync.HttpTransport
import cl.dinovance.contigo.sync.SessionSource
import cl.dinovance.contigo.sync.SyncResult
import cl.dinovance.contigo.sync.SyncRetryPolicy
import cl.dinovance.contigo.sync.SyncStatusStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * Hallazgo QA 2026-11-24 (dinero real): con modo avion un gasto se guardo solo («Compraste $4.500 en PRUEBA-EMU KIOSCO») y, con la red de
 * vuelta, seguia «se enviara solo» mas de 60 s. Datos SINTETICOS.
 */
class AutoguardadoSinRedTest {
    private val bank = "cl.demo.banco"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private var now = 1_795_273_230_000L // 2026-11-21 (Chile)
    private val repo: DraftRepository = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private var enqueued = 0
    private var autoOn = true
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = if (packageName == bank) "banco-falabella" else null
        override fun autoEnabled(bank: String) = autoOn
        override fun maxClp() = 50_000L
    }
    private val profile = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Prueba Emu Kiosco") to cat))
    private val logStore = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val log = AutoSavedLog(logStore) { now }
    private fun processor() = CaptureProcessor(
        { setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile }, onAutoSaved = { enqueued++ }, autoLog = log,
    )

    private class Session(var token: String? = "tok") : SessionSource {
        override fun accessToken(nowSeconds: Long) = token
        override fun refresh() = false
    }
    private class Status : SyncStatusStore {
        val errors = mutableListOf<String>()
        override fun recordSuccess(nowMillis: Long) {}
        override fun recordError(kind: String, nowMillis: Long) { errors += kind }
    }
    /** Red apagada (modo avion) o encendida; cuenta solo los envios del gasto (no notify). */
    private class Net(var online: Boolean, var answer: HttpResult = HttpResult(201, "")) : HttpTransport {
        var expensePosts = 0
        override fun post(url: String, headers: Map<String, String>, body: String): HttpResult {
            if (!online) throw IOException("sin red")
            if (url.contains("/rest/v1/expenses")) expensePosts++
            return if (url.contains("/rest/v1/expenses")) answer else HttpResult(200, "")
        }
    }
    private fun syncer(net: Net, session: Session = Session(), status: Status = Status()) =
        ExpenseSyncer(repo, { profile }, { owner }, { "https://api.demo.test/supabase" }, session, net, status, { now }, log = log)

    private fun kiosco(): String {
        assertEquals(Outcome.STORED, processor().process(bank, null, "Compra aprobada por $4.500 en PRUEBA-EMU KIOSCO.", now))
        return repo.list().single().id
    }

    @Test
    fun `(b) autoguardado sin red queda confirmado y pendiente (ni rechazado ni para la persona) y se envia UNA vez al volver la red`() {
        val id = kiosco()
        assertEquals("se agenda el envio al guardarse solo", 1, enqueued)
        val net = Net(online = false)
        val status = Status()
        assertEquals(SyncResult.RETRY, syncer(net, status = status).syncOnce())
        assertEquals(listOf("NETWORK"), status.errors)
        val d = repo.list().single()
        assertEquals(DraftStatus.CONFIRMED, d.status)
        assertFalse(d.syncRejected)
        assertTrue(log.listFor(owner).single().let { !it.synced && !it.rejected })
        net.online = true; now += 60_000
        assertEquals(SyncResult.ALL_SENT, syncer(net).syncOnce())
        assertEquals(SyncResult.NOTHING_TO_SEND, syncer(net).syncOnce())
        assertEquals("una sola fila, nunca duplicada", 1, net.expensePosts)
        assertTrue(log.listFor(owner).single { it.id == id.lowercase() }.synced)
    }

    @Test
    fun `(c) la app abierta toma el autoguardado (lo guarda o lo deja en su cola sin red) y quita el borrador - el registro no queda «se enviara solo» para siempre`() {
        val id = kiosco()
        // Lo que hace la app al guardar un CONFIRMADO (planDrafts lo toma aunque sea autoSaved): insert o cola propia, y luego removeDraft
        assertTrue(DraftActions.removeTakenByApp(repo, log, id, owner))
        val net = Net(online = true)
        assertEquals("el telefono ya no lo envia: lo envia la app", SyncResult.NOTHING_TO_SEND, syncer(net).syncOnce())
        val entry = log.listFor(owner).single()
        assertTrue("antes: nadie marcaba el registro y quedaba «se enviara solo» hasta que caducaba a los 14 dias", entry.synced)
        assertTrue("la app avisa a la pareja con su propio guardado: el telefono no insiste con notify", entry.notified)
        assertEquals(0, net.expensePosts)
    }

    @Test
    fun `(c) quitar el borrador desde «Ignorar» o con otro dueño no marca nada, y uno rechazado sigue rechazado`() {
        val id = kiosco()
        assertFalse("otro dueño no lo quita ni lo marca", DraftActions.removeTakenByApp(repo, log, id, "otro:hogar"))
        assertFalse(DraftActions.removeTakenByApp(repo, log, id, null))
        assertTrue(repo.list().isNotEmpty())
        assertFalse(log.listFor(owner).single().synced)
        // Rechazado por la base: la app lo muestra y la persona puede descartarlo; jamas pasa a «enviado»
        syncer(Net(online = true, answer = HttpResult(400, "{\"code\":\"23514\"}"))).syncOnce()
        assertTrue(DraftActions.removeTakenByApp(repo, log, id, owner))
        assertTrue(log.listFor(owner).single().let { it.rejected && !it.synced })
    }

    @Test
    fun `(d) guardar desde la notificacion sin red usa el mismo envio - queda confirmado y sale una vez con red`() {
        autoOn = false // banco sin guardado automatico: el aviso pide confirmar y la persona toca «Guardar»
        assertEquals(Outcome.STORED, processor().process(bank, null, "Compra aprobada por $9.000 en PRUEBA-EMU KIOSCO.", now))
        val id = repo.list().single().id
        assertTrue(DraftActions.saveFromNotification(repo, id, owner))
        val net = Net(online = false)
        assertEquals(SyncResult.RETRY, syncer(net).syncOnce())
        assertEquals(DraftStatus.CONFIRMED, repo.list().single().status)
        net.online = true
        assertEquals(SyncResult.ALL_SENT, syncer(net).syncOnce())
        assertEquals(SyncResult.NOTHING_TO_SEND, syncer(net).syncOnce())
        assertEquals(1, net.expensePosts)
        assertTrue("no es un guardado solo: no entra al registro", log.listFor(owner).isEmpty())
    }

    @Test
    fun `(a) el reintento con red empieza en 30 s, se duplica y nunca pasa de 15 min (antes WorkManager llegaba a 5 h)`() {
        assertEquals(listOf(30_000L, 60_000L, 120_000L, 240_000L, 480_000L, 900_000L, 900_000L), (1..7).map(SyncRetryPolicy::delayMillis))
        assertTrue((1..10_000).all { SyncRetryPolicy.delayMillis(it) in 30_000L..900_000L })
        assertEquals(30_000L, SyncRetryPolicy.nextDelayMillis(SyncResult.RETRY, 0))
        assertEquals("la pasada lanzo: tambien reintenta", 30_000L, SyncRetryPolicy.nextDelayMillis(null, 0))
    }

    @Test
    fun `(a) REJECTED, nada que enviar, enviado, sin sesion y falta la persona no reintentan`() {
        for (r in listOf(SyncResult.REJECTED, SyncResult.NOTHING_TO_SEND, SyncResult.ALL_SENT, SyncResult.NO_SESSION, SyncResult.NEEDS_PERSON)) {
            assertEquals(r.name, null, SyncRetryPolicy.nextDelayMillis(r, 0))
        }
        val id = kiosco()
        val net = Net(online = true, answer = HttpResult(400, "{\"code\":\"23514\"}"))
        assertEquals(SyncResult.REJECTED, syncer(net).syncOnce())
        assertEquals("un rechazado no se reenvia solo", SyncResult.NOTHING_TO_SEND, syncer(net).syncOnce())
        assertEquals(1, net.expensePosts)
        assertTrue(repo.list().single { it.id == id }.syncRejected)
    }

    @Test
    fun `(a) sin token el reintento es acotado - pide reintento, pero la cadena para tras el tope de intentos`() {
        kiosco()
        val status = Status()
        val net = Net(online = true)
        assertEquals(SyncResult.RETRY, syncer(net, Session(token = null), status).syncOnce())
        assertEquals(listOf("AUTH"), status.errors)
        assertEquals(0, net.expensePosts)
        // Simula la cadena del trabajo en segundo plano: cada pasada sin token agenda la siguiente hasta el tope, y luego se detiene
        var attempts = 0
        var waited = 0L
        while (true) {
            val r = syncer(net, Session(token = null)).syncOnce()
            val delay = SyncRetryPolicy.nextDelayMillis(r, attempts) ?: break
            assertTrue(delay <= SyncRetryPolicy.MAX_DELAY_MILLIS)
            waited += delay; attempts++
        }
        assertEquals(SyncRetryPolicy.MAX_ATTEMPTS, attempts)
        assertTrue("acotado: menos de 12 h de reintentos", waited < 12L * 60 * 60 * 1000)
        assertEquals("el gasto sigue en la cola para la proxima vez (app abierta, aviso nuevo)", 1, repo.list().size)
    }
}
