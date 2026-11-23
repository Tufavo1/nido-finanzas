// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.AutoSavedLog
import cl.dinovance.contigo.capture.CaptureNotifier
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

/**
 * «Transferiste $X a NOMBRE» (TRANSFER_OUT): la persona decide si fue un gasto o un pago de deuda. Igual que un ingreso o un pago
 * a la tarjeta, NUNCA se guarda solo ni se envia como gasto. Datos SINTETICOS.
 */
class TransferOutFlowTest {
    private val bank = "cl.demo.falabella"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private var now = 1_795_273_230_000L
    private val repo: DraftRepository = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private var ids = 0
    // El perfil YA conoce al destinatario y el tope es enorme: si la transferencia llegara a autoCategory, se guardaria sola.
    private val profile = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Juan Perez") to cat, "w:juan" to cat))
    private val logStore = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val log = AutoSavedLog(logStore) { now }
    private var scheduled = 0
    private val notifier = RecordingNotifier()
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = if (packageName == bank) "banco-falabella" else null
        override fun autoEnabled(bank: String) = true
        override fun maxClp() = 9_999_999_999L
    }
    private fun processor() = CaptureProcessor(
        { setOf(bank) }, repo, notifier, RecordingHealth(), { now }, { "id-${ids++}" },
        ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile }, onAutoSaved = { scheduled++ }, autoLog = log,
    )

    @Test
    fun `transferiste queda PENDING sin categoria, sin registro automatico y se muestra para revisar`() {
        assertEquals(Outcome.STORED, processor().process(bank, null, "Transferiste \$5.000 a Juan Perez. Revisa más detalles en tu app", now))
        val d = repo.list().single()
        assertEquals(Kind.TRANSFER_OUT, d.candidate.kind)
        assertEquals("Juan Perez", d.candidate.merchant)
        assertEquals(Confidence.HIGH, d.candidate.confidence)
        assertEquals(DraftStatus.PENDING, d.status)
        assertFalse(d.autoSaved); assertNull(d.categoryId)
        assertEquals(0, scheduled); assertTrue(log.list().isEmpty())
        assertEquals(listOf(d.id), notifier.shown.map { it.id })
    }

    @Test
    fun `aviso partido titulo y cuerpo en mayusculas tambien queda pendiente`() {
        assertEquals(Outcome.STORED, processor().process(bank, "TRANSFERISTE \$5.000", "A JUAN PEREZ. REVISA MAS DETALLES EN TU APP", now))
        val d = repo.list().single()
        assertEquals(Kind.TRANSFER_OUT, d.candidate.kind)
        assertEquals("Juan Perez", d.candidate.merchant)
        assertEquals(DraftStatus.PENDING, d.status); assertFalse(d.autoSaved)
    }

    @Test
    fun `una transferencia y un gasto del mismo monto y nombre no son duplicados entre si`() {
        val p = processor()
        p.process(bank, null, "Transferiste \$5.000 a Juan Perez", now); now += 5_000
        assertEquals(Outcome.STORED, p.process(bank, null, "Compraste \$5.000 en Juan Perez", now))
        assertEquals(setOf(Kind.TRANSFER_OUT, Kind.EXPENSE), repo.list().map { it.candidate.kind }.toSet())
    }

    // ---- nunca llega a ExpenseSyncer
    private class Sess : SessionSource { override fun accessToken(nowSeconds: Long) = "tok"; override fun refresh() = false }
    private class St : SyncStatusStore { override fun recordSuccess(nowMillis: Long) {}; override fun recordError(kind: String, nowMillis: Long) {} }
    private class Net : HttpTransport { val sent = mutableListOf<String>(); override fun post(url: String, headers: Map<String, String>, body: String): HttpResult { sent += body; return HttpResult(201, "") } }
    private fun syncer(net: Net) = ExpenseSyncer(repo, { profile }, { owner }, { "https://api.demo.test/supabase" }, Sess(), net, St(), { now }, log = log)
    private val transferId = "c3333333-3333-4333-8333-333333333333"
    private fun transfer(status: DraftStatus = DraftStatus.CONFIRMED) =
        Draft(transferId, ParsedCandidate(5_000, "Juan Perez", Kind.TRANSFER_OUT, Confidence.HIGH, null, "fp-t", "Cuenta Banco Falabella ·2236"), now, now, status, bank, owner, false, cat, true)

    @Test
    fun `una transferencia CONFIRMED jamas se envia como gasto y el borrador se conserva`() {
        repo.add(transfer())
        val net = Net(); syncer(net).syncOnce()
        assertTrue("se envio como gasto: ${net.sent}", net.sent.isEmpty())
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `rowOf no arma fila de expenses para una transferencia`() {
        assertNull(syncer(Net()).rowOf(transfer(), profile))
    }

    @Test
    fun `una transferencia CONFIRMED no cuenta como gasto por enviar`() {
        repo.add(transfer())
        assertEquals(0, ReminderPolicy.pendingToSend(repo.list(), owner))
    }

    // ---- notificacion propia
    @Test
    fun `la notificacion de transferencia solo ofrece Revisar`() {
        assertEquals(listOf(CaptureNotifier.ACTION_OPEN), CaptureNotifier.actionsFor(Kind.TRANSFER_OUT))
        assertFalse(CaptureNotifier.actionsFor(Kind.TRANSFER_OUT).contains(CaptureNotifier.ACTION_SAVE))
    }

    @Test
    fun `las demas notificaciones conservan sus botones`() {
        assertEquals(listOf(CaptureNotifier.ACTION_SAVE, CaptureNotifier.ACTION_CHANGE_CATEGORY, CaptureNotifier.ACTION_IGNORE), CaptureNotifier.actionsFor(Kind.EXPENSE))
        for (k in listOf(Kind.INCOME, Kind.DEBT_PAYMENT)) assertEquals(listOf(CaptureNotifier.ACTION_OPEN, CaptureNotifier.ACTION_IGNORE), CaptureNotifier.actionsFor(k))
    }

    @Test
    fun `el texto de la transferencia pregunta si es gasto o pago de deuda`() {
        val xml = File("src/main/res/values/strings.xml").readText()
        assertTrue(xml.contains("<string name=\"capture_transfer_title\">Transferencia detectada</string>"))
        assertTrue(xml.contains("<string name=\"capture_transfer_body\">Transferiste %1\$s a %2\$s: ¿gasto o pago de deuda?</string>"))
        assertTrue(xml.contains("<string name=\"capture_transfer_body_no_name\">Transferiste %1\$s: ¿gasto o pago de deuda?</string>"))
        val src = File("src/main/kotlin/cl/dinovance/contigo/capture/CaptureNotifier.kt").readText()
        assertTrue(src.contains("R.string.capture_transfer_body"))
        assertTrue(src.contains("Kind.TRANSFER_OUT -> R.string.capture_transfer_title"))
    }

    @Test
    fun `Guardar desde la notificacion se ignora para una transferencia`() {
        val r = File("src/main/kotlin/cl/dinovance/contigo/capture/DraftActionReceiver.kt").readText()
        assertTrue(r.contains("?.candidate?.kind != cl.nido.parser.Kind.EXPENSE) return"))
    }

    // ---- contrato JSON con el front: kind = nombre del enum, igual que DEBT_PAYMENT
    @Test
    fun `el JSON del borrador usa kind TRANSFER_OUT y el resto de los campos igual`() {
        val o = transfer(DraftStatus.PENDING).toJson()
        assertEquals("TRANSFER_OUT", o.getString("kind"))
        assertEquals(5_000L, o.getLong("amountClp"))
        assertEquals("Juan Perez", o.getString("merchant"))
        assertEquals("Cuenta Banco Falabella ·2236", o.getString("account"))
        assertEquals(now, o.getLong("postedAtMillis"))
        assertFalse(o.getBoolean("possibleDuplicate"))
        assertEquals("PENDING", o.getString("status"))
        assertEquals(transfer(DraftStatus.PENDING), Draft.fromJson(JSONObject(o.toString())))
    }

    @Test
    fun `los valores de kind del JSON son exactamente los nombres del enum`() {
        assertEquals(listOf("EXPENSE", "INCOME", "DEBT_PAYMENT", "TRANSFER_OUT"), Kind.entries.map { k ->
            Draft("x", ParsedCandidate(1, null, k, Confidence.HIGH, null, "f"), 1, 1, DraftStatus.PENDING).toJson().getString("kind")
        })
    }
}
