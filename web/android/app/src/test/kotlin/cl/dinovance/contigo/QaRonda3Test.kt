// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.AutoSavedEntry
import cl.dinovance.contigo.capture.AutoSavedLog
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
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
import cl.nido.parser.Confidence
import cl.nido.parser.Kind
import cl.nido.parser.ParsedCandidate
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Base64

/**
 * QA ronda 3: registro automatico por banco, envio en segundo plano, Deshacer. Datos SINTETICOS.
 * Los tests con la etiqueta [ROJO] describen un defecto que hoy existe; los demas confirman lo que SI se cumple.
 */
class QaRonda3Test {
    private val bank = "cl.demo.banco"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val other = "99999999-9999-4999-8999-999999999999"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private var now = 1_795_273_230_000L // 2026-11-21 (Chile)
    private val repo: DraftRepository = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private var autoOn = true
    private var assoc: String? = "santander"
    private var activeOwner: String? = owner
    private var profile: AutoProfile? = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Cafe Demo Norte") to cat))
    private val logStore = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val log = AutoSavedLog(logStore) { now }
    private var scheduled = 0
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = if (packageName == bank) assoc else null
        override fun autoEnabled(bank: String) = autoOn
        override fun maxClp() = 50_000L
    }

    private fun processor(h: RecordingHealth = RecordingHealth(), r: DraftRepository = repo) = CaptureProcessor(
        { setOf(bank, "cl.demo.otro") }, r, RecordingNotifier(), h, { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { activeOwner }, requireOwner = true, auto = cfg, profile = { profile }, onAutoSaved = { scheduled++ }, autoLog = log,
    )

    private fun text(amount: String = "$6.500", merchant: String = "CAFE DEMO NORTE") = "Compra aprobada por $amount en $merchant."
    private fun autoCount() = repo.list().count { it.autoSaved }

    // ---------------------------------------------------------------- 1. NUNCA debe guardarse solo
    @Test
    fun `r3-1 casos que jamas se guardan solos`() {
        val p = processor()
        // banco apagado
        autoOn = false; p.process(bank, null, text("$1.000"), now); now += 200_000; autoOn = true
        // banco sin app asociada (asociacion nula)
        assoc = null; p.process(bank, null, text("$2.000"), now); now += 200_000; assoc = "santander"
        // paquete en lista blanca pero no asociado a ningun banco
        p.process("cl.demo.otro", null, text("$3.000"), now); now += 200_000
        // sin perfil
        val saved = profile; profile = null; p.process(bank, null, text("$4.000"), now); now += 200_000; profile = saved
        // perfil de otro dueno
        profile = saved!!.copy(ownerKey = "x:y"); p.process(bank, null, text("$5.000"), now); now += 200_000; profile = saved
        // comercio vacio y comercio hostil sin categoria aprendida
        p.process(bank, null, "Compra aprobada por $6.000", now); now += 200_000
        p.process(bank, null, text("$7.000", "‮OTRO\u0000COMERCIO"), now); now += 200_000
        p.process(bank, null, text("$8.000", "W:CAFE"), now); now += 200_000 // «w:» no se puede forzar por el nombre
        p.process(bank, null, text("$0"), now); now += 200_000
        assertEquals("nada de lo anterior debia guardarse solo", 0, autoCount())
        // sin dueno: no se guarda solo y queda constancia
        activeOwner = null
        assertEquals(Outcome.NO_SESSION, p.process(bank, null, text("$9.000"), now))
        assertEquals(0, autoCount())
        assertEquals(0, scheduled)
    }

    @Test
    fun `r3-1 el borde del tope es inclusivo y el aviso de abono nunca se guarda`() {
        val p = processor()
        p.process(bank, null, text("$50.000"), now); now += 200_000
        p.process(bank, null, text("$50.001"), now); now += 200_000
        p.process(bank, null, "Abono por $10.000 de CAFE DEMO NORTE", now)
        val list = repo.list()
        assertTrue(list.single { it.candidate.amountClp == 50_000L }.autoSaved)
        assertFalse(list.single { it.candidate.amountClp == 50_001L }.autoSaved)
        assertTrue(list.none { it.candidate.kind == Kind.INCOME })
    }

    @Test
    fun `r3-1 confianza no alta no se guarda sola`() {
        val c = ParsedCandidate(6_500, "Cafe Demo Norte", Kind.EXPENSE, Confidence.MEDIUM, null, "fp")
        val d = Draft("a1111111-1111-4111-8111-111111111111", c, now, now, DraftStatus.PENDING, bank, owner)
        // El procesador decide con AutoCaptureRules; se comprueba la regla con el mismo candidato
        val dec = cl.nido.parser.AutoCaptureRules.decide(c, cl.nido.parser.CaptureSettings(cl.nido.parser.CaptureMode.AUTO, 50_000), true)
        assertEquals(cl.nido.parser.CaptureDecision.ASK, dec)
        assertFalse(d.autoSaved)
    }

    // ---------------------------------------------------------------- aviso hostil y fila enviada
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
        override fun post(url: String, headers: Map<String, String>, body: String): HttpResult {
            sent += Triple(url, headers, body)
            return (if (answers.isEmpty()) { { HttpResult(201, "") } } else answers.removeAt(0))()
        }
    }
    private fun syncer(net: Net, session: SessionSource = FakeSession(), status: FakeStatus = FakeStatus(), prof: AutoProfile? = profile) =
        ExpenseSyncer(repo, { prof }, { activeOwner }, { "https://api.demo.test/supabase" }, session, net, status, { now }, log = log)

    private fun confirmedDraft(id: String, merchant: String?, at: Long = now, amount: Long = 6_500) =
        Draft(id, ParsedCandidate(amount, merchant, Kind.EXPENSE, Confidence.HIGH, null, "fp$id"), at, now, DraftStatus.CONFIRMED, bank, owner, false, cat, true)

    @Test
    fun `r3-1 un comercio con comillas o JSON no altera la fila enviada`() {
        val d = confirmedDraft("a1111111-1111-4111-8111-111111111111", "x\",\"amount\":1,\"household_id\":\"$other\"}")
        val row = syncer(Net(mutableListOf())).rowOf(d, profile!!)!!
        assertEquals(6_500, row.getLong("amount"))
        assertEquals(hid, row.getString("household_id"))
    }

    @Test
    fun `r3-1b ROJO la nota truncada a 120 no puede cortar un par sustituto (emoji) a la mitad`() {
        val m = "a".repeat(119) + "😀" // el emoji ocupa los indices 119 y 120
        val d = confirmedDraft("a1111111-1111-4111-8111-111111111111", m)
        val note = syncer(Net(mutableListOf())).rowOf(d, profile!!)!!.getString("note")
        assertFalse("la nota termina con medio emoji: la base rechaza el JSON y el gasto queda trabado", note.isNotEmpty() && Character.isHighSurrogate(note.last()))
    }

    @Test
    fun `r3-1c ROJO el perfil rechaza ids con forma de UUID falsa`() {
        val fake = "-".repeat(36)
        val json = JSONObject().put("ownerKey", owner).put("userId", uid).put("householdId", hid).put("paidBy", uid).put("shared", true)
            .put("categories", JSONObject().put("cafe", fake)).toString()
        assertNull("un id de categoria de 36 guiones pasa la validacion y despues la base lo rechaza para siempre", AutoProfile.parse(json))
        val json2 = JSONObject().put("ownerKey", owner).put("userId", fake).put("householdId", hid).put("paidBy", uid).put("shared", true)
            .put("categories", JSONObject()).toString()
        assertNull(AutoProfile.parse(json2))
    }

    // ---------------------------------------------------------------- 3. envio en segundo plano
    @Test
    fun `r3-3 fecha America-Santiago en el borde de medianoche (verano e invierno)`() {
        val s = syncer(Net(mutableListOf()))
        fun day(iso: String) = s.rowOf(confirmedDraft("a1111111-1111-4111-8111-111111111111", "Cafe Demo Norte", java.time.Instant.parse(iso).toEpochMilli()), profile!!)!!.getString("spent_on")
        assertEquals("2026-11-21", day("2026-11-22T02:59:59Z")) // 23:59:59 CLST (UTC-3)
        assertEquals("2026-11-22", day("2026-11-22T03:00:00Z"))
        assertEquals("2026-06-14", day("2026-06-15T03:59:59Z")) // invierno CLT (UTC-4)
        assertEquals("2026-06-15", day("2026-06-15T04:00:00Z"))
    }

    @Test
    fun `r3-3 401 con renovacion fallida no filtra el token y deja el borrador`() {
        val d = confirmedDraft("a1111111-1111-4111-8111-111111111111", "Cafe Demo Norte"); repo.add(d)
        val st = FakeStatus()
        val r = syncer(Net(mutableListOf({ HttpResult(401, "{\"message\":\"JWT expired tok\"}") })), FakeSession(refreshOk = false), st).syncOnce()
        assertEquals(SyncResult.RETRY, r)
        assertEquals(listOf("AUTH"), st.errors) // solo la clase, jamas el cuerpo ni el token
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `r3-3 el codigo de envio no escribe a logs ni imprime tokens, montos o comercios`() {
        val dir = File("src/main/kotlin/cl/dinovance/contigo/sync")
        val bad = Regex("""\b(Log\.[dviwe]\(|println\(|printStackTrace|Timber\.|Sentry)""")
        val hits = dir.listFiles()!!.filter { f -> bad.containsMatchIn(f.readText()) }.map { it.name }
        assertTrue("logs en $hits", hits.isEmpty())
        val prefs = File("src/main/kotlin/cl/dinovance/contigo/capture/CapturePrefs.kt").readText()
        assertFalse(Regex("""recordError\(kind: String[^)]*\)\s*\{[^}]*(body|token|amount)""").containsMatchIn(prefs))
    }

    @Test
    fun `r3-3 ningun envio en segundo plano pone cabecera Origin (ni la renovacion de sesion)`() {
        val src = File("src/main/kotlin/cl/dinovance/contigo/sync/NetworkAndSession.kt").readText() + File("src/main/kotlin/cl/dinovance/contigo/sync/ExpenseSyncer.kt").readText()
        // DEC-01 REVISADA (el Worker real rechaza escrituras sin Origin): el envio y la renovacion de sesion llevan el Origin del Worker
        // y nunca Sec-Fetch-Site. La asercion anterior («jamas Origin») quedo obsoleta por esa decision.
        assertTrue(Regex("(?i)\"origin\" to").findAll(src).count() >= 2)
        assertFalse(Regex("(?i)\"sec-fetch-site\" to").containsMatchIn(src))
        assertTrue(src.contains("EXPONENTIAL").not()) // el retroceso vive en el Worker, no aqui
        assertTrue(File("src/main/kotlin/cl/dinovance/contigo/sync/ExpenseSyncWorker.kt").readText().contains("BackoffPolicy.EXPONENTIAL"))
    }

    @Test
    fun `r3-3b ROJO una fila rechazada (400) no se reenvia en cada sincronizacion`() {
        repo.add(confirmedDraft("a1111111-1111-4111-8111-111111111111", "Cafe Demo Norte"))
        val net = Net(mutableListOf({ HttpResult(400, "{}") }))
        assertEquals(SyncResult.REJECTED, syncer(net).syncOnce())
        repo.add(confirmedDraft("b2222222-2222-4222-8222-222222222222", "Cafe Demo Norte", amount = 7_000))
        syncer(net).syncOnce()
        val resentRejected = net.sent.count { JSONObject(it.third).getString("id").startsWith("a1111111") }
        assertEquals("la fila rechazada se vuelve a enviar con cada sincronizacion y su error tapa el exito de las nuevas", 1, resentRejected)
    }

    @Test
    fun `r3-3c ROJO el token de otra persona no se usa para enviar gastos del dueno anterior`() {
        // Ventana entre «sesion cerrada y nueva»: supabase-js ya guardo la sesion de B, el dueno activo y el perfil siguen siendo de A.
        fun jwt(sub: String) = "h." + Base64.getUrlEncoder().withoutPadding().encodeToString("""{"sub":"$sub","exp":9999999999}""".toByteArray()) + ".s"
        repo.add(confirmedDraft("a1111111-1111-4111-8111-111111111111", "Cafe Demo Norte"))
        val net = Net(mutableListOf())
        syncer(net, FakeSession(token = jwt(other))).syncOnce()
        assertTrue("se envio una fila del perfil de $uid con el token de $other", net.sent.isEmpty())
    }

    @Test
    fun `r3-3d ROJO tras enviar un gasto, la pareja debe enterarse (aviso notify) tambien con la app cerrada`() {
        repo.add(confirmedDraft("a1111111-1111-4111-8111-111111111111", "Cafe Demo Norte"))
        val net = Net(mutableListOf({ HttpResult(201, "") }))
        syncer(net).syncOnce()
        assertTrue("el envio en segundo plano nunca llama a notify: ni aviso normal ni «gasto mayor» para estos gastos", net.sent.any { it.first.contains("notify") })
    }

    // ---------------------------------------------------------------- Deshacer / dueno del registro (lectura de fuente del plugin)
    private val plugin = File("src/main/kotlin/cl/dinovance/contigo/plugin/ContigoNativePlugin.kt").readText()
    private fun body(name: String): String {
        val i = plugin.indexOf("fun $name(")
        val j = plugin.indexOf("@PluginMethod", i).let { if (it < 0) plugin.length else it }
        return plugin.substring(i, j)
    }

    @Test
    fun `r3-4a ROJO Deshacer no puede decir deshecho si el gasto ya salio por la app abierta`() {
        // Si la app lo envio (supabase-js) y quito el borrador, el registro sigue con synced=false: Deshacer devuelve undone=true
        // pero el gasto sigue en el servidor. Debe comprobar que el borrador aun existe antes de afirmar «deshecho».
        val b = body("undoAutoSaved")
        assertTrue(Regex("drafts\\.list\\(\\)[^\\n]*(any|firstOrNull|find|contains)").containsMatchIn(b))
    }

    @Test
    fun `r3-4b ROJO Deshacer debe coordinarse con el envio en curso`() {
        // El envio toma la lista de borradores y publica despues: si Deshacer borra entremedio, el gasto igual se envia.
        val b = body("undoAutoSaved")
        assertTrue("sin exclusion mutua con syncOnce()", b.contains("syncer") || b.contains("synchronized"))
    }

    @Test
    fun `r3-5a ROJO el registro de guardados pertenece a un dueno`() {
        val fields = AutoSavedEntry::class.java.declaredFields.map { it.name.lowercase() }
        assertTrue("AutoSavedEntry no guarda dueno: otra persona en el mismo telefono ve y puede deshacer lo ajeno ($fields)", fields.any { it.contains("owner") })
    }

    @Test
    fun `r3-5b ROJO borrar todo lo capturado tambien borra el perfil automatico`() {
        val b = body("clearCaptured")
        assertTrue("el perfil (comercios aprendidos) sobrevive y el telefono sigue guardando solo", b.contains("clearProfile"))
    }

    @Test
    fun `r3-5c borrar todo lo capturado limpia borradores, registro y recientes`() {
        val b = body("clearCaptured")
        assertTrue(b.contains("drafts.clear") && b.contains("autoLog.clear") && b.contains("recent.clear"))
    }

    @Test
    fun `r3-5d ROJO setAutoProfile solo acepta el perfil del dueno activo`() {
        val b = body("setAutoProfile")
        assertTrue("guarda cualquier ownerKey, aunque no sea el dueno activo (carrera al cambiar de cuenta)", b.contains("activeOwner"))
    }

    @Test
    fun `r3-5e la salud del servicio no guarda montos ni comercios ante un fallo`() {
        val h = RecordingHealth()
        val boom = object : DraftRepositoryDelegate(repo) { override fun add(draft: Draft): Boolean = throw IllegalStateException("monto 6500 en CAFE DEMO NORTE") }
        processor(h, boom).process(bank, null, text(), now)
        assertEquals(listOf("IllegalStateException"), h.failures)
    }

    @Test
    fun `r3-5f el registro de guardados no guarda el texto del aviso`() {
        processor().process(bank, "TITULO SECRETO", "Compra aprobada por $6.500 en CAFE DEMO NORTE.", now)
        val raw = logStore.v.orEmpty()
        assertFalse(raw.contains("SECRETO") || raw.contains("Compra aprobada"))
        assertEquals(1, log.list().size)
    }

    open class DraftRepositoryDelegate(private val d: DraftRepository) : DraftRepository by d
}
