// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.ActiveNotice
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.NotificationRescanner
import cl.dinovance.contigo.capture.ScanReason
import cl.dinovance.contigo.capture.ScanReport
import cl.dinovance.contigo.capture.ScanResult
import cl.dinovance.contigo.capture.SeenNotices
import cl.dinovance.contigo.capture.TextStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RescanTest {
    private val bank = "cl.demo.cmr"
    private var now = 1_795_273_230_000L
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private val store = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val seen = SeenNotices(store)
    private val recent = mutableListOf<Pair<String, Long>>()
    private var textReads = 0
    private val proc = CaptureProcessor({ setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() }, ownerProvider = { "u1:h1" }, requireOwner = true)
    private fun rescanner(p: CaptureProcessor = proc, s: SeenNotices = seen) =
        NotificationRescanner({ p.accepts(it) }, { pk, t, x, at -> p.process(pk, t, x, at) }, s, { now }, { pk, at -> recent += pk to at })
    private val body = "Pagaste \$100 a tu CMR Mastercard Premium. Revisa mas detalles en tu app"
    private fun n(pkg: String = bank, key: String = "k1", postedAgo: Long = 60_000, text: String = body) =
        ActiveNotice(pkg, key, now - postedAgo) { textReads++; null to text }

    @Test
    fun `procesa un aviso activo una vez y devuelve cuantos`() {
        assertEquals(1, rescanner().rescan(listOf(n())))
        val d = repo.list().single()
        assertEquals(DraftStatus.PENDING, d.status); assertEquals(100L, d.candidate.amountClp)
        assertEquals(now - 60_000, d.postedAtMillis)
    }

    @Test
    fun `dos conexiones seguidas no duplican, tampoco con una instancia nueva`() {
        assertEquals(1, rescanner().rescan(listOf(n())))
        assertEquals(0, rescanner().rescan(listOf(n())))
        assertEquals(0, rescanner(s = SeenNotices(store)).rescan(listOf(n())))
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `lo que ya proceso onNotificationPosted se salta en el reescaneo`() {
        val a = n()
        proc.process(a.packageName, null, body, a.postTime)
        seen.mark(a.packageName, a.key, a.postTime)
        assertEquals(0, rescanner().rescan(listOf(a))); assertEquals(0, textReads)
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `paquetes no permitidos no se leen, pero se anotan solo paquete y fecha para el modo aprender`() {
        assertEquals(0, rescanner().rescan(listOf(n(pkg = "com.otra.app"))))
        assertEquals(0, textReads); assertTrue(repo.list().isEmpty())
        assertEquals(listOf("com.otra.app" to now - 60_000), recent)
    }

    @Test
    fun `avisos de mas de 24 horas se ignoran y el tope por pasada es 50`() {
        assertEquals(0, rescanner().rescan(listOf(n(postedAgo = 24L * 3_600_000 + 1_000))))
        assertEquals(1, rescanner().rescan(listOf(n(key = "ok", postedAgo = 23L * 3_600_000))))
        val many = (1..80).map { n(key = "m$it", postedAgo = it * 1_000L, text = "Pagaste \$${1000 + it * 7} en Tienda Uno") }
        val before = textReads
        assertEquals(50, rescanner().rescan(many))
        assertEquals(50, textReads - before) // solo se leyeron 50 (los mas recientes); la bandeja tiene su propio tope de 50
    }

    @Test
    fun `un fallo del reescaneo no se propaga y el aviso malo no bloquea al resto`() {
        val boom = ActiveNotice(bank, "boom", now - 1_000) { throw IllegalStateException("extras corruptos") }
        assertEquals(1, rescanner().rescan(listOf(boom, n(key = "bien"))))
    }

    @Test
    fun `lo guardado son hashes SHA-256 sin texto ni clave, con tope de 200`() {
        rescanner().rescan(listOf(n()))
        val raw = store.v!!
        assertFalse(raw.contains("Pagaste") || raw.contains(bank) || raw.contains("k1"))
        assertTrue(Regex("\\[\"[0-9a-f]{64}\"]").matches(raw))
        repeat(250) { seen.mark(bank, "k$it", it.toLong()) }
        assertEquals(200, org.json.JSONArray(store.v).length())
        assertTrue(seen.has(bank, "k249", 249)); assertFalse(seen.has(bank, "k0", 0))
    }

    @Test
    fun `el reescaneo sigue las reglas de dueno, sin sesion se guarda huerfano`() {
        val orphan = CaptureProcessor({ setOf(bank) }, repo, RecordingNotifier(), RecordingHealth(), { now }, { "id" }, ownerProvider = { null }, requireOwner = true)
        rescanner(orphan).rescan(listOf(n()))
        assertNull(repo.list().single().ownerKey)
    }

    // ---- informe del boton «Buscar gastos»
    private fun report(vararg a: ActiveNotice) = rescanner().scan(a.toList())
    private fun result(listener: Boolean, hasBank: Boolean, vararg a: ActiveNotice) = ScanResult.of(listener, hasBank, report(*a))

    @Test
    fun `el informe cuenta examinados, nuevos, ya vistos y avisos de otras apps`() {
        val r = report(n(), n(key = "k2", text = "Pagaste \$200 a tu CMR Mastercard Premium"), n(pkg = "com.otra.app", key = "o1"), n(pkg = "com.otra.app", key = "o2"), n(key = "viejo", postedAgo = 25L * 3_600_000))
        assertEquals(ScanReport(scanned = 2, processed = 2, alreadySeen = 0, otherApps = 2), r)
        assertEquals(ScanReport(scanned = 2, processed = 0, alreadySeen = 2, otherApps = 1), report(n(), n(key = "k2", text = "x"), n(pkg = "com.otra.app")))
    }

    @Test
    fun `razon LISTENER_OFF, NO_BANK_APP, NOTHING_ACTIVE, ONLY_SEEN y OK`() {
        assertEquals(ScanReason.LISTENER_OFF, result(false, true, n()).reason)
        assertEquals(ScanReason.NO_BANK_APP, result(true, false, n()).reason)
        assertEquals(ScanReason.NOTHING_ACTIVE, result(true, true, n(pkg = "com.otra.app")).reason)
        assertEquals(ScanReason.NOTHING_ACTIVE, ScanResult.of(true, true, ScanReport(0, 0, 0, 0)).reason)
        assertEquals(ScanReason.OK, result(true, true, n(key = "nuevo")).reason)
        assertEquals(ScanReason.ONLY_SEEN, result(true, true, n(key = "nuevo")).reason) // la segunda pasada: ya visto
        // el apagado del permiso gana sobre lo demas
        assertEquals(ScanReason.LISTENER_OFF, ScanResult.of(false, false, ScanReport(0, 0, 0, 0)).reason)
    }

    @Test
    fun `ningun campo del resultado trae texto ni nombre de paquete`() {
        val r = result(true, true, n(), n(pkg = "com.otra.app", key = "z"))
        val s = r.toString()
        assertFalse(s.contains("com.otra") || s.contains(bank) || s.contains("Pagaste") || s.contains("CMR"))
        assertEquals(setOf("scanned", "processed", "alreadySeen", "otherApps", "reason"), r.toMap().keys)
        assertTrue(r.toMap().values.all { it is Int || it is String })
        assertTrue(r.toMap()["reason"] in ScanReason.values().map { it.name })
    }
}
