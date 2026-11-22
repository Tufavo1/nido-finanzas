// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.AutoSavedEntry
import cl.dinovance.contigo.capture.AutoSavedLog
import cl.dinovance.contigo.capture.CaptureProcessor
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
import cl.dinovance.contigo.sync.SyncStatusStore
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/** Registro automatico por banco y envio en segundo plano. Datos SINTETICOS; los avisos reales de los bancos NO estan verificados. */
class AutoSaveTest {
    private val bank = "cl.demo.banco"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private var now = 1_795_273_230_000L // 2026-11-21 (Chile)
    private var ids = 0
    private val repo: DraftRepository = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private var autoOn = true
    private var cap = 50_000L
    private var synced = 0
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = if (packageName == bank) "santander" else null
        override fun autoEnabled(bank: String) = autoOn
        override fun maxClp() = cap
    }
    private var profile: AutoProfile? = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Cafe Demo Norte") to cat))
    private val logStore = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val log = AutoSavedLog(logStore) { now }
    private val notifier = RecordingNotifier()
    private fun processor() = CaptureProcessor(
        { setOf(bank) }, repo, notifier, RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile }, onAutoSaved = { synced++ }, autoLog = log,
    )
    private fun text(amount: String = "$6.500", merchant: String = "CAFE DEMO NORTE") = "Compra aprobada por $amount en $merchant."

    @Test
    fun `un gasto de un banco activado, con categoria aprendida y dentro del tope se guarda solo y agenda el envio`() {
        assertEquals(Outcome.STORED, processor().process(bank, null, text(), now))
        val d = repo.list().single()
        assertEquals(DraftStatus.CONFIRMED, d.status)
        assertEquals(cat, d.categoryId)
        assertTrue(d.autoSaved)
        assertEquals(1, synced)
        assertEquals(1, log.list().size)
    }

    @Test
    fun `por defecto (apagado), sobre el tope, sin categoria aprendida, otro dueno o abono piden confirmacion`() {
        autoOn = false
        processor().process(bank, null, text(), now)
        assertEquals(DraftStatus.PENDING, repo.list().single().status)
        autoOn = true; now += 200_000
        processor().process(bank, null, text("$50.001"), now) // sobre el tope (50.000 inclusivo)
        now += 200_000
        processor().process(bank, null, text(merchant = "TIENDA NUEVA"), now) // sin categoria aprendida
        profile = profile!!.copy(ownerKey = "otro:hogar"); now += 200_000
        processor().process(bank, null, text("$7.000"), now)
        assertTrue(repo.list().none { it.autoSaved })
        assertEquals(0, synced)
        assertEquals(Outcome.NOT_A_MOVEMENT, processor().process(bank, null, "Abono recibido por $20.000 de CAFE DEMO NORTE", now))
    }

    @Test
    fun `el tope es inclusivo y se puede cambiar`() {
        processor().process(bank, null, text("$50.000"), now)
        assertTrue(repo.list().single().autoSaved)
        cap = 10_000; now += 200_000
        processor().process(bank, null, text("$10.001"), now)
        assertFalse(repo.list().last().autoSaved)
    }

    @Test
    fun `un posible duplicado no se guarda solo`() {
        val p = processor()
        p.process(bank, null, text(), now)
        now += 100_000
        p.process(bank, null, text(), now)
        val l = repo.list()
        assertTrue(l[0].autoSaved)
        assertTrue(l[1].possibleDuplicate && !l[1].autoSaved && l[1].status == DraftStatus.PENDING)
    }

    // ---- ExpenseSyncer ----
    private class FakeSession(var token: String? = "tok", var refreshOk: Boolean = true) : SessionSource {
        var refreshes = 0
        override fun accessToken(nowSeconds: Long) = token
        override fun refresh(): Boolean { refreshes++; if (refreshOk) token = "tok2"; return refreshOk }
    }
    private class FakeStatus : SyncStatusStore {
        var ok = 0; val errors = mutableListOf<String>()
        override fun recordSuccess(nowMillis: Long) { ok++ }
        override fun recordError(kind: String, nowMillis: Long) { errors += kind }
    }
    private class Net(val answers: MutableList<() -> HttpResult>) : HttpTransport {
        val sent = mutableListOf<Triple<String, Map<String, String>, String>>()
        /** Solo los envios del gasto (no el aviso notify). */
        val expenses get() = sent.filter { it.first.contains("/rest/v1/expenses") }
        override fun post(url: String, headers: Map<String, String>, body: String): HttpResult { sent += Triple(url, headers, body); return (if (answers.isEmpty()) { { HttpResult(201, "") } } else answers.removeAt(0))() }
    }
    private fun syncer(net: Net, session: FakeSession = FakeSession(), status: FakeStatus = FakeStatus()) =
        ExpenseSyncer(repo, { profile }, { owner }, { "https://api.demo.test/supabase" }, session, net, status, { now }, log = log)

    private fun saveOne() { processor().process(bank, null, text(), now) }

    @Test
    fun `envia la fila con el mismo id del borrador, la fecha de Chile, con el Origin del Worker, y borra el borrador al exito`() {
        saveOne()
        val d = repo.list().single()
        val net = Net(mutableListOf({ HttpResult(201, "") }))
        val status = FakeStatus()
        assertEquals(SyncResult.ALL_SENT, syncer(net, status = status).syncOnce())
        val (url, headers, body) = net.expenses.single()
        assertTrue("se aviso a la pareja con el mismo token", net.sent.last().first.endsWith("/functions/v1/notify") && net.sent.last().second["Authorization"] == "Bearer tok")
        assertEquals("{\"kind\":\"expense\",\"id\":\"${d.id}\"}", net.sent.last().third)
        assertEquals("https://api.demo.test/supabase/rest/v1/expenses", url)
        assertEquals("Bearer tok", headers["Authorization"])
        assertEquals("https://api.demo.test", headers["Origin"])
        assertTrue(net.sent.all { it.second["Origin"] == "https://api.demo.test" && it.second.keys.none { k -> k.equals("Sec-Fetch-Site", true) } }) // tambien notify
        assertEquals("https://x.test:8443", ExpenseSyncer.apiOrigin("https://x.test:8443/supabase"))
        val row = JSONObject(body)
        assertEquals(d.id, row.getString("id"))
        assertEquals(6500, row.getLong("amount"))
        assertEquals("Cafe Demo Norte", row.getString("note"))
        assertEquals("2026-11-21", row.getString("spent_on"))
        assertEquals(hid, row.getString("household_id")); assertEquals(cat, row.getString("category_id"))
        assertTrue(repo.list().isEmpty())
        assertTrue(log.list().single().synced)
        assertEquals(1, status.ok)
    }

    @Test
    fun `23505 cuenta como exito, un corte de red deja el borrador y pide reintento, y el reintento usa el mismo id`() {
        saveOne()
        val first = Net(mutableListOf({ throw IOException("sin red") }))
        assertEquals(SyncResult.RETRY, syncer(first).syncOnce())
        assertEquals(1, repo.list().size)
        val second = Net(mutableListOf({ HttpResult(409, "{\"code\":\"23505\"}") }))
        assertEquals(SyncResult.ALL_SENT, syncer(second).syncOnce())
        assertEquals(JSONObject(first.expenses.single().third).getString("id"), JSONObject(second.expenses.single().third).getString("id"))
        assertTrue(repo.list().isEmpty())
    }

    @Test
    fun `un 5xx reintenta, un 4xx se rechaza sin borrar, y un 401 renueva la sesion una vez`() {
        saveOne()
        assertEquals(SyncResult.RETRY, syncer(Net(mutableListOf({ HttpResult(503, "") }))).syncOnce())
        assertEquals(SyncResult.REJECTED, syncer(Net(mutableListOf({ HttpResult(400, "{\"code\":\"23514\"}") }))).syncOnce())
        assertTrue("la fila rechazada queda visible como rechazada y no se reenvia sola (R3-09)", repo.list().single().syncRejected)
        repo.clear(); saveOne()
        val s = FakeSession()
        val net = Net(mutableListOf({ HttpResult(401, "") }, { HttpResult(201, "") }))
        assertEquals(SyncResult.ALL_SENT, syncer(net, s).syncOnce())
        assertEquals(1, s.refreshes)
        assertEquals("Bearer tok2", net.expenses[1].second["Authorization"])
    }

    @Test
    fun `sin sesion o sin http no envia nada y deja el borrador`() {
        saveOne()
        assertEquals(SyncResult.NO_SESSION, syncer(Net(mutableListOf()), FakeSession(token = null, refreshOk = false)).syncOnce())
        val noHttps = ExpenseSyncer(repo, { profile }, { owner }, { "http://x.test" }, FakeSession(), Net(mutableListOf()), FakeStatus(), { now })
        assertEquals(SyncResult.NO_SESSION, noHttps.syncOnce())
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `no envia borradores de otro dueno ni los que no tienen categoria`() {
        saveOne()
        val other = ExpenseSyncer(repo, { profile }, { "otro:hogar" }, { "https://x.test" }, FakeSession(), Net(mutableListOf()), FakeStatus(), { now })
        assertEquals(SyncResult.NO_SESSION, other.syncOnce())
        profile = profile!!.copy(categories = emptyMap())
        repo.update(repo.list().single().id) { it.copy(categoryId = null, autoSaved = false) }
        assertEquals(SyncResult.NOTHING_TO_SEND, syncer(Net(mutableListOf())).syncOnce())
    }

    @Test
    fun `el perfil rechaza ids malos y la clave de comercio ignora tildes`() {
        assertNull(AutoProfile.parse("{\"ownerKey\":\"a\",\"userId\":\"x\",\"householdId\":\"$hid\",\"paidBy\":\"$uid\",\"shared\":true,\"categories\":{}}"))
        assertEquals("cafe demo norte 2", MerchantKey.of("  Café-Demo  Norte #2 "))
        assertEquals(cat, profile!!.categoryFor("Cafe Demo Norte"))
        val byWord = AutoProfile(owner, uid, hid, uid, true, mapOf("w:cafe" to cat))
        assertEquals(cat, byWord.categoryFor("Cafe Otra Sucursal"))
        assertNull(byWord.categoryFor("Caf"))
    }

    @Test
    fun `el registro de guardados caduca a los 14 dias y se puede marcar como enviado`() {
        log.add(AutoSavedEntry("a", 1000, "Demo", now, false))
        log.markSynced("a")
        assertTrue(log.list().single().synced)
        now += 15L * 24 * 3600 * 1000
        assertTrue(log.list().isEmpty())
    }
}
