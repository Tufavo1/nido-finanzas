// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.BankDetector
import cl.dinovance.contigo.capture.BankMatcher
import cl.dinovance.contigo.capture.BankPresets
import cl.dinovance.contigo.capture.BankSetup
import cl.dinovance.contigo.capture.BankStore
import cl.dinovance.contigo.capture.DetectStatus
import cl.dinovance.contigo.capture.InstalledApp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Deteccion de bancos por NOMBRE VISIBLE. Los nombres son los que describe el dueno; no hay paquetes inventados. */
class BankDetectionTest {
    @Test
    fun `los nombres de cada banco, sin tildes ni mayusculas, se reconocen`() {
        val ok = mapOf(
            "Santander" to "santander", "SANTANDER" to "santander", "Santander Chile" to "santander", "Mi Santander" to "santander",
            "BancoEstado" to "banco-estado", "Banco Estado" to "banco-estado", "banco  estado app" to "banco-estado",
            "CuentaRUT" to "banco-estado", "Cuenta RUT" to "banco-estado", "BancoEstado Chile" to "banco-estado",
            "Banco Falabella" to "banco-falabella", "BANCO FALABELLA" to "banco-falabella", "Banco Falabella Chile" to "banco-falabella",
            "CMR Falabella" to "banco-falabella", "CMR" to "banco-falabella", "Mi CMR" to "banco-falabella", "CMR Falabella Chile" to "banco-falabella",
            "Banco de Chile" to "banco-chile", "Banco Chile" to "banco-chile", "Mi Banco" to "banco-chile", "Mi Pasaporte" to "banco-chile", "Mi Pasaporte Banco de Chile" to "banco-chile",
            "  Banco de Chilé  " to "banco-chile",
        )
        ok.forEach { (label, bank) -> assertEquals(label, bank, BankMatcher.bankOf(label)) }
    }

    @Test
    fun `falsos positivos conocidos no se asocian`() {
        listOf(
            "Santander Trade", "Santander Peru", "Santander Mexico", "Santander Brasil", "Santander Consumer", "Santander Empresas", "Santander Select",
            "Banco Falabella Peru", "Banco Falabella Colombia", "Falabella", "CMR Puntos", "CMR Peru", "CMR Colombia", "Banco de Chile Empresas",
            "BancoEstado Empresas", "Banco Estado Peru", "Banco de Chile Peru", "Banco Chile Mi Pasaporte Pro", "Banco", "Estado", "Chile", "Mi", "",
            "Santanderina", "Banco Santander Argentina", "Mibanco Peru", "Banco de Chile Mexico",
        ).forEach { assertNull(it, BankMatcher.bankOf(it)) }
    }

    private fun app(pkg: String, label: String) = InstalledApp(pkg, label)

    @Test
    fun `detecta las apps instaladas, ignora la propia y marca not_found a los bancos sin app`() {
        val apps = listOf(app("x.santander", "Santander"), app("x.cr", "CuentaRUT"), app("x.be", "BancoEstado"), app("x.otro", "Linterna"), app("cl.dinovance.contigo", "Santander"))
        val r = BankDetector.detect(apps, emptyMap(), "cl.dinovance.contigo")
        assertEquals(listOf("x.santander"), r.filter { it.bankId == "santander" && it.status == DetectStatus.installed }.map { it.packageName })
        assertEquals(setOf("x.cr", "x.be"), r.filter { it.bankId == "banco-estado" }.map { it.packageName }.toSet())
        assertEquals(DetectStatus.not_found, r.single { it.bankId == "banco-falabella" }.status)
        assertNull(r.single { it.bankId == "banco-falabella" }.packageName)
        assertEquals(DetectStatus.not_found, r.single { it.bankId == "banco-chile" }.status)
    }

    @Test
    fun `un paquete aprendido a mano o por aviso sale como seen aunque su nombre no coincida`() {
        val r = BankDetector.detect(listOf(app("x.raro", "Mi Plata")), mapOf("banco-chile" to setOf("x.raro")), "cl.dinovance.contigo")
        val e = r.single { it.bankId == "banco-chile" }
        assertEquals(DetectStatus.seen, e.status); assertEquals("x.raro", e.packageName); assertEquals("Mi Plata", e.appLabel)
    }

    @Test
    fun `si el paquete aprendido tambien coincide por nombre figura una sola vez como installed`() {
        val r = BankDetector.detect(listOf(app("x.s", "Santander")), mapOf("santander" to setOf("x.s")), "cl.dinovance.contigo")
        assertEquals(1, r.count { it.bankId == "santander" }); assertEquals(DetectStatus.installed, r.single { it.bankId == "santander" }.status)
    }

    @Test
    fun `un paquete no puede quedar asociado a dos bancos`() {
        val r = BankDetector.detect(listOf(app("x.m", "Mi Banco")), mapOf("santander" to setOf("x.m")), "cl.dinovance.contigo")
        assertEquals(1, r.count { it.packageName == "x.m" })
    }

    private class Store : BankStore {
        val det = mutableMapOf<String, Set<String>>(); val man = mutableMapOf<String, String>(); val auto = mutableMapOf<String, Boolean>()
        override fun detectedPackages(bank: String) = det[bank].orEmpty()
        override fun manualPackage(bank: String) = man[bank]
        override fun autoSave(bank: String) = auto[bank] == true
        override fun setAutoSave(bank: String, enabled: Boolean) { auto[bank] = enabled }
    }

    @Test
    fun `activar todo prende solo los bancos con app y lo informa, sin apps no hace nada`() {
        val s = Store()
        val none = BankSetup(s).setAll(true)
        // Migrado (2026-11-24, decision del dueno): solo se ofrecen y encienden las fuentes VERIFICADAS (Banco Falabella y Billetera
        // Google); antes eran las 5. Santander/Banco Estado/Banco de Chile: ver FuentesVerificadasTest.
        assertTrue(none.enabled.isEmpty()); assertEquals(2, none.withoutApp.size); assertTrue(s.auto.values.none { it })
        s.det["banco-falabella"] = setOf("x.f"); s.man[BankPresets.WALLET_ID] = "x.w"; s.det["santander"] = setOf("x.s")
        val r = BankSetup(s).setAll(true)
        assertEquals(setOf("banco-falabella", "billetera-google"), r.enabled.toSet()); assertTrue(r.withoutApp.isEmpty())
        assertTrue(s.auto["banco-falabella"] == true && s.auto[BankPresets.WALLET_ID] == true && s.auto["santander"] != true)
        val off = BankSetup(s).setAll(false)
        assertTrue(s.auto.values.none { it }); assertEquals(setOf("banco-falabella", "billetera-google"), off.disabled.toSet())
    }
}
