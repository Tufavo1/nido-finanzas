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
import cl.dinovance.contigo.capture.ReminderPolicy
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
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Cambio del dueño: A) «Recibiste» se guarda solo como ingreso extra (incomes, PRIVADO: jamas notify a la pareja);
 * B) «Compraste» con comercio nuevo se guarda solo con la categoria general del perfil (defaultCategoryId);
 * C) pago de deuda y transferencia siguen pendientes. Datos SINTETICOS.
 */
class AutoIncomeAndDefaultCategoryTest {
    private val bank = "cl.demo.falabella"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private val otros = "44444444-4444-4444-8444-444444444444"
    private var now = 1_795_273_230_000L // 2026-11-21 12:00:30 -03
    private val repo: DraftRepository = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private var ids = 0
    private var activeOwner: String? = owner
    private var profile: AutoProfile? = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Cafe Conocido") to cat), defaultCategoryId = otros)
    private val logStore = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val log = AutoSavedLog(logStore) { now }
    private var scheduled = 0
    private var enabled = true
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = if (packageName == bank) "banco-falabella" else null
        override fun autoEnabled(bank: String) = enabled
        override fun maxClp() = 50_000L
    }
    private val notifier = RecordingNotifier()
    private fun processor() = CaptureProcessor(
        { setOf(bank) }, repo, notifier, RecordingHealth(), { now }, { "a000000${ids++}-1111-4111-8111-111111111111" },
        ownerProvider = { activeOwner }, requireOwner = true, auto = cfg, profile = { profile }, onAutoSaved = { scheduled++ }, autoLog = log,
    )

    private val ingreso = "Recibiste \$10.000 Te transfirieron \$10.000 a tu Cuenta Banco Falabella 2236. !Ingresa a la App y revisa tus movimientos!"

    // ---- A) ingreso extra guardado solo
    @Test
    fun `un ingreso de un banco activado se guarda solo como ingreso extra`() {
        assertEquals(Outcome.STORED, processor().process(bank, "Recibiste \$10.000", "Te transfirieron \$10.000 a tu Cuenta Banco Falabella 2236.", now))
        val d = repo.list().single()
        assertEquals(Kind.INCOME, d.candidate.kind)
        assertEquals(DraftStatus.CONFIRMED, d.status); assertTrue(d.autoSaved); assertNull(d.categoryId)
        assertEquals(1, scheduled)
        val e = log.list().single()
        assertEquals(Kind.INCOME, e.kind); assertEquals("Ingreso extra", e.note); assertEquals(10_000L, e.amountClp)
        assertTrue(notifier.autoSaved.single().candidate.kind == Kind.INCOME)
    }

    @Test
    fun `un ingreso sobre el tope, de banco apagado, sin perfil, duplicado o sin sesion queda pendiente`() {
        processor().process(bank, null, "Recibiste \$60.000 a tu Cuenta Banco Falabella 2236", now)
        assertFalse(repo.list().last().autoSaved)
        enabled = false; now += 200_000
        processor().process(bank, null, "Recibiste \$1.000 a tu Cuenta Banco Falabella 2236", now)
        assertFalse(repo.list().last().autoSaved)
        enabled = true; profile = null; now += 200_000
        processor().process(bank, null, "Recibiste \$2.000 a tu Cuenta Banco Falabella 2236", now)
        assertFalse(repo.list().last().autoSaved)
        activeOwner = null; now += 200_000
        processor().process(bank, null, "Recibiste \$3.000 a tu Cuenta Banco Falabella 2236", now)
        assertFalse(repo.list().last().autoSaved)
        assertTrue(repo.list().all { it.status == DraftStatus.PENDING }); assertEquals(0, scheduled); assertTrue(log.list().isEmpty())
    }

    @Test
    fun `un ingreso igual a menos de 2 minutos queda pendiente y marcado`() {
        val p = processor()
        p.process(bank, null, ingreso, now); now += 60_000
        assertEquals(Outcome.STORED, p.process(bank, null, ingreso, now))
        val second = repo.list()[1]
        assertTrue(second.possibleDuplicate); assertFalse(second.autoSaved); assertEquals(DraftStatus.PENDING, second.status)
    }

    // ---- C) pago de deuda y transferencia siguen pendientes, aun con categoria por defecto
    @Test
    fun `pago de deuda y transferencia siguen pendientes con perfil y categoria por defecto`() {
        val p = processor()
        p.process(bank, null, "Pagaste \$34.400 a tu CMR Mastercard Premium. Revisa mas detalles en tu app", now); now += 200_000
        p.process(bank, "Transferiste \$5.000", "a Juan Perez. Revisa más detalles en tu app", now)
        assertEquals(listOf(Kind.DEBT_PAYMENT, Kind.TRANSFER_OUT), repo.list().map { it.candidate.kind })
        assertTrue(repo.list().all { it.status == DraftStatus.PENDING && !it.autoSaved && it.categoryId == null })
        assertEquals(0, scheduled)
    }

    // ---- B) gasto con comercio nuevo y categoria general
    @Test
    fun `un gasto con comercio nuevo se guarda solo con la categoria por defecto`() {
        processor().process(bank, null, "Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl Con tu Debito Banco Falabella", now)
        val d = repo.list().single()
        assertTrue(d.autoSaved); assertEquals(otros, d.categoryId)
        assertEquals(Kind.EXPENSE, log.list().single().kind)
    }

    @Test
    fun `la categoria aprendida gana a la de por defecto`() {
        processor().process(bank, null, "Compraste \$3.000 en Cafe Conocido Santiago Chl", now)
        assertEquals(cat, repo.list().single().categoryId)
    }

    @Test
    fun `sin categoria por defecto el comercio nuevo pregunta como antes`() {
        profile = profile!!.copy(defaultCategoryId = null)
        processor().process(bank, null, "Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl", now)
        val d = repo.list().single()
        assertFalse(d.autoSaved); assertEquals(DraftStatus.PENDING, d.status); assertNull(d.categoryId)
    }

    @Test
    fun `con categoria por defecto se mantienen el tope y la confianza`() {
        val p = processor()
        p.process(bank, null, "Compraste \$60.000 en Tienda Nueva", now); now += 200_000
        p.process(bank, null, "Compra por \$4.000 con tu tarjeta", now) // sin comercio: confianza media
        assertTrue(repo.list().none { it.autoSaved })
    }

    // ---- AutoProfile: campo opcional y tolerante
    @Test
    fun `AutoProfile guarda y lee defaultCategoryId`() {
        val json = profile!!.toJson()
        assertEquals(otros, JSONObject(json).getString("defaultCategoryId"))
        assertEquals(profile, AutoProfile.parse(json))
    }

    @Test
    fun `un perfil antiguo sin defaultCategoryId sigue funcionando`() {
        val old = JSONObject(profile!!.toJson()).apply { remove("defaultCategoryId") }.toString()
        val p = AutoProfile.parse(old)
        assertEquals(owner, p?.ownerKey); assertNull(p?.defaultCategoryId)
    }

    @Test
    fun `un defaultCategoryId raro se ignora sin perder el perfil`() {
        for (bad in listOf("", "Otros", "1; drop table", JSONObject.NULL)) {
            val j = JSONObject(profile!!.toJson()).put("defaultCategoryId", bad).toString()
            val p = AutoProfile.parse(j)
            assertEquals(owner, p?.ownerKey); assertNull("$bad", p?.defaultCategoryId)
        }
    }

    @Test
    fun `fromJs acepta la categoria por defecto`() {
        val p = AutoProfile.fromJs(owner, uid, hid, uid, true, JSONArray(), otros)
        assertEquals(otros, p?.defaultCategoryId)
        assertNull(AutoProfile.fromJs(owner, uid, hid, uid, true, JSONArray())?.defaultCategoryId)
    }

    // ---- envio: EXPENSE -> expenses, INCOME -> incomes (sin notify), los otros nunca
    private class Sess : SessionSource { override fun accessToken(nowSeconds: Long) = "tok"; override fun refresh() = false }
    private class St : SyncStatusStore { override fun recordSuccess(nowMillis: Long) {}; override fun recordError(kind: String, nowMillis: Long) {} }
    private class Net(val status: Int = 201) : HttpTransport {
        val sent = mutableListOf<Pair<String, String>>()
        override fun post(url: String, headers: Map<String, String>, body: String): HttpResult { sent += url to body; return HttpResult(status, "") }
    }
    private fun syncer(net: Net) = ExpenseSyncer(repo, { profile }, { activeOwner }, { "https://api.demo.test/supabase" }, Sess(), net, St(), { now }, log = log)
    private fun draft(kind: Kind, id: String, merchant: String? = "Cafe Conocido") =
        Draft(id, ParsedCandidate(10_000, merchant, kind, Confidence.HIGH, null, "fp$id", "Cuenta Banco Falabella ·2236"), now, now, DraftStatus.CONFIRMED, bank, owner, false, if (kind == Kind.EXPENSE) cat else null, true)
    private val incomeId = "b1111111-1111-4111-8111-111111111111"
    private val expenseId = "c2222222-2222-4222-8222-222222222222"

    @Test
    fun `rowOf por tipo`() {
        val s = syncer(Net())
        val inc = s.rowOf(draft(Kind.INCOME, incomeId.uppercase(), merchant = null), profile!!)!!
        assertEquals(setOf("id", "household_id", "amount", "source", "received_on"), inc.keys().asSequence().toSet())
        assertEquals(incomeId, inc.getString("id"))
        assertEquals(hid, inc.getString("household_id"))
        assertEquals(10_000L, inc.getLong("amount"))
        assertEquals("Ingreso extra", inc.getString("source"))
        assertEquals("2026-11-21", inc.getString("received_on"))
        assertEquals("/rest/v1/incomes", s.pathOf(draft(Kind.INCOME, incomeId)))
        assertEquals("/rest/v1/expenses", s.pathOf(draft(Kind.EXPENSE, expenseId)))
        assertTrue(s.rowOf(draft(Kind.EXPENSE, expenseId), profile!!)!!.has("category_id"))
        for (k in listOf(Kind.DEBT_PAYMENT, Kind.TRANSFER_OUT)) {
            assertNull(s.rowOf(draft(k, expenseId), profile!!)); assertNull(s.pathOf(draft(k, expenseId)))
        }
    }

    @Test
    fun `la fecha del ingreso es la del aviso en Santiago, no la de UTC`() {
        now = 1_795_315_800_000L // 2026-11-22 02:50 UTC = 2026-11-21 23:50 en Santiago
        val inc = syncer(Net()).rowOf(draft(Kind.INCOME, incomeId), profile!!)!!
        assertEquals("2026-11-21", inc.getString("received_on"))
    }

    @Test
    fun `un ingreso confirmado va a incomes y NUNCA llama a notify`() {
        repo.add(draft(Kind.INCOME, incomeId, merchant = null))
        log.add(AutoSavedEntry(incomeId, 10_000, "Ingreso extra", now, false, owner, kind = Kind.INCOME))
        val net = Net()
        assertEquals(SyncResult.ALL_SENT, syncer(net).syncOnce())
        assertEquals(listOf("https://api.demo.test/supabase/rest/v1/incomes"), net.sent.map { it.first })
        assertTrue(repo.list().isEmpty())
        assertTrue(log.list().single().synced)
        // un segundo envio tampoco avisa a la pareja por el ingreso ya enviado
        syncer(net).syncOnce()
        assertTrue(net.sent.none { it.first.contains("notify") })
        assertTrue(net.sent.single().second.contains("Ingreso extra"))
    }

    @Test
    fun `gasto e ingreso juntos, solo el gasto avisa a la pareja`() {
        repo.add(draft(Kind.EXPENSE, expenseId)); repo.add(draft(Kind.INCOME, incomeId, merchant = null))
        repo.add(draft(Kind.DEBT_PAYMENT, "d3333333-3333-4333-8333-333333333333")); repo.add(draft(Kind.TRANSFER_OUT, "e4444444-4444-4444-8444-444444444444"))
        val net = Net(); syncer(net).syncOnce()
        val urls = net.sent.map { it.first.substringAfter("/supabase") }
        assertEquals(listOf("/rest/v1/expenses", "/functions/v1/notify", "/rest/v1/incomes"), urls)
        assertTrue(net.sent.single { it.first.endsWith("notify") }.second.contains(expenseId))
        assertEquals(setOf(Kind.DEBT_PAYMENT, Kind.TRANSFER_OUT), repo.list().map { it.candidate.kind }.toSet())
    }

    @Test
    fun `pendingToSend cuenta gastos e ingresos confirmados, nunca pagos ni transferencias`() {
        repo.add(draft(Kind.EXPENSE, expenseId)); repo.add(draft(Kind.INCOME, incomeId))
        repo.add(draft(Kind.DEBT_PAYMENT, "d3333333-3333-4333-8333-333333333333")); repo.add(draft(Kind.TRANSFER_OUT, "e4444444-4444-4444-8444-444444444444"))
        assertEquals(2, ReminderPolicy.pendingToSend(repo.list(), owner))
    }

    // ---- registro de guardados solos con el tipo
    @Test
    fun `el registro guarda el tipo y un registro antiguo sin tipo se lee como gasto`() {
        log.add(AutoSavedEntry(incomeId, 10_000, "Ingreso extra", now, false, owner, kind = Kind.INCOME))
        assertEquals("INCOME", JSONArray(logStore.v).getJSONObject(0).getString("kind"))
        logStore.v = """[{"id":"$expenseId","amount":5000,"note":"Cafe","at":$now,"synced":false,"owner":"$owner"}]"""
        assertEquals(Kind.EXPENSE, log.list().single().kind)
    }

    @Test
    fun `la notificacion de ingreso guardado dice Guarde X en Ingresos extra`() {
        val xml = File("src/main/res/values/strings.xml").readText()
        assertTrue(xml.contains("<string name=\"capture_auto_saved_income_body\">Guardé %1\$s en Ingresos extra</string>"))
        val src = File("src/main/kotlin/cl/dinovance/contigo/capture/CaptureNotifier.kt").readText()
        assertTrue(src.contains("R.string.capture_auto_saved_income_body"))
    }

    @Test
    fun `el plugin entrega el tipo del registro y la categoria por defecto`() {
        val src = File("src/main/kotlin/cl/dinovance/contigo/plugin/ContigoNativePlugin.kt").readText()
        assertTrue(src.contains(".put(\"kind\", it.kind.name)"))
        assertTrue(src.contains("call.getString(\"defaultCategoryId\")"))
    }
}
