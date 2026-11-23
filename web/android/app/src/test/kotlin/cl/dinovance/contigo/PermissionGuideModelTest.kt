// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.ui.GuideInput
import cl.dinovance.contigo.ui.PermissionGuideModel
import cl.dinovance.contigo.ui.RestrictedHint
import cl.dinovance.contigo.ui.StepDisplay
import cl.dinovance.contigo.ui.StepId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PermissionGuideModelTest {
    private fun model(listener: Boolean, battery: Boolean, hint: RestrictedHint, opened: Boolean = false) =
        PermissionGuideModel.from(GuideInput(listenerAllowed = listener, batteryOk = battery, restricted = hint, restrictedOpened = opened))

    @Test
    fun `todas las combinaciones cumplen las reglas generales`() {
        for (listener in listOf(false, true)) for (battery in listOf(false, true)) for (hint in RestrictedHint.entries) for (opened in listOf(false, true)) {
            val m = model(listener, battery, hint, opened)
            val case = "listener=$listener battery=$battery hint=$hint opened=$opened"
            // El orden es siempre el mismo: ajustes restringidos, acceso, bateria.
            assertEquals(case, listOf(StepId.RESTRICTED, StepId.LISTENER, StepId.BATTERY), m.steps.map { it.id })
            // Listo solo se enfatiza con el acceso concedido; si falta, se avisa.
            assertEquals(case, listener, m.doneEmphasized)
            assertEquals(case, !listener, m.showMissingHint)
            // Hick: como mucho una accion primaria en pantalla (un paso o «Listo").
            val primaries = m.steps.count { it.primary } + if (m.doneEmphasized) 1 else 0
            assertEquals(case, 1, primaries)
            // Los numeros son 1..n solo para las tarjetas visibles.
            assertEquals(case, (1..m.steps.count { it.display == StepDisplay.CARD }).toList(), m.steps.filter { it.display == StepDisplay.CARD }.map { it.number })
            assertTrue(case, m.steps.filter { it.display != StepDisplay.CARD }.all { it.number == null })
            // El acceso y la bateria reflejan lo que comprueba el telefono.
            assertEquals(case, listener, m.step(StepId.LISTENER).done)
            assertEquals(case, battery, m.step(StepId.BATTERY).done)
            assertTrue(case, m.step(StepId.BATTERY).optional)
            assertFalse(case, m.step(StepId.BATTERY).primary)
            // Un paso hecho nunca es el actual.
            m.current?.let { assertFalse(case, m.step(it).done) }
        }
    }

    @Test
    fun `instalada desde archivo y sin acceso el paso 1 es la ficha de la app`() {
        val m = model(listener = false, battery = false, hint = RestrictedHint.LIKELY)
        assertEquals(StepDisplay.CARD, m.step(StepId.RESTRICTED).display)
        assertEquals(1, m.step(StepId.RESTRICTED).number)
        assertEquals(2, m.step(StepId.LISTENER).number)
        assertEquals(3, m.step(StepId.BATTERY).number)
        assertEquals(StepId.RESTRICTED, m.current)
        assertTrue(m.step(StepId.RESTRICTED).primary)
        assertFalse(m.step(StepId.LISTENER).primary)
    }

    @Test
    fun `tras abrir la ficha el foco pasa a activar el acceso`() {
        val m = model(listener = false, battery = false, hint = RestrictedHint.LIKELY, opened = true)
        assertEquals(StepId.LISTENER, m.current)
        assertTrue(m.step(StepId.LISTENER).primary)
        assertFalse(m.step(StepId.RESTRICTED).primary)
        assertFalse(m.step(StepId.RESTRICTED).done) // no se puede comprobar: no se marca como hecho
    }

    @Test
    fun `si no se sabe como se instalo el paso de ajustes restringidos va colapsado`() {
        val m = model(listener = false, battery = true, hint = RestrictedHint.UNKNOWN)
        assertEquals(StepDisplay.COLLAPSED, m.step(StepId.RESTRICTED).display)
        assertNull(m.step(StepId.RESTRICTED).number)
        assertEquals(1, m.step(StepId.LISTENER).number)
        assertEquals(StepId.LISTENER, m.current)
    }

    @Test
    fun `desde Play o Android antiguo no se muestra el paso de ajustes restringidos`() {
        val m = model(listener = false, battery = false, hint = RestrictedHint.NOT_NEEDED)
        assertEquals(StepDisplay.HIDDEN, m.step(StepId.RESTRICTED).display)
        assertEquals(1, m.step(StepId.LISTENER).number)
        assertEquals(2, m.step(StepId.BATTERY).number)
        assertEquals(StepId.LISTENER, m.current)
    }

    @Test
    fun `con el acceso concedido el paso 1 que se mostro queda listo`() {
        val m = model(listener = true, battery = false, hint = RestrictedHint.LIKELY)
        assertEquals(StepDisplay.CARD, m.step(StepId.RESTRICTED).display)
        assertTrue(m.step(StepId.RESTRICTED).done)
        assertTrue(m.step(StepId.LISTENER).done)
    }

    @Test
    fun `con el acceso concedido el paso colapsado desaparece`() {
        val m = model(listener = true, battery = false, hint = RestrictedHint.UNKNOWN)
        assertEquals(StepDisplay.HIDDEN, m.step(StepId.RESTRICTED).display)
        assertEquals(1, m.step(StepId.LISTENER).number)
    }

    @Test
    fun `con el acceso concedido y bateria pendiente el foco va a bateria pero Listo es la accion primaria`() {
        val m = model(listener = true, battery = false, hint = RestrictedHint.NOT_NEEDED)
        assertEquals(StepId.BATTERY, m.current)
        assertTrue(m.doneEmphasized)
        assertFalse(m.step(StepId.BATTERY).primary)
    }

    @Test
    fun `con todo listo no queda paso actual y el foco va a Listo`() {
        val m = model(listener = true, battery = true, hint = RestrictedHint.LIKELY)
        assertNull(m.current)
        assertTrue(m.doneEmphasized)
        assertFalse(m.showMissingHint)
        assertTrue(m.steps.filter { it.display == StepDisplay.CARD }.all { it.done })
    }

    @Test
    fun `sin acceso y bateria ya sin restricciones el paso actual sigue siendo el acceso`() {
        val m = model(listener = false, battery = true, hint = RestrictedHint.NOT_NEEDED)
        assertEquals(StepId.LISTENER, m.current)
        assertTrue(m.step(StepId.BATTERY).done)
        assertFalse(m.doneEmphasized)
        assertTrue(m.showMissingHint)
    }

    @Test
    fun `la pista de ajustes restringidos sale de la version y el origen de instalacion`() {
        assertEquals(RestrictedHint.NOT_NEEDED, RestrictedHint.of(sdk = 32, installer = null, packageSource = null))
        assertEquals(RestrictedHint.NOT_NEEDED, RestrictedHint.of(sdk = 34, installer = "com.android.vending", packageSource = 0))
        assertEquals(RestrictedHint.NOT_NEEDED, RestrictedHint.of(sdk = 34, installer = "otra.tienda", packageSource = RestrictedHint.SOURCE_STORE))
        assertEquals(RestrictedHint.LIKELY, RestrictedHint.of(sdk = 33, installer = "com.google.android.packageinstaller", packageSource = RestrictedHint.SOURCE_LOCAL_FILE))
        assertEquals(RestrictedHint.LIKELY, RestrictedHint.of(sdk = 35, installer = null, packageSource = RestrictedHint.SOURCE_DOWNLOADED_FILE))
        assertEquals(RestrictedHint.UNKNOWN, RestrictedHint.of(sdk = 34, installer = null, packageSource = 0))
        assertEquals(RestrictedHint.UNKNOWN, RestrictedHint.of(sdk = 34, installer = "x", packageSource = null))
    }
}
