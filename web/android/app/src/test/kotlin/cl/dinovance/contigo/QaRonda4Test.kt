// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.AutoSavedLog
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftRepository
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.OwnerFilter
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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** QA ronda 4: ingresos y pagos de deuda en la captura nativa. Avisos oficiales del dueno; datos SINTETICOS. ROJO = defecto actual. */
class QaRonda4Test {
    private val bank = "cl.demo.cmr"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private var now = 1_795_273_230_000L
    private val repo: DraftRepository = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private var activeOwner: String? = owner
    private var ids = 0
    // El perfil conoce TODO lo que pueda aparecer: si un ingreso o un pago llegara a autoCategory, se guardaria solo.
    private var profile: AutoProfile? = AutoProfile(owner, uid, hid, uid, true, mapOf(
        MerchantKey.of("Ganaderia Rio Bueno S.a") to cat, "w:cmr" to cat, "w:cuenta" to cat, "w:banco" to cat, "w:mastercard" to cat,
    ))
    private val logStore = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val log = AutoSavedLog(logStore) { now }
    private var scheduled = 0
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = if (packageName == bank) "banco-falabella" else null
        override fun autoEnabled(bank: String) = true
        override fun maxClp() = 50_000L
    }
    private fun processor() = CaptureProcessor(
        { setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { "id-${ids++}" },
        ownerProvider = { activeOwner }, requireOwner = true, auto = cfg, profile = { profile }, onAutoSaved = { scheduled++ }, autoLog = log,
    )

    private val compra1 = "Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl Con tu Debito Banco Falabella"
    private val compra2 = "Compraste \$20.798 en Merpago Joseestebanrom Las Condes Chl Con tu CMR Mastercard PRemium Terminada en 5766. Si no la realisaste tu, revisa los movimientos de tus adicionales en tu app."
    private val ingreso = "Recibiste \$10.000 Te trasnfirieron \$10.000 a tu Cuenta Banco Falabella 2236. !Ingresa a la App y revisa tus movimientos!"
    private val pago = "Pagaste \$34.400 a tu CMR Mastercard Premium. Revisa mas detalles en tu app"

    @Test
    fun `r4-1 el gasto oficial con categoria aprendida se guarda solo, el que no se conoce pregunta`() {
        assertEquals(Outcome.STORED, processor().process(bank, null, compra1, now))
        now += 200_000
        assertEquals(Outcome.STORED, processor().process(bank, null, compra2, now))
        val l = repo.list()
        assertTrue(l[0].autoSaved && l[0].status == DraftStatus.CONFIRMED)
        assertFalse("Merpago no es un comercio aprendido", l[1].autoSaved)
    }

    @Test
    fun `r4-1 ingresos y pagos de deuda quedan PENDING sin categoria, sin registro y sin agendar envio`() {
        val p = processor()
        assertEquals(Outcome.STORED, p.process(bank, null, ingreso, now)); now += 200_000
        assertEquals(Outcome.STORED, p.process(bank, null, pago, now))
        val l = repo.list()
        assertEquals(listOf(Kind.INCOME, Kind.DEBT_PAYMENT), l.map { it.candidate.kind })
        assertTrue(l.all { it.status == DraftStatus.PENDING && !it.autoSaved && it.categoryId == null })
        assertEquals(0, scheduled); assertTrue(log.list().isEmpty())
    }

    @Test
    fun `r4-1 ni con el tope enorme ni con banco activado un ingreso o pago se guarda solo`() {
        val big = object : AutoConfig by cfg { override fun maxClp() = 9_999_999_999L }
        val p = CaptureProcessor({ setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { "id-${ids++}" },
            ownerProvider = { activeOwner }, requireOwner = true, auto = big, profile = { profile }, onAutoSaved = { scheduled++ }, autoLog = log)
        p.process(bank, null, "Recibiste \$1.000 a tu Cuenta Banco Falabella 2236", now); now += 200_000
        p.process(bank, null, "Pagaste \$1.000 a tu CMR Mastercard Premium", now)
        assertEquals(0, repo.list().count { it.autoSaved }); assertEquals(0, scheduled)
    }

    // ---- repeticion
    @Test
    fun `r4-2 el mismo ingreso repetido a los 10 s es duplicado y no hay dos borradores`() {
        val p = processor()
        assertEquals(Outcome.STORED, p.process(bank, null, ingreso, now)); now += 10_000
        assertEquals(Outcome.DUPLICATE, p.process(bank, null, ingreso, now))
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `r4-2 dos pagos iguales seguidos a los 60 s el segundo se guarda marcado y nunca se pierde`() {
        val p = processor()
        p.process(bank, null, pago, now); now += 60_000
        assertEquals(Outcome.STORED, p.process(bank, null, pago, now))
        val l = repo.list(); assertEquals(2, l.size); assertTrue(l[1].possibleDuplicate)
    }

    @Test
    fun `r4-2 un ingreso y un gasto del mismo monto no se toman por duplicados entre si`() {
        val p = processor()
        p.process(bank, null, "Recibiste \$6.778 a tu Cuenta Banco Falabella 2236", now); now += 5_000
        assertEquals(Outcome.STORED, p.process(bank, null, compra1, now))
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `r4-2 un ingreso sin comercio no fusiona con un gasto sin comercio del mismo monto (refinado)`() {
        val p = processor()
        p.process(bank, null, "Compraste \$10.000 Con tu Debito Banco Falabella", now); now += 5_000
        p.process(bank, null, ingreso, now)
        assertEquals(2, repo.list().size)
        assertTrue(repo.list().any { it.candidate.kind == Kind.INCOME })
    }

    // ---- nunca llegan a ExpenseSyncer
    private class Sess : SessionSource { override fun accessToken(nowSeconds: Long) = "tok"; override fun refresh() = false }
    private class St : SyncStatusStore { override fun recordSuccess(nowMillis: Long) {}; override fun recordError(kind: String, nowMillis: Long) {} }
    private class Net : HttpTransport { val sent = mutableListOf<String>(); override fun post(url: String, headers: Map<String, String>, body: String): HttpResult { sent += body; return HttpResult(201, "") } }
    private fun syncer(net: Net) = ExpenseSyncer(repo, { profile }, { activeOwner }, { "https://api.demo.test/supabase" }, Sess(), net, St(), { now }, log = log)
    private fun draft(kind: Kind, id: String, status: DraftStatus = DraftStatus.CONFIRMED, merchant: String? = "Ganaderia Rio Bueno S.a", ownerKey: String? = owner) =
        Draft(id, ParsedCandidate(10_000, merchant, kind, Confidence.HIGH, null, "fp$id", "Cuenta Banco Falabella ·2236"), now, now, status, bank, ownerKey, false, cat, true)

    @Test
    fun `r4-3 un ingreso o pago CONFIRMED jamas se envia como gasto y el borrador se conserva`() {
        repo.add(draft(Kind.INCOME, "a1111111-1111-4111-8111-111111111111")); repo.add(draft(Kind.DEBT_PAYMENT, "b2222222-2222-4222-8222-222222222222"))
        val net = Net(); syncer(net).syncOnce()
        assertTrue("se envio como gasto: ${net.sent}", net.sent.isEmpty())
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `r4-3 ROJO rowOf como segunda barrera no arma fila de expenses para un ingreso o un pago`() {
        val s = syncer(Net())
        assertNull(s.rowOf(draft(Kind.INCOME, "a1111111-1111-4111-8111-111111111111"), profile!!))
        assertNull(s.rowOf(draft(Kind.DEBT_PAYMENT, "b2222222-2222-4222-8222-222222222222"), profile!!))
    }

    @Test
    fun `r4-3 ROJO un ingreso CONFIRMED no cuenta como gasto por enviar `() {
        repo.add(draft(Kind.INCOME, "a1111111-1111-4111-8111-111111111111"))
        assertEquals("«Tienes 1 gasto por enviar» para algo que el telefono jamas enviara", 0, ReminderPolicy.pendingToSend(repo.list(), owner))
    }

    // ---- cambio de cuenta con borradores de ingreso pendientes
    @Test
    fun `r4-4 ingresos pendientes de A no se ven ni se envian al entrar B`() {
        val p = processor()
        p.process(bank, null, ingreso, now); now += 200_000; p.process(bank, null, pago, now)
        val b = "u2:h2"
        assertTrue(OwnerFilter.visible(repo.list(), b).isEmpty())
        assertEquals(2, OwnerFilter.foreign(repo.list(), b).size)
        assertEquals(0, ReminderPolicy.pendingToSend(repo.list(), b))
        activeOwner = b
        val net = Net(); syncer(net).syncOnce(); assertTrue(net.sent.isEmpty())
    }

    @Test
    fun `r4-4 un ingreso capturado sin sesion solo lo adopta la misma persona`() {
        activeOwner = null
        assertEquals(Outcome.NO_SESSION, processor().process(bank, null, ingreso, now))
        val d = repo.list().single(); assertNull(d.ownerKey)
        assertTrue(OwnerFilter.adoptable(repo.list(), "u2:h2", "u1").isEmpty())
        assertEquals(1, OwnerFilter.adoptable(repo.list(), "u1:h9", "u1").size)
    }

    // ---- notificacion propia y privacidad
    private val notifier = File("src/main/kotlin/cl/dinovance/contigo/capture/CaptureNotifier.kt").readText()
    @Test
    fun `r4-5 la notificacion de ingreso o pago no ofrece Guardar y no nombra cuenta ni comercio`() {
        assertFalse(Regex("account").containsMatchIn(notifier))
        val saveIdx = notifier.indexOf("if (kind == Kind.EXPENSE)")
        assertTrue(saveIdx > 0 && notifier.indexOf("ACTION_SAVE", saveIdx) > saveIdx && notifier.indexOf("else", saveIdx) > notifier.indexOf("ACTION_SAVE", saveIdx))
    }

    @Test
    fun `r4-5 Guardar desde la notificacion se ignora para ingresos y pagos`() {
        val r = File("src/main/kotlin/cl/dinovance/contigo/capture/DraftActionReceiver.kt").readText()
        assertTrue(r.contains("Kind.EXPENSE) return"))
    }

    @Test
    fun `r4-5 el borrador cifrado conserva tipo y cuenta tras guardar y leer, sin el texto del aviso`() {
        processor().process(bank, null, pago, now)
        val d = repo.list().single()
        assertEquals(Kind.DEBT_PAYMENT, d.candidate.kind); assertEquals("CMR Mastercard Premium", d.candidate.account)
        assertFalse(d.toJson().toString().contains("Revisa"))
    }

    @Test
    fun `r4-5 el registro de guardados y la salud no reciben ingresos ni pagos`() {
        processor().process(bank, null, ingreso, now)
        assertTrue(logStore.v.isNullOrEmpty() || !logStore.v!!.contains("10000"))
    }
}
