// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftActions
import cl.dinovance.contigo.capture.DraftCleanup
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.IncomingNotice
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.sync.ExpenseSyncer
import cl.dinovance.contigo.sync.HttpResult
import cl.dinovance.contigo.sync.HttpTransport
import cl.dinovance.contigo.sync.SessionSource
import cl.dinovance.contigo.sync.SyncReport
import cl.dinovance.contigo.sync.SyncResult
import cl.dinovance.contigo.sync.SyncStatusStore
import cl.nido.parser.Confidence
import cl.nido.parser.Installment
import cl.nido.parser.InstallmentPlan
import cl.nido.parser.InstallmentRole
import cl.nido.parser.Kind
import cl.nido.parser.ParsedCandidate
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * FALLA GRAVE de QA en emulador (2026-11-24): aviso CMR «Compraste $30.000 en PRUEBA-EMU TIENDA en 3 cuotas de $10.000» -> «Guardar»
 * en la notificacion -> «Enviar ahora» no hacia nada (el trabajo terminaba SUCCESS en milisegundos) y el gasto nunca llegaba.
 * Causa: el envio armaba la categoria SOLO con lo aprendido por comercio (sin la categoria general del perfil); un comercio nuevo
 * dejaba la fila en null, se filtraba en silencio y el resultado era «nada que enviar». Datos SINTETICOS.
 */
class GuardarDesdeNotificacionEnvioTest {
    private val cmr = "cl.demo.falabella"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val learned = "33333333-3333-4333-8333-333333333333"
    private val otros = "44444444-4444-4444-8444-444444444444"
    /** 2026-11-24 12:00 en Santiago (UTC-3). */
    private var now = 1_795_532_400_000L
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = if (packageName == cmr) "banco-falabella" else null
        override fun autoEnabled(bank: String) = true
        override fun maxClp() = 50_000L
    }
    /** Personal (shared = false), la categoria general «Otros» y NINGUNA categoria aprendida para PRUEBA-EMU TIENDA. */
    private var profile: AutoProfile? = AutoProfile(owner, uid, hid, uid, false, mapOf(MerchantKey.of("Cafe Conocido") to learned), defaultCategoryId = otros)
    private val processor = CaptureProcessor(
        { setOf(cmr) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile },
    )
    private val aviso = "Compraste \$30.000 en PRUEBA-EMU TIENDA en 3 cuotas de \$10.000 Con tu CMR Mastercard"

    private class FakeSession(var token: String? = "tok", var refreshOk: Boolean = true) : SessionSource {
        override fun accessToken(nowSeconds: Long) = token
        override fun refresh(): Boolean { if (refreshOk) token = "tok2"; return refreshOk }
    }
    private class FakeStatus : SyncStatusStore {
        var ok = 0; val errors = mutableListOf<String>()
        override fun recordSuccess(nowMillis: Long) { ok++ }
        override fun recordError(kind: String, nowMillis: Long) { errors += kind }
    }
    private class Net(val reply: (String) -> HttpResult = { HttpResult(201, "") }) : HttpTransport {
        val sent = mutableListOf<Pair<String, String>>()
        val expenses get() = sent.filter { it.first.endsWith("/rest/v1/expenses") }
        override fun post(url: String, headers: Map<String, String>, body: String): HttpResult { sent += url to body; return reply(url) }
    }
    private val status = FakeStatus()
    private fun syncer(net: Net, session: SessionSource = FakeSession()) =
        ExpenseSyncer(repo, { profile }, { owner }, { "https://api.demo.test/supabase" }, session, net, status, { now })

    /** El flujo real: aviso -> borrador PENDIENTE de compra en cuotas -> «Guardar» en la notificacion. */
    private fun guardadoDesdeLaNotificacion(): Draft {
        assertEquals(Outcome.STORED, processor.process(IncomingNotice(cmr, null, aviso, now, key = "0|$cmr|1|null|1", whenMillis = now)))
        val pending = repo.list().single()
        assertEquals(DraftStatus.PENDING, pending.status)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, 10_000L), pending.candidate.installmentPlan)
        assertTrue(pending.savableFromNotification)
        assertTrue(DraftActions.saveFromNotification(repo, pending.id, owner))
        return repo.list().single().also { assertEquals(DraftStatus.CONFIRMED, it.status) }
    }

    @Test
    fun `QA - compra CMR en 3 cuotas guardada desde la notificacion se envia UNA vez por el total`() {
        val d = guardadoDesdeLaNotificacion()
        val net = Net()
        assertEquals(SyncResult.ALL_SENT, syncer(net).syncOnce())
        val row = JSONObject(net.expenses.single().second)
        assertEquals(d.id, row.getString("id"))
        assertEquals(30_000L, row.getLong("amount"))
        assertEquals("Prueba-Emu Tienda (3 cuotas de \$10.000)", row.getString("note"))
        assertEquals("tarjeta", row.getString("payment_method"))
        assertEquals("la categoria general del perfil (comercio nuevo)", otros, row.getString("category_id"))
        assertFalse("Personal", row.getBoolean("shared")); assertEquals(uid, row.getString("paid_by"))
        assertEquals("2026-11-24", row.getString("spent_on"))
        assertTrue("enviado sale de la bandeja", repo.list().isEmpty())
        assertEquals(1, status.ok)
    }

    @Test
    fun `sin categoria posible el envio NO dice nada que enviar en silencio - avisa y conserva el borrador`() {
        profile = profile!!.copy(defaultCategoryId = null)
        guardadoDesdeLaNotificacion()
        val net = Net()
        val r = syncer(net).syncOnce()
        assertEquals(SyncResult.NEEDS_PERSON, r)
        assertTrue(net.sent.isEmpty())
        assertEquals(listOf("NEEDS_PERSON"), status.errors); assertEquals(0, status.ok)
        assertEquals(DraftStatus.CONFIRMED, repo.list().single().status)
        assertFalse(repo.list().single().syncRejected)
    }

    @Test
    fun `un corte de red o un 5xx reintentan y el borrador confirmado sigue en la bandeja por enviar`() {
        guardadoDesdeLaNotificacion()
        assertEquals(SyncResult.RETRY, syncer(Net { throw IOException("sin red") }).syncOnce())
        assertEquals(SyncResult.RETRY, syncer(Net { HttpResult(503, "") }).syncOnce())
        val d = repo.list().single()
        assertEquals(DraftStatus.CONFIRMED, d.status); assertFalse(d.syncRejected)
        assertEquals(listOf("NETWORK", "SERVER"), status.errors)
        assertTrue(SyncResult.RETRY.retriesInBackground)
    }

    @Test
    fun `sin token vigente (la app abierta no deja renovar) reintenta en vez de terminar en silencio`() {
        guardadoDesdeLaNotificacion()
        assertEquals(SyncResult.RETRY, syncer(Net(), FakeSession(token = null, refreshOk = false)).syncOnce())
        assertEquals(listOf("AUTH"), status.errors)
        assertEquals(DraftStatus.CONFIRMED, repo.list().single().status)
    }

    @Test
    fun `sin perfil con gastos confirmados por enviar deja el motivo a la vista`() {
        guardadoDesdeLaNotificacion()
        profile = null
        assertEquals(SyncResult.NO_SESSION, syncer(Net()).syncOnce())
        assertEquals(listOf("NO_PROFILE"), status.errors)
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `solo NOTHING_TO_SEND, ALL_SENT, REJECTED, NEEDS_PERSON y NO_SESSION terminan el trabajo y RETRY reintenta`() {
        assertEquals(setOf(SyncResult.RETRY), SyncResult.entries.filter { it.retriesInBackground }.toSet())
    }

    // ---- caso B/C: el cobro de una cuota anterior y la compra sin total no se guardan desde la notificacion ni se envian

    /** [cuota] = el aviso trae «cuota 1/3»: con rol PURCHASE es una compra en cuotas SIN total (el monto es una cuota). */
    private fun plan(role: InstallmentRole, cuota: Installment? = null) = ParsedCandidate(
        amountClp = 10_000, merchant = "Prueba-Emu Tienda", kind = Kind.EXPENSE, confidence = Confidence.HIGH, installment = cuota,
        fingerprint = "f-$role-$cuota", installmentPlan = InstallmentPlan(role, 3, null),
    )
    private fun draft(c: ParsedCandidate, s: DraftStatus) =
        Draft(java.util.UUID.randomUUID().toString(), c, now, now, s, cmr, owner).also { repo.add(it) }

    @Test
    fun `B-C - una notificacion vieja con Guardar no confirma el cobro de una cuota anterior ni la compra sin total`() {
        val prior = draft(plan(InstallmentRole.PRIOR_CHARGE), DraftStatus.PENDING)
        val unknown = draft(plan(InstallmentRole.PURCHASE, Installment(1, 3)).also { assertTrue(it.installmentTotalUnknown) }, DraftStatus.PENDING)
        assertFalse(DraftActions.saveFromNotification(repo, prior.id, owner))
        assertFalse(DraftActions.saveFromNotification(repo, unknown.id, owner))
        assertTrue(repo.list().all { it.status == DraftStatus.PENDING })
        assertEquals(SyncResult.NOTHING_TO_SEND, syncer(Net()).syncOnce())
    }

    @Test
    fun `B-C - un borrador CONFIRMED heredado de una cuota anterior jamas se envia como gasto nuevo`() {
        draft(plan(InstallmentRole.PRIOR_CHARGE), DraftStatus.CONFIRMED)
        draft(plan(InstallmentRole.PURCHASE, Installment(1, 3)).also { assertTrue(it.installmentTotalUnknown) }, DraftStatus.CONFIRMED)
        val net = Net()
        assertEquals(SyncResult.NEEDS_PERSON, syncer(net).syncOnce())
        assertTrue(net.sent.isEmpty())
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `una compra en cuotas con monto dudoso no ofrece Guardar ni se envia sola`() {
        val c = plan(InstallmentRole.PURCHASE).copy(amountClp = 30_000)
        val d = Draft(java.util.UUID.randomUUID().toString(), c, now, now, DraftStatus.CONFIRMED, cmr, owner, ambiguousAmount = true).also { repo.add(it) }
        assertFalse(d.savableFromNotification)
        assertFalse(d.copy(status = DraftStatus.PENDING, ambiguousAmount = false).candidate.installmentTotalUnknown)
        assertTrue("sin la duda si se puede", d.copy(ambiguousAmount = false).savableFromNotification)
        val net = Net()
        assertEquals(SyncResult.NEEDS_PERSON, syncer(net).syncOnce()); assertTrue(net.sent.isEmpty())
    }

    @Test
    fun `Enviar ahora informa cuantos salieron, cuantos fallaron y cuantos necesitan a la persona`() {
        guardadoDesdeLaNotificacion()
        draft(plan(InstallmentRole.PRIOR_CHARGE), DraftStatus.CONFIRMED)
        val r = syncer(Net()).syncWithReport()
        assertEquals(SyncReport(SyncResult.NEEDS_PERSON, sent = 1, failed = 0, needsPerson = 1), r)
        assertEquals("lo enviado deja constancia y el pendiente de la persona tambien", 1, status.ok); assertEquals(listOf("NEEDS_PERSON"), status.errors)
        now += 60_000
        guardadoDesdeLaNotificacion2()
        assertEquals(SyncReport(SyncResult.RETRY, sent = 0, failed = 1, needsPerson = 1), syncer(Net { HttpResult(503, "") }).syncWithReport())
    }

    private fun guardadoDesdeLaNotificacion2() {
        processor.process(IncomingNotice(cmr, null, aviso.replace("30.000", "45.000").replace("10.000", "15.000"), now, key = "0|$cmr|2|null|1", whenMillis = now))
        val d = repo.list().first { it.status == DraftStatus.PENDING }
        assertTrue(DraftActions.saveFromNotification(repo, d.id, owner))
    }

    // ---- «Vaciar movimientos pendientes» no se lleva lo guardado desde la notificacion

    @Test
    fun `clearPending borra solo los PENDIENTES del dueno activo y conserva los confirmados por enviar`() {
        val saved = guardadoDesdeLaNotificacion()
        val pend = draft(plan(InstallmentRole.PRIOR_CHARGE), DraftStatus.PENDING)
        val ajeno = Draft(java.util.UUID.randomUUID().toString(), plan(InstallmentRole.PRIOR_CHARGE), now, now, DraftStatus.PENDING, cmr, "u2:h2").also { repo.add(it) }
        assertEquals(1, DraftCleanup.unsentConfirmed(repo.list(), owner))
        assertEquals(listOf(pend.id), DraftCleanup.clearPending(repo, owner))
        assertEquals(setOf(saved.id, ajeno.id), repo.list().map { it.id }.toSet())
        assertEquals(emptyList<String>(), DraftCleanup.clearPending(repo, null))
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `Guardar agenda el envio ya y el trabajo solo reintenta lo pasajero`() {
        val receiver = java.io.File("src/main/kotlin/cl/dinovance/contigo/capture/DraftActionReceiver.kt").readText()
        assertTrue(receiver.contains("SyncScheduler.enqueue(context)"))
        val worker = java.io.File("src/main/kotlin/cl/dinovance/contigo/sync/ExpenseSyncWorker.kt").readText()
        // Solo lo pasajero reintenta, con espera acotada (SyncRetryPolicy usa retriesInBackground); ya no el retroceso de WorkManager
        assertTrue(worker.contains("SyncRetryPolicy.nextDelayMillis(result, attempts) ?: return Result.success()"))
        assertTrue(worker.contains("NetworkType.CONNECTED"))
    }
}
