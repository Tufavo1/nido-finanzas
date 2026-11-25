// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.AutoConfig
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.BankDetector
import cl.dinovance.contigo.capture.BankPresets
import cl.dinovance.contigo.capture.CaptureProcessor
import cl.dinovance.contigo.capture.DetectStatus
import cl.dinovance.contigo.capture.DiagReason
import cl.dinovance.contigo.capture.DiagnosticsLog
import cl.dinovance.contigo.capture.DraftStatus
import cl.dinovance.contigo.capture.EncryptedDraftRepository
import cl.dinovance.contigo.capture.IncomingNotice
import cl.dinovance.contigo.capture.InstalledApp
import cl.dinovance.contigo.capture.MerchantKey
import cl.dinovance.contigo.capture.NoticeLedger
import cl.dinovance.contigo.capture.Outcome
import cl.dinovance.contigo.capture.PurchaseMemory
import cl.dinovance.contigo.capture.TextStore
import cl.nido.parser.InstallmentPlan
import cl.nido.parser.InstallmentRole
import cl.nido.parser.Kind
import cl.nido.parser.PaymentMedium
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Flujo completo (procesador + bandeja cifrada + registro) con avisos de Banco Falabella/CMR y Billetera Google (2026-11-24).
 * Banco con guardado automatico ACTIVADO y categoria por defecto: lo que aqui queda PENDIENTE es porque la regla lo exige.
 */
class FalabellaWalletFlujoTest {
    private val bank = "cl.demo.falabella"
    private val wallet = "cl.demo.wallet"
    private val owner = "u1:h1"
    private val uid = "11111111-1111-4111-8111-111111111111"
    private val hid = "22222222-2222-4222-8222-222222222222"
    private val cat = "33333333-3333-4333-8333-333333333333"
    /** 2026-11-23 15:00 en Santiago (UTC-3). */
    private var now = 1_795_456_800_000L
    private val repo = EncryptedDraftRepository(MemoryStorage(), JvmAesCipher()) { now }
    private val cfg = object : AutoConfig {
        override fun bankOfPackage(packageName: String) = when (packageName) {
            bank -> "banco-falabella"; wallet -> BankPresets.WALLET_ID; else -> null
        }
        override fun autoEnabled(bank: String) = true
        override fun maxClp() = 50_000L
    }
    private val profile = AutoProfile(owner, uid, hid, uid, true, mapOf(MerchantKey.of("Copec Las Condes") to cat), defaultCategoryId = cat)
    private val notifier = RecordingNotifier()
    private fun mem() = object : TextStore { var v: String? = null; override fun read() = v; override fun write(value: String?) { v = value } }
    private val diag = DiagnosticsLog(mem()) { now }
    private val p = CaptureProcessor(
        { setOf(bank, wallet) }, repo, notifier, RecordingHealth(), { now }, { java.util.UUID.randomUUID().toString() },
        ownerProvider = { owner }, requireOwner = true, auto = cfg, profile = { profile },
        diag = diag, ledger = NoticeLedger(mem()), purchases = PurchaseMemory(mem()),
    )
    private var keys = 0
    private fun send(pkg: String, title: String?, text: String, key: String = "0|$pkg|${keys++}|null|1", whenMillis: Long = now) =
        p.process(IncomingNotice(pkg, title, text, now, key = key, whenMillis = whenMillis))
    private fun reasons() = diag.list().map { it.reason }
    private fun seconds(s: Int) { now += s * 1000L }

    @Test
    fun `compra en dolares de Falabella o de Wallet no crea borrador y el diagnostico dice moneda extranjera`() {
        assertEquals(Outcome.NOT_A_MOVEMENT, send(bank, null, "Compraste USD 9,99 en NETFLIX.COM Con tu CMR Mastercard Terminada en 5766"))
        assertEquals(Outcome.NOT_A_MOVEMENT, send(wallet, "Netflix", "USD 9.99 · Visa ••1234"))
        assertTrue(repo.list().isEmpty())
        assertEquals(listOf(DiagReason.FOREIGN_CURRENCY, DiagReason.FOREIGN_CURRENCY), reasons())
    }

    @Test
    fun `compra clara de Falabella con debito se guarda sola con su medio`() {
        assertEquals(Outcome.STORED, send(bank, null, "Compraste \$12.990 en COPEC LAS CONDES SANTIAGO CL Con tu Debito Banco Falabella"))
        val d = repo.list().single()
        assertEquals(DraftStatus.CONFIRMED, d.status); assertEquals("Copec Las Condes", d.candidate.merchant)
        assertEquals(12_990L, d.candidate.amountClp); assertEquals(PaymentMedium.DEBIT, d.candidate.medium)
    }

    @Test
    fun `Falabella y luego Wallet con la misma compra dan un solo borrador`() {
        assertEquals(Outcome.STORED, send(bank, null, "Compraste \$12.990 en COPEC LAS CONDES SANTIAGO CL Con tu Debito Banco Falabella"))
        seconds(20)
        assertEquals(Outcome.DUPLICATE, send(wallet, null, "Pagaste \$12.990 en COPEC con Visa •••• 1234"))
        assertEquals(1, repo.list().size); assertEquals(bank, repo.list().single().sourcePackage)
    }

    @Test
    fun `Wallet y luego Falabella con la misma compra dan un solo borrador`() {
        assertEquals(Outcome.STORED, send(wallet, "COPEC LAS CONDES", "CLP 12,990 · Visa ••1234"))
        seconds(30)
        assertEquals(Outcome.DUPLICATE, send(bank, null, "Compraste \$12.990 en COPEC LAS CONDES SANTIAGO CL Con tu Debito Banco Falabella"))
        assertEquals(1, repo.list().size); assertEquals(wallet, repo.list().single().sourcePackage)
    }

    @Test
    fun `el mismo aviso de Falabella repetido (otra clave, a 30 s) no duplica, y reenviado con su clave tampoco`() {
        val t = "Compraste \$6.778 en Ganaderia Rio Bueno S.a Santiago Chl Con tu Debito Banco Falabella"
        assertEquals(Outcome.STORED, send(bank, null, t, key = "k1", whenMillis = 1L))
        seconds(30)
        assertEquals(Outcome.DUPLICATE, send(bank, null, t))
        seconds(600)
        assertEquals(Outcome.DUPLICATE, send(bank, null, t, key = "k1", whenMillis = 1L)) // NoticeLedger: misma identidad, sin ventana
        assertEquals(1, repo.list().size)
    }

    @Test
    fun `aviso de Falabella con fecha de hace dias queda pendiente`() {
        assertEquals(Outcome.STORED, send(bank, null, "Compraste \$5.000 en Copec Las Condes el 10/11/2026 a las 14:35 Con tu Debito Banco Falabella"))
        val d = repo.list().single()
        assertEquals(DraftStatus.PENDING, d.status); assertTrue(d.staleDate)
        assertTrue(DiagReason.STALE_DATE in reasons())
    }

    @Test
    fun `compra en cuotas - con o sin valor de cuota se registra el total y queda pendiente (decision del dueno 2026-11-24)`() {
        assertEquals(Outcome.STORED, send(bank, null, "Compraste \$30.000 en Copec Las Condes en 3 cuotas de \$10.000 Con tu CMR Mastercard"))
        val a = repo.list().single()
        assertEquals(30_000L, a.candidate.amountClp); assertNull(a.candidate.installment)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, 10_000L), a.candidate.installmentPlan)
        assertEquals(PaymentMedium.CREDIT, a.candidate.medium); assertEquals(DraftStatus.PENDING, a.status)
        seconds(300)
        assertEquals(Outcome.STORED, send(bank, null, "Compraste \$45.000 en Tienda Demo en 3 cuotas Con tu CMR Mastercard"))
        val b = repo.list().first { it.candidate.amountClp == 45_000L }
        assertEquals(DraftStatus.PENDING, b.status); assertFalse(b.ambiguousAmount)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, null), b.candidate.installmentPlan)
    }

    @Test
    fun `anulacion, devolucion y pago recibido de la CMR nunca se guardan solos ni como gasto`() {
        assertEquals(Outcome.STORED, send(bank, null, "Se anuló tu compra de \$12.990 en Copec Las Condes"))
        seconds(300)
        assertEquals(Outcome.STORED, send(bank, null, "Recibimos tu pago de \$34.400 a tu CMR"))
        val byAmount = repo.list().associateBy { it.candidate.amountClp }
        assertEquals(Kind.INCOME, byAmount.getValue(12_990L).candidate.kind)
        assertEquals(Kind.DEBT_PAYMENT, byAmount.getValue(34_400L).candidate.kind)
        assertTrue(repo.list().all { it.status == DraftStatus.PENDING && !it.autoSaved })
    }

    @Test
    fun `claves y promociones no crean nada`() {
        assertEquals(Outcome.NOT_A_MOVEMENT, send(bank, null, "Tu clave dinámica es 123456"))
        assertEquals(Outcome.NOT_A_MOVEMENT, send(bank, null, "Aprovecha 20% en compras sobre \$50.000 con tu CMR"))
        assertEquals(Outcome.NOT_A_MOVEMENT, send(wallet, null, "Tu código de verificación es 123456"))
        assertTrue(repo.list().isEmpty())
    }

    @Test
    fun `Billetera de Google se detecta por su paquete publico aunque el nombre visible sea otro`() {
        for (label in listOf("Google Pay", "Wallet", "Billetera")) {
            val r = BankDetector.detect(listOf(InstalledApp("com.google.android.apps.walletnfcrel", label)), emptyMap(), "cl.dinovance.contigo")
            val w = r.single { it.bankId == BankPresets.WALLET_ID }
            assertEquals(label, DetectStatus.installed, w.status); assertEquals("com.google.android.apps.walletnfcrel", w.packageName)
        }
        // Otra app llamada «Google Pay» (otro paquete) sigue sin asociarse, y Servicios de Google Play jamas se vigila sola
        for (app in listOf(InstalledApp("com.google.android.apps.nbu.paisa.user", "Google Pay"), InstalledApp("com.google.android.gms", "Servicios de Google Play"))) {
            val r = BankDetector.detect(listOf(app), emptyMap(), "cl.dinovance.contigo")
            assertEquals(DetectStatus.not_found, r.single { it.bankId == BankPresets.WALLET_ID }.status)
        }
        assertTrue(BankPresets.byId(BankPresets.WALLET_ID)!!.candidatePackages.isEmpty()) // el contrato con el front no cambia
    }

    @Test
    fun `la captura no escribe en el log del sistema (ni texto ni montos)`() {
        val dir = File("src/main/kotlin/cl/dinovance/contigo/capture")
        assertTrue(dir.absolutePath, dir.isDirectory)
        val offenders = dir.listFiles()!!.filter { it.extension == "kt" }.filter { f ->
            val s = f.readText()
            "android.util.Log" in s || Regex("\\bLog\\.[vdiwe]\\(").containsMatchIn(s) || "println(" in s || "printStackTrace" in s
        }
        assertEquals(emptyList<File>(), offenders)
        assertFalse(File("src/main/kotlin/cl/dinovance/contigo/capture/NotificationCaptureService.kt").readText().contains("Log."))
    }

    // ---------- Hallazgos del QA en el emulador (2026-11-24) ----------

    @Test
    fun `QA - Billetera con titulo y medio de pago al final guarda el comercio limpio por Wallet y por banco`() {
        assertEquals(Outcome.STORED, send(wallet, "Billetera de Google", "Pagaste \$8.500 en PRUEBA-EMU con Visa •••• 1234"))
        val w = repo.list().single()
        assertEquals("Prueba-Emu", w.candidate.merchant); assertEquals(8_500L, w.candidate.amountClp)
        assertEquals(DraftStatus.CONFIRMED, w.status)
        seconds(3600)
        // Mismo aviso leido como banco (fuente no reconocida como Billetera): igual de limpio.
        assertEquals(Outcome.STORED, send(bank, "Billetera de Google", "Pagaste \$9.500 en PRUEBA-EMU con Mastercard 1234"))
        assertEquals("Prueba-Emu", repo.list().first { it.candidate.amountClp == 9_500L }.candidate.merchant)
    }

    @Test
    fun `QA - Billetera en ingles toma el comercio tras at`() {
        assertEquals(Outcome.STORED, send(wallet, "Google Wallet", "Tap to pay: CLP 7,000 at PRUEBA-EMU"))
        val d = repo.list().single()
        assertEquals("Prueba-Emu", d.candidate.merchant); assertEquals(7_000L, d.candidate.amountClp)
        assertEquals(DraftStatus.CONFIRMED, d.status)
    }

    /** Decision del dueno (2026-11-24): la compra CMR en 3 cuotas de $10.000 se anota por el TOTAL y queda PENDIENTE (antes: cuota 1/3 guardada sola). */
    @Test
    fun `QA - compra CMR en 3 cuotas de 10000 queda pendiente por el total de 30000`() {
        assertEquals(Outcome.STORED, send(bank, null, "Compraste \$30.000 en PRUEBA-EMU en 3 cuotas de \$10.000 Con tu CMR Mastercard"))
        val d = repo.list().single()
        assertEquals(30_000L, d.candidate.amountClp); assertNull(d.candidate.installment)
        assertEquals(InstallmentPlan(InstallmentRole.PURCHASE, 3, 10_000L), d.candidate.installmentPlan)
        assertEquals("Prueba-Emu", d.candidate.merchant); assertFalse(d.ambiguousAmount)
        assertEquals(DraftStatus.PENDING, d.status); assertFalse(d.autoSaved)
        assertTrue(DiagReason.INSTALLMENT_PURCHASE in reasons())
    }
}
