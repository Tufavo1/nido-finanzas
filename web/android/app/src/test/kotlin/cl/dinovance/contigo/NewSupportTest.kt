// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.capture.RecentApps
import cl.dinovance.contigo.capture.RecentStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NewSupportTest {
    private class MemoryRecent : RecentStore {
        var saved: Map<String, Long> = emptyMap()
        var writes = 0
        override fun load() = saved
        override fun save(apps: Map<String, Long>) { saved = apps.toMap(); writes++ }
    }

    @Test
    fun `el filtro de enlaces usa la validacion del nucleo`() {
        assertTrue(DeepLinkGuard.isAcceptable("nido://gasto?monto=4500&comercio=Cafe%20Demo", 2026, 11, 21))
        listOf("nido://gasto?monto=0", "nido://gasto?monto=1e3", "nido://otro?monto=1000", "javascript:alert(1)", "nido://gasto?monto=100&monto=200")
            .forEach { assertFalse(it, DeepLinkGuard.isAcceptable(it, 2026, 11, 21)) }
    }

    @Test
    fun `apps recientes guarda solo paquete y hora, ordenadas por recientes`() {
        val store = MemoryRecent()
        val recent = RecentApps(store)
        recent.record("cl.demo.banco", 1_000)
        recent.record("cl.demo.billetera", 5_000)
        assertEquals(listOf("cl.demo.billetera" to 5_000L, "cl.demo.banco" to 1_000L), recent.list())
    }

    @Test
    fun `no escribe a disco mas de una vez por minuto por app y respeta el tope`() {
        val store = MemoryRecent()
        val recent = RecentApps(store, max = 3)
        recent.record("a.b", 0); recent.record("a.b", 30_000)
        assertEquals(1, store.writes)
        recent.record("a.b", 61_000)
        assertEquals(2, store.writes)
        listOf("c.d", "e.f", "g.h").forEachIndexed { i, p -> recent.record(p, 100_000L + i) }
        assertEquals(3, recent.list().size)
        assertFalse(recent.list().any { it.first == "a.b" })
    }

    @Test
    fun `borrar todo vacia la lista`() {
        val recent = RecentApps(MemoryRecent())
        recent.record("a.b", 0)
        recent.clear()
        assertTrue(recent.list().isEmpty())
    }
}
