// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.AutoSavedLog
import cl.dinovance.contigo.capture.BankDetector
import cl.dinovance.contigo.capture.BankMatcher
import cl.dinovance.contigo.capture.BankPresets
import cl.dinovance.contigo.capture.BankSetup
import cl.dinovance.contigo.capture.BankStore
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.CaptureSources
import cl.dinovance.contigo.capture.DetectStatus
import cl.dinovance.contigo.capture.DiagReason
import cl.dinovance.contigo.capture.DiagnosticsLog
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.InstalledApp
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.capture.TextStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Decision del dueno (2026-11-24): la captura de avisos SOLO esta verificada con Banco Falabella y Billetera de Google. Santander,
 * Banco Estado y Banco de Chile se ocultan: no se ofrecen, no se encienden solos y sus avisos no crean borradores ni se guardan solos.
 * Sus reglas de deteccion se conservan: el dueno los reactiva uno a uno agregando el id a [BankPresets.VERIFIED]. Datos SINTETICOS.
 */
class FuentesVerificadasTest {
    private val hidden = listOf("santander", "banco-estado", "banco-chile")

    // ---- (1) Una unica lista nativa ----

    @Test
    fun `la lista unica de fuentes verificadas es Banco Falabella y Billetera de Google`() {
        assertEquals(setOf("banco-falabella", "billetera-google"), BankPresets.VERIFIED)
        assertTrue(BankPresets.VERIFIED.all { BankPresets.byId(it) != null }) // ningun id inventado
        hidden.forEach { assertFalse(it, CaptureSources.isVerified(it)) }
        assertTrue(CaptureSources.isVerified("banco-falabella") && CaptureSources.isVerified(BankPresets.WALLET_ID))
    }

    @Test
    fun `las reglas de deteccion de los tres bancos ocultos se conservan en el codigo`() {
        assertEquals(5, BankPresets.ALL.size)
        assertEquals("santander", BankMatcher.bankOf("Santander"))
        assertEquals("banco-estado", BankMatcher.bankOf("CuentaRUT"))
        assertEquals("banco-chile", BankMatcher.bankOf("Mi Pasaporte Banco de Chile"))
        assertEquals("banco-falabella", BankMatcher.bankOf("CMR Falabella"))
        assertEquals(BankPresets.WALLET_ID, BankMatcher.bankOf(InstalledApp("com.google.android.apps.walletnfcrel", "Google Pay")))
    }

    // ---- getDetectedBanks: solo verificadas, mas las ocultas YA encendidas ----

    private val apps = listOf(
        InstalledApp("x.s", "Santander"), InstalledApp("x.be", "BancoEstado"), InstalledApp("x.c", "Banco de Chile"),
        InstalledApp("x.f", "Banco Falabella"), InstalledApp("x.w", "Google Wallet"),
    )
    private fun detected() = BankDetector.detect(apps, emptyMap(), "cl.dinovance.contigo")

    @Test
    fun `getDetectedBanks muestra solo las verificadas si ninguna oculta estaba encendida`() {
        val v = CaptureSources.visibleDetected(detected(), autoOn = { false })
        assertEquals(listOf("banco-falabella", "billetera-google"), v.map { it.bankId })
        assertTrue(v.all { it.status == DetectStatus.installed })
    }

    @Test
    fun `una oculta encendida de antes sigue visible para poder apagarla, las demas ocultas no`() {
        val v = CaptureSources.visibleDetected(detected(), autoOn = { it == "santander" })
        assertEquals(listOf("santander", "banco-falabella", "billetera-google"), v.map { it.bankId })
        assertFalse(CaptureSources.isVerified(v.first().bankId)) // el front la rotula «Ya no disponible por ahora»
    }

    @Test
    fun `sin apps las verificadas salen como not_found y las ocultas no salen`() {
        val v = CaptureSources.visibleDetected(BankDetector.detect(emptyList(), emptyMap(), "own"), autoOn = { true })
        assertEquals(listOf("banco-falabella" to DetectStatus.not_found, "billetera-google" to DetectStatus.not_found), v.map { it.bankId to it.status })
    }

    // ---- enableAllDetected / setBankAutoSave ----

    private class Store : BankStore {
        val det = mutableMapOf<String, Set<String>>(); val auto = mutableMapOf<String, Boolean>()
        override fun detectedPackages(bank: String) = det[bank].orEmpty()
        override fun manualPackage(bank: String): String? = null
        override fun autoSave(bank: String) = auto[bank] == true
        override fun setAutoSave(bank: String, enabled: Boolean) { auto[bank] = enabled }
    }
    private fun storeWithAllApps() = Store().apply { BankPresets.ALL.forEach { det[it.id] = setOf("x.${it.id}") } }

    @Test
    fun `aceptar el consentimiento NUNCA enciende una fuente no verificada`() {
        val s = storeWithAllApps()
        val r = BankSetup(s).setAll(true)
        assertEquals(listOf("banco-falabella", "billetera-google"), r.enabled)
        assertTrue(r.withoutApp.isEmpty())
        hidden.forEach { assertNull(it, s.auto[it]) } // ni siquiera se escribe su preferencia
    }

    @Test
    fun `withoutApp solo informa fuentes verificadas`() {
        val r = BankSetup(Store()).setAll(true)
        assertEquals(listOf("banco-falabella", "billetera-google"), r.withoutApp)
    }

    @Test
    fun `apagar todo tambien apaga una oculta que estaba encendida`() {
        val s = storeWithAllApps().apply { auto["santander"] = true; auto["banco-falabella"] = true }
        val off = BankSetup(s).setAll(false)
        assertEquals(setOf("santander", "banco-falabella"), off.disabled.toSet())
        assertTrue(s.auto.values.none { it })
    }

    @Test
    fun `setBankAutoSave enciende solo verificadas y apaga cualquiera`() {
        hidden.forEach { assertFalse(CaptureSources.canSetAutoSave(it, enabled = true)); assertTrue(CaptureSources.canSetAutoSave(it, enabled = false)) }
        BankPresets.VERIFIED.forEach { assertTrue(CaptureSources.canSetAutoSave(it, enabled = true)) }
    }

    @Test
    fun `agregar un id a la lista lo reactiva (consentimiento, vista y captura)`() {
        val verified = BankPresets.VERIFIED + "santander"
        val s = storeWithAllApps()
        assertEquals(listOf("santander", "banco-falabella", "billetera-google"), BankSetup(s, verified).setAll(true).enabled)
        assertEquals("santander", CaptureSources.visibleDetected(detected(), { false }, verified).first().bankId)
        assertTrue(CaptureSources.canSetAutoSave("santander", true, verified))
        val c = Capture(verified)
        assertEquals(Outcome.STORED, c.p.process(c.santander, null, c.text(), c.now))
        assertTrue(c.repo.list().single().autoSaved)
    }

    // ---- (2) Procesador: una fuente oculta no crea borradores ni se guarda sola ----

    private class Capture(verified: Set<String> = BankPresets.VERIFIED, var santanderOn: Boolean = true) {
        val santander = "cl.demo.santander"
        val falabella = "cl.demo.falabella"
        val wallet = "cl.demo.wallet"
        /** Otra app de Banco Falabella que NO esta en la lista de apps a leer. */
        val cmrFuera = "cl.demo.cmr"
        val owner = "u1:h1"
        val cat = "33333333-3333-4333-8333-333333333333"
        var now = 1_795_456_800_000L // 2026-11-23 15:00 Santiago
        val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
        val notifier = RecordingNotifier()
        val health = RecordingHealth()
        private fun mem() = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
        val diag = DiagnosticsLog(mem()) { now }
        val log = AutoSavedLog(mem()) { now }
        var autoSaves = 0
        /** Preferencias guardadas: el procesador solo las LEE. */
        val prefs = mutableMapOf("santander" to santanderOn, "banco-falabella" to true, BankPresets.WALLET_ID to true)
        val cfg = object : AutoConfig {
            override fun bankOfPackage(packageName: String) = when (packageName) {
                santander -> "santander"; falabella, cmrFuera -> "banco-falabella"; wallet -> BankPresets.WALLET_ID; else -> null
            }
            override fun autoEnabled(bank: String) = prefs[bank] == true
            override fun maxClp() = 50_000L
        }
        val profile = AutoProfile(owner, "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111", true, mapOf(MerchantKey.of("Cafe Demo Norte") to cat), defaultCategoryId = cat)
        val p = CaptureProcessor(
            { setOf(santander, falabella, wallet) }, repo, notifier, health, { now }, { java.util.UUID.randomUUID().toString() },
            ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile }, onAutoSaved = { autoSaves++ }, autoLog = log, diag = diag,
            verifiedSources = verified,
        )
        fun text(amount: String = "$6.500") = "Compra aprobada por $amount en CAFE DEMO NORTE."
    }

    @Test
    fun `un aviso de una fuente oculta encendida de antes no se lee, no crea borrador ni se guarda solo`() {
        val c = Capture()
        assertFalse(c.p.accepts(c.santander)) // el servicio decide ANTES de leer el texto
        assertEquals(Outcome.IGNORED_PACKAGE, c.p.process(c.santander, null, c.text(), c.now))
        assertTrue(c.repo.list().isEmpty())
        assertTrue(c.notifier.shown.isEmpty() && c.notifier.autoSaved.isEmpty())
        assertTrue(c.log.list().isEmpty()); assertEquals(0, c.autoSaves)
        assertEquals(0, c.health.events) // no cuenta como aviso leido
        assertTrue(c.prefs["santander"] == true) // su preferencia NO se borra: se podra reactivar
    }

    @Test
    fun `diagnostico de la fuente oculta encendida es SOURCE_UNAVAILABLE, sin texto del aviso`() {
        val c = Capture()
        assertEquals(DiagReason.SOURCE_UNAVAILABLE, c.p.rejection(c.santander))
        // Lo que hace el servicio al no aceptar: anota el motivo sin leer el texto
        c.diag.add(c.p.rejection(c.santander)!!, c.cfg.bankOfPackage(c.santander), null)
        val e = c.diag.list().single()
        assertEquals("santander", e.bankId); assertEquals("", e.maskedText); assertNull(e.shape)
    }

    @Test
    fun `una fuente oculta apagada no deja diagnostico (no se llena la lista con avisos de un banco que nunca encendiste)`() {
        val c = Capture(santanderOn = false)
        assertFalse(c.p.accepts(c.santander))
        assertNull(c.p.rejection(c.santander))
    }

    @Test
    fun `apps sin banco y verificadas siguen igual (sin motivo de rechazo nuevo)`() {
        val c = Capture()
        assertNull(c.p.rejection("cl.otra.app")) // app cualquiera fuera de la lista: como antes, sin diagnostico
        assertFalse(c.p.accepts(c.cmrFuera))
        assertEquals(DiagReason.PACKAGE_NOT_ALLOWED, c.p.rejection(c.cmrFuera)) // app verificada fuera de la lista: igual que antes
        assertTrue(c.p.accepts(c.falabella) && c.p.accepts(c.wallet))
    }

    // ---- (4) Regresion: Falabella y Billetera de Google se capturan igual ----

    @Test
    fun `Falabella y Billetera de Google siguen guardandose solas`() {
        val c = Capture()
        assertEquals(Outcome.STORED, c.p.process(c.falabella, null, "Compraste \$12.990 en COPEC LAS CONDES SANTIAGO CL Con tu Debito Banco Falabella", c.now))
        c.now += 15 * 60_000L
        assertEquals(Outcome.STORED, c.p.process(c.wallet, "Cafe Demo Norte", "CLP 6.500 · Visa ••1234", c.now))
        assertEquals(listOf(DraftStatus.CONFIRMED, DraftStatus.CONFIRMED), c.repo.list().map { it.status })
        assertEquals(listOf(12_990L, 6_500L), c.repo.list().map { it.candidate.amountClp })
        assertEquals(2, c.autoSaves)
    }
}
