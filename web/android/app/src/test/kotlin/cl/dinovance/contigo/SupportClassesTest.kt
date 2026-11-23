// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.nido.parser.ClpAmount
import cl.dinovance.contigo.diagnostics.CircularCrashLog
import cl.dinovance.contigo.diagnostics.CrashReport
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class SupportClassesTest {
    @Test
    fun `ClpAmount pone puntos de miles`() {
        assertEquals("$0", ClpAmount.format(0))
        assertEquals("$999", ClpAmount.format(999))
        assertEquals("$12.990", ClpAmount.format(12_990))
        assertEquals("$1.250.000", ClpAmount.format(1_250_000))
    }

    @Test
    fun `el reporte de cierre no guarda el mensaje de la excepcion`() {
        val error = IllegalStateException("Compra de $12.990 en ALMACEN DEMO persona@correo.cl")
        val json = CrashReport.from(error, 1L, "1.0").toJson().toString()
        assertTrue(json.contains("IllegalStateException"))
        listOf("12.990", "ALMACEN", "persona@correo.cl", "Compra").forEach { assertFalse(it, json.contains(it)) }
    }

    @Test
    fun `el registro circular conserva solo los ultimos N`() {
        val file = File.createTempFile("crash", ".json").also { it.deleteOnExit() }
        val log = CircularCrashLog(file, capacity = 3)
        (1..5).forEach { log.append(CrashReport(it.toLong(), "1.0", "E$it", listOf("a.B.c(B.kt:$it)"))) }
        assertEquals(listOf(3L, 4L, 5L), log.read().map { it.atMillis })
        log.clear()
        assertTrue(log.read().isEmpty())
    }

    @Test
    fun `un registro dañado se ignora`() {
        val file = File.createTempFile("crash", ".json").also { it.deleteOnExit() }
        file.writeText("{no es json")
        assertTrue(CircularCrashLog(file).read().isEmpty())
    }
}
