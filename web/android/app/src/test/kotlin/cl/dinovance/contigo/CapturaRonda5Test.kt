// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.ActiveNotice
import cl.dinovance.contigo.capture.CaptureHealth
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.DiagReason
import cl.dinovance.contigo.capture.DiagnosticsLog
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.DraftRepository
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.HealthInputs
import cl.dinovance.contigo.capture.HealthSnapshot
import cl.dinovance.contigo.capture.HealthState
import cl.dinovance.contigo.capture.IncomingNotice
import cl.dinovance.contigo.capture.NoticeExtractor
import cl.dinovance.contigo.capture.NoticeLedger
import cl.dinovance.contigo.capture.NoticeShape
import cl.dinovance.contigo.capture.NotificationRescanner
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.capture.RawNotice
import cl.dinovance.contigo.capture.RebindPolicy
import cl.dinovance.contigo.capture.SeenNotices
import cl.dinovance.contigo.capture.TextStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CapturaRonda5Test {
    private val bank = "cl.banco.demo"
    private var now = 1_795_273_230_000L
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private class Mem : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val ledgerStore = Mem()
    private val diagStore = Mem()
    private val notifier = RecordingNotifier()
    private val diag = DiagnosticsLog(diagStore) { now }
    private var owner: String? = "u1:h1"
    private var ids = 0
    private fun proc(r: DraftRepository = repo, ledger: NoticeLedger = NoticeLedger(ledgerStore)) = CaptureProcessor(
        { setOf(bank) }, r, notifier, RecordingHealth(), { now }, { "d${++ids}" }, ownerProvider = { owner }, requireOwner = true,
        diag = diag, ledger = ledger,
    )
    private fun notice(text: String?, key: String = "k1", whenMillis: Long = 1_000L, title: String? = null, posted: Long = now, shape: NoticeShape? = null) =
        IncomingNotice(bank, title, text, posted, key, whenMillis, shape)

    // ---- (a) deduplicacion por clave + contenido

    @Test
    fun `el sistema reenvia el mismo aviso (misma clave, mismo texto, mismo when) tarde, no se duplica, tampoco tras reiniciar`() {
        val t = "Compraste \$4.990 en Cafe Demo"
        assertEquals(Outcome.STORED, proc().process(notice(t)))
        now += 10 * 60_000 // diez minutos despues, mucho mas que la ventana de 45 s
        assertEquals(Outcome.DUPLICATE, proc().process(notice(t, posted = now))) // proceso nuevo = memoria perdida
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `una actualizacion con mas detalle de la misma clave completa el borrador en vez de crear otro`() {
        val p = proc()
        assertEquals(Outcome.STORED, p.process(notice("Compra aprobada por \$12.990")))
        now += 3 * 60_000
        assertEquals(Outcome.DUPLICATE, p.process(notice("Compra aprobada por \$12.990 en ALMACEN DEMO con tu tarjeta", posted = now)))
        val d = repo.list().single()
        assertEquals("Almacen Demo", d.candidate.merchant)
        assertEquals("Almacen Demo", notifier.shown.last().candidate.merchant)
    }

    @Test
    fun `mismo when actualizado con otro texto pero mismo monto se trata como el mismo aviso`() {
        val p = proc()
        p.process(notice("Compraste \$4.990 en Cafe Demo"))
        now += 5 * 60_000
        assertEquals(Outcome.DUPLICATE, p.process(notice("Compraste \$4.990 en Cafe Demo. Revisa mas detalles en tu app", posted = now)))
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `un aviso nuevo legitimo del mismo monto y comercio con la misma clave (otro when) no se pierde`() {
        val p = proc()
        val t = "Compraste \$4.990 en Cafe Demo"
        assertEquals(Outcome.STORED, p.process(notice(t, whenMillis = 1_000)))
        now += 5 * 60_000
        assertEquals(Outcome.STORED, p.process(notice(t, whenMillis = 2_000, posted = now)))
        assertEquals(2, repo.list().size)
        // la misma clave con otro monto tambien es otro aviso
        now += 60_000
        assertEquals(Outcome.STORED, p.process(notice("Compraste \$5.990 en Cafe Demo", whenMillis = 3_000, posted = now)))
        assertEquals(3, repo.list().size)
    }

    @Test
    fun `otra compra del mismo monto con otro comercio en la misma clave es otro borrador`() {
        val p = proc()
        p.process(notice("Compraste \$4.990 en Cafe Demo"))
        now += 60_000
        assertEquals(Outcome.STORED, p.process(notice("Compraste \$4.990 en Farmacia Demo", posted = now)))
        assertEquals(2, repo.list().size)
    }

    @Test
    fun `el registro de avisos solo guarda hashes y tiene tope`() {
        proc().process(notice("Compraste \$4.990 en Cafe Demo"))
        val raw = ledgerStore.v!!
        listOf("4990", "4.990", "Cafe", bank, "k1").forEach { assertFalse(it, raw.contains(it)) }
        val l = NoticeLedger(ledgerStore, max = 5)
        repeat(9) { l.add(NoticeLedger.Entry("i$it", "s", "m", 0, "d", now)) }
        assertEquals(5, org.json.JSONArray(ledgerStore.v).length())
    }

    // ---- (g) el servicio muere a mitad de un aviso

    @Test
    fun `si el proceso muere despues de guardar el borrador pero antes de anotarlo, el reintento no duplica`() {
        val t = "Compraste \$4.990 en Cafe Demo"
        // Simula la muerte: el borrador quedo guardado pero el registro de avisos no alcanzo a escribirse
        val dying = proc(ledger = NoticeLedger(object : TextStore { override fun read(): String? = null; override fun write(value: String?) = throw IllegalStateException("muerto") }))
        dying.process(notice(t))
        assertEquals(1, repo.list().size)
        // Al reconectar, el reescaneo lee el MISMO aviso (misma hora de publicacion)
        assertEquals(Outcome.DUPLICATE, proc().process(notice(t)))
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `un aviso que fallo (FAILED) no se marca como visto y el reescaneo lo reintenta sin duplicar`() {
        var broken = true
        val flaky = object : DraftRepository by repo {
            override fun add(draft: Draft): Boolean = if (broken) throw IllegalStateException("disco") else repo.add(draft)
        }
        val p = proc(r = flaky)
        val seenStore = Mem()
        val seen = SeenNotices(seenStore)
        val rescanner = NotificationRescanner({ p.accepts(it) }, { _, _, _, _ -> Outcome.FAILED }, seen, { now }, { _, _ -> }, processNotice = { p.process(it) })
        val n = ActiveNotice(bank, "k1", now - 1_000, whenMillis = 1_000) { null to "Compraste \$4.990 en Cafe Demo" }
        assertEquals(0, rescanner.scan(listOf(n)).processed)
        assertFalse(seen.has(bank, "k1", now - 1_000))
        broken = false
        assertEquals(1, rescanner.scan(listOf(n)).processed)
        assertEquals(0, rescanner.scan(listOf(n)).processed)
        assertEquals(1, repo.list().size)
    }

    // ---- (f) sin dueno

    @Test
    fun `sin sesion el aviso se guarda sin dueno una sola vez y el reintento no lo duplica`() {
        owner = null
        val t = "Compraste \$4.990 en Cafe Demo"
        assertEquals(Outcome.NO_SESSION, proc().process(notice(t)))
        assertEquals(Outcome.DUPLICATE, proc().process(notice(t)))
        val d = repo.list().single()
        assertNull(d.ownerKey); assertEquals(DraftStatus.PENDING, d.status)
        assertTrue(notifier.shown.isEmpty())
    }

    // ---- (b) extras: InboxStyle, MessagingStyle, subtexto y resumen

    private fun raw(
        title: String? = null, text: String? = null, big: String? = null, lines: List<String> = emptyList(), messages: List<String> = emptyList(),
        sub: String? = null, summary: String? = null, group: Boolean = false, ongoing: Boolean = false, fgs: Boolean = false,
    ) = RawNotice(title, text, big, lines, messages, sub, summary, group, ongoing, fgs)

    @Test
    fun `texto ampliado gana sobre el texto y si ambos vienen vacios se leen lineas, mensajes, subtexto y resumen`() {
        assertEquals("grande", NoticeExtractor.extract(raw(text = "corto", big = "grande")).body)
        assertEquals("corto", NoticeExtractor.extract(raw(text = "corto", big = "  ")).body)
        assertEquals("Compraste \$1.000 en A\nCompraste \$2.000 en B", NoticeExtractor.extract(raw(text = "", lines = listOf("Compraste \$1.000 en A", "Compraste \$2.000 en B"))).body)
        assertEquals("Compraste \$3.000 en C", NoticeExtractor.extract(raw(messages = listOf("Compraste \$3.000 en C"))).body)
        assertEquals("Compraste \$4.000 en D", NoticeExtractor.extract(raw(sub = "Compraste \$4.000 en D")).body)
        assertEquals("Compraste \$5.000 en E", NoticeExtractor.extract(raw(summary = "Compraste \$5.000 en E")).body)
        assertNull(NoticeExtractor.extract(raw(title = "Banco")).body)
    }

    @Test
    fun `resumenes de grupo y avisos fijos o de servicio se descartan sin leer el texto`() {
        assertEquals(NoticeExtractor.Skip.GROUP_SUMMARY, NoticeExtractor.skipReason(raw(text = "Compraste \$1.000 en A", group = true)))
        assertEquals(NoticeExtractor.Skip.ONGOING, NoticeExtractor.skipReason(raw(text = "x", ongoing = true)))
        assertEquals(NoticeExtractor.Skip.ONGOING, NoticeExtractor.skipReason(raw(text = "x", fgs = true)))
        assertNull(NoticeExtractor.skipReason(raw(text = "Compraste \$1.000 en A")))
    }

    @Test
    fun `todo tiene tope de largo`() {
        val huge = "A".repeat(10_000)
        val e = NoticeExtractor.extract(raw(title = huge, lines = List(100) { huge }))
        assertTrue(e.title!!.length <= NoticeExtractor.MAX_TEXT)
        assertTrue(e.body!!.length <= NoticeExtractor.MAX_TEXT)
        assertTrue(e.shape.truncated)
        assertEquals(100, e.shape.lines)
    }

    // ---- (c) estructura del aviso para el diagnostico

    @Test
    fun `la estructura dice que campos traian contenido y su largo, nunca el contenido`() {
        val e = NoticeExtractor.extract(raw(title = "Banco Demo", text = "Tienes un nuevo movimiento", sub = "Cuenta"))
        val s = e.shape
        assertEquals(10, s.title); assertEquals(26, s.text); assertEquals(0, s.bigText); assertEquals(6, s.subText)
        assertEquals(listOf("title", "text", "subText"), s.fields())
        val json = s.toJson().toString()
        assertFalse(json.contains("Banco") || json.contains("movimiento") || json.contains("Cuenta"))
        assertEquals(s, NoticeShape.fromJson(s.toJson()))
    }

    @Test
    fun `el diagnostico de un aviso sin monto guarda la estructura cifrada para explicar que llego`() {
        val e = NoticeExtractor.extract(raw(title = "Banco Demo", text = "Tienes un nuevo movimiento"))
        proc().process(notice(e.body, title = e.title, shape = e.shape))
        val entry = diag.list().single()
        assertEquals(DiagReason.NO_AMOUNT, entry.reason)
        assertEquals(listOf("title", "text"), entry.shape!!.fields())
        assertEquals(NoticeShape.Hint.NO_AMOUNT_IN_TITLE_OR_TEXT, entry.shape!!.hint())
        // Un diagnostico antiguo sin estructura se sigue leyendo
        diagStore.v = "[{\"at\":1,\"bank\":null,\"reason\":\"NO_AMOUNT\",\"text\":\"x\"}]"
        assertNull(diag.list().single().shape)
    }

    @Test
    fun `pistas de la estructura`() {
        assertEquals(NoticeShape.Hint.EMPTY, NoticeExtractor.extract(raw()).shape.hint())
        assertEquals(NoticeShape.Hint.ONLY_TITLE, NoticeExtractor.extract(raw(title = "Banco")).shape.hint())
        assertEquals(NoticeShape.Hint.NO_AMOUNT_IN_TITLE_OR_TEXT, NoticeExtractor.extract(raw(title = "Banco", text = "hola")).shape.hint())
    }

    // ---- (d) salud del servicio

    private val hour = 3_600_000L
    private fun snap(connected: Boolean = true, connectedAt: Long? = now - hour, disconnectedAt: Long? = null, version: Long? = 10) =
        HealthSnapshot(lastEventAt = null, lastHeartbeatAt = connectedAt, connected = connected, everConnected = true, failures = 0, lastFailureClass = null, lastFailureAt = null,
            lastConnectedAt = connectedAt, lastDisconnectedAt = disconnectedAt, connectedVersion = version)
    private fun health(allowed: Boolean = true, live: Boolean = true, s: HealthSnapshot = snap(), restricted: Boolean = false, age: Long = 10 * 60_000, version: Long = 10) =
        CaptureHealth.compute(HealthInputs(now, allowed, live, s, version, restricted, batteryOptimized = true, processAgeMillis = age, whitelistCount = 2))

    @Test
    fun `estado leyendo, sin acceso, desconectado hace N horas y bateria que lo restringe`() {
        assertEquals(HealthState.OK, health().state)
        assertEquals(HealthState.NO_ACCESS, health(allowed = false, live = false).state)
        val off = health(live = false, s = snap(connected = false, connectedAt = now - 6 * hour, disconnectedAt = now - 5 * hour))
        assertEquals(HealthState.DISCONNECTED, off.state); assertEquals(5, off.disconnectedHours)
        assertEquals(HealthState.BATTERY_RESTRICTED, health(restricted = true).state)
        // sin acceso gana sobre todo lo demas
        assertEquals(HealthState.NO_ACCESS, health(allowed = false, live = false, restricted = true).state)
    }

    @Test
    fun `recien abierta la app se da un margen antes de decir desconectado`() {
        assertEquals(HealthState.CONNECTING, health(live = false, age = 5_000).state)
        assertEquals(HealthState.DISCONNECTED, health(live = false, age = 5 * 60_000).state)
    }

    @Test
    fun `tras actualizar la app se nota y no se inventan horas si no se sabe desde cuando`() {
        val h = health(live = false, s = snap(connected = true), version = 11) // el proceso murio sin aviso de desconexion
        assertEquals(HealthState.DISCONNECTED, h.state); assertTrue(h.sinceUpdate); assertNull(h.disconnectedHours)
        assertFalse(health(live = false).sinceUpdate)
        val m = h.toMap()
        assertEquals("DISCONNECTED", m["state"]); assertEquals(true, m["sinceUpdate"])
        assertTrue(m.values.all { it == null || it is String || it is Number || it is Boolean })
    }

    @Test
    fun `el reenganche se pide solo con permiso, sin conexion y como maximo cada 30 s`() {
        assertTrue(RebindPolicy.shouldRequest(now, null, allowed = true, connected = false))
        assertFalse(RebindPolicy.shouldRequest(now, now - 10_000, allowed = true, connected = false))
        assertTrue(RebindPolicy.shouldRequest(now, now - 31_000, allowed = true, connected = false))
        assertFalse(RebindPolicy.shouldRequest(now, null, allowed = false, connected = false))
        assertFalse(RebindPolicy.shouldRequest(now, null, allowed = true, connected = true))
    }

    @Test
    fun `la estructura del aviso y la salud no llevan texto ni montos`() {
        val e = NoticeExtractor.extract(raw(title = "Compraste \$4.990", text = "en Cafe Demo"))
        assertNotNull(e.body)
        assertFalse(e.shape.toString().contains("4.990") || e.shape.toString().contains("Cafe"))
        assertFalse(health().toMap().toString().contains(bank))
    }

    // ---- integracion

    @Test
    fun `un aviso InboxStyle sin texto se lee por sus lineas y queda pendiente para la persona`() {
        val e = NoticeExtractor.extract(raw(title = "Banco Demo", text = "", lines = listOf("Compraste \$4.990 en Cafe Demo")))
        assertEquals(Outcome.STORED, proc().process(notice(e.body, title = e.title, shape = e.shape)))
        val d = repo.list().single()
        assertEquals(4_990L, d.candidate.amountClp); assertEquals("Cafe Demo", d.candidate.merchant); assertEquals(DraftStatus.PENDING, d.status)
    }

    @Test
    fun `el reescaneo salta resumenes de grupo sin leer el texto y usa el camino completo`() {
        val p = proc()
        var reads = 0
        val rescanner = NotificationRescanner({ p.accepts(it) }, { _, _, _, _ -> Outcome.FAILED }, SeenNotices(Mem()), { now }, { _, _ -> }, processNotice = { p.process(it) })
        val summary = ActiveNotice(bank, "g", now - 1_000, skip = true) { reads++; null to "Compraste \$4.990 en Cafe Demo" }
        val child = ActiveNotice(bank, "c", now - 1_000, 7L, extract = { reads++; NoticeExtractor.extract(raw(big = "Compraste \$4.990 en Cafe Demo")) }) { reads++; null to null }
        val r = rescanner.scan(listOf(summary, child))
        assertEquals(1, r.scanned); assertEquals(1, r.processed); assertEquals(1, reads)
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `las claves de la capa nativa no se leen ni escriben desde el WebView`() {
        listOf("auto-profile", "auto-log", "diag-log", "capture-prefs").forEach { assertTrue(it, cl.dinovance.contigo.capture.CaptureGraph.isReservedKey(it)) }
        listOf("contigo-auth", "queue-abc", "capture-config").forEach { assertFalse(it, cl.dinovance.contigo.capture.CaptureGraph.isReservedKey(it)) }
    }
}
