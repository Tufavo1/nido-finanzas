// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.Outcome
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

/** Ingresos, pagos de deuda y reversas con el guardado automatico ENCENDIDO: nunca se guardan solos. Avisos SINTETICOS. */
class BankNoticeFlowTest {
    private val bank = "cl.demo.cmr"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    private var now = 1_795_273_230_000L
    private var synced = 0
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = if (packageName == bank) "banco-falabella" else null
        override fun autoEnabled(bank: String) = true
        override fun maxClp() = 1_000_000L
    }
    // Categoria aprendida para todo: si el gasto fuera elegible se guardaria solo
    private val profile = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Ganaderia Rio Bueno") to cat, "w:compra" to cat, "w:ganaderia" to cat))
    private val notifier = RecordingNotifier()
    private fun p() = CaptureProcessor({ setOf(bank) }, repo, notifier, RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile }, onAutoSaved = { synced++ })
    private fun send(t: String) = p().process(bank, null, t, now).also { now += 200_000 }

    @Test
    fun `ingreso, pago de deuda y reversa llegan pendientes y nunca se guardan solos`() {
        listOf(
            "Recibiste \$10.000 Te trasnfirieron \$10.000 a tu Cuenta Banco Falabella 2236. !Ingresa a la App y revisa tus movimientos!",
            "Pagaste \$34.400 a tu CMR Mastercard Premium. Revisa mas detalles en tu app",
            "Pagaste \$34.400 14:35 a tu CMR Mastercard Premium",
            "Reversa de compra por \$6.778 en Ganaderia Rio Bueno con tu Debito Banco Falabella",
            "Anulaste \$6.778 en Ganaderia Rio Bueno", "Devolucion de \$6.778 de Ganaderia Rio Bueno",
        ).forEach { assertEquals(it, Outcome.STORED, send(it)) }
        val l = repo.list()
        assertEquals(6, l.size)
        assertTrue(l.all { it.status == DraftStatus.PENDING && !it.autoSaved && it.categoryId == null })
        assertEquals(0, synced)
        assertTrue(l.none { it.candidate.kind == Kind.EXPENSE })
    }

    @Test
    fun `una compra con categoria aprendida si se guarda sola (control)`() {
        assertEquals(Outcome.STORED, send("Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl Con tu Debito Banco Falabella"))
        assertTrue(repo.list().single().autoSaved); assertEquals(1, synced)
    }

    @Test
    fun `el dedupe no confunde tipos, mismo monto como gasto, ingreso y pago de deuda`() {
        val proc = p()
        assertEquals(Outcome.STORED, proc.process(bank, null, "Compraste \$10.000 en Tienda Demo Con tu Debito Banco Falabella", now))
        now += 1_000
        assertEquals(Outcome.STORED, proc.process(bank, null, "Recibiste \$10.000 Te transfirieron \$10.000 a tu Cuenta Banco Falabella 2236.", now))
        now += 1_000
        assertEquals(Outcome.STORED, proc.process(bank, null, "Pagaste \$10.000 a tu CMR Mastercard Premium", now))
        now += 1_000
        assertEquals(Outcome.STORED, proc.process(bank, null, "Reversa de compra \$10.500 en Tienda Demo", now))
        assertEquals(setOf(Kind.EXPENSE, Kind.INCOME, Kind.DEBT_PAYMENT), repo.list().map { it.candidate.kind }.toSet())
        assertEquals(4, repo.list().size)
        assertTrue(repo.list().filter { it.candidate.kind != Kind.EXPENSE }.none { it.possibleDuplicate })
        // el mismo ingreso repetido SI es duplicado
        now += 1_000
        assertEquals(Outcome.DUPLICATE, proc.process(bank, null, "Recibiste \$10.000 Te transfirieron \$10.000 a tu Cuenta Banco Falabella 2236.", now))
    }

    @Test
    fun `un cargo sin comercio no se completa con un ingreso del mismo monto`() {
        val proc = p()
        proc.process(bank, null, "Compraste \$6.778", now); now += 5_000
        proc.process(bank, null, "Recibiste \$6.778 de Juan Perez", now)
        val l = repo.list()
        assertEquals(2, l.size); assertEquals(Kind.EXPENSE, l[0].candidate.kind); assertNull(l[0].candidate.merchant)
    }

    private class S : SessionSource { override fun accessToken(nowSeconds: Long) = "tok"; override fun refresh() = true }
    private class St : SyncStatusStore { override fun recordSuccess(nowMillis: Long) {}; override fun recordError(kind: String, nowMillis: Long) {} }
    private class Net : HttpTransport { val sent = mutableListOf<String>(); override fun post(url: String, headers: Map<String, String>, body: String): HttpResult { sent += url; return HttpResult(201, "") } }

    @Test
    fun `el envio en segundo plano ignora ingresos y pagos aunque estuvieran confirmados y con categoria`() {
        listOf(Kind.INCOME, Kind.DEBT_PAYMENT).forEachIndexed { i, k ->
            repo.add(Draft("id$i", ParsedCandidate(5_000L + i, "Ganaderia Rio Bueno", k, Confidence.HIGH, null, "fp$i"), now, now, DraftStatus.CONFIRMED, bank, owner, false, cat, true))
        }
        val net = Net()
        val r = ExpenseSyncer(repo, { profile }, { owner }, { "https://api.demo.test/supabase" }, S(), net, St(), { now }).syncOnce()
        assertEquals(SyncResult.NOTHING_TO_SEND, r); assertTrue(net.sent.isEmpty())
    }

    @Test
    fun `un borrador viejo sin cuenta se sigue leyendo y la cuenta nueva se guarda tal cual`() {
        val old = JSONObject().put("id", "a").put("amountClp", 5000).put("merchant", "Cafe").put("kind", "EXPENSE").put("confidence", "HIGH")
            .put("installment", JSONObject.NULL).put("fingerprint", "f").put("postedAtMillis", 1L).put("createdAtMillis", 2L).put("status", "PENDING")
        val d = Draft.fromJson(old)
        assertNull(d.candidate.account); assertEquals("Cafe", d.candidate.merchant)
        val withAcc = d.copy(candidate = d.candidate.copy(account = "CMR Mastercard Premium ·5766"))
        assertEquals("CMR Mastercard Premium ·5766", Draft.fromJson(withAcc.toJson()).candidate.account)
        // un campo account vacio o nulo explicito tampoco rompe
        assertNull(Draft.fromJson(JSONObject(old.toString()).put("account", "")).candidate.account)
        assertNull(Draft.fromJson(JSONObject(old.toString()).put("account", JSONObject.NULL)).candidate.account)
    }

    @Test
    fun `lo guardado nunca contiene el texto bruto y la cuenta solo trae nombre y 4 digitos`() {
        send("Recibiste \$10.000 Te trasnfirieron \$10.000 a tu Cuenta Banco Falabella 22364455. !Ingresa a la App y revisa tus movimientos!")
        send("Compraste \$20.798 en Merpago Joseestebanrom Las Condes Chl Con tu CMR Mastercard PRemium Terminada en 5766. Si no la realisaste tu, revisa los movimientos de tus adicionales en tu app.")
        val json = repo.list().joinToString("|") { it.toJson().toString() }
        listOf("Ingresa a la App", "revisa los movimientos", "Te trasnfirieron", "22364455").forEach { assertFalse(it, json.contains(it)) }
        repo.list().mapNotNull { it.candidate.account }.forEach { assertTrue(it, Regex("^[\\p{L} ]+( ·\\d{4})?$").matches(it)) }
    }
}
