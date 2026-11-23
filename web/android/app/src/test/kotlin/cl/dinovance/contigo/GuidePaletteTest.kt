// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.ui.GuidePalette
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GuidePaletteTest {
    private fun assertRatio(name: String, fg: Int, bg: Int, min: Double) {
        val ratio = GuidePalette.contrast(fg, bg)
        assertTrue("$name: ${"%.2f".format(ratio)} < $min", ratio >= min)
    }

    @Test
    fun `el calculo de contraste coincide con WCAG`() {
        assertEquals(21.0, GuidePalette.contrast(0xFF000000.toInt(), 0xFFFFFFFF.toInt()), 0.01)
        assertEquals(1.0, GuidePalette.contrast(0xFF777777.toInt(), 0xFF777777.toInt()), 0.001)
        // Valor de referencia conocido: #767676 sobre blanco = 4,54:1.
        assertEquals(4.54, GuidePalette.contrast(0xFF767676.toInt(), 0xFFFFFFFF.toInt()), 0.01)
    }

    @Test
    fun `claro y oscuro cumplen AA en texto y 3 a 1 en bordes e iconos`() {
        for (p in listOf(GuidePalette.LIGHT, GuidePalette.DARK)) {
            val mode = if (p === GuidePalette.LIGHT) "claro" else "oscuro"
            // Texto normal (16 sp): 4,5:1
            assertRatio("$mode texto/fondo", p.text, p.background, 4.5)
            assertRatio("$mode texto/tarjeta", p.text, p.surface, 4.5)
            assertRatio("$mode secundario/fondo", p.muted, p.background, 4.5)
            assertRatio("$mode secundario/tarjeta", p.muted, p.surface, 4.5)
            assertRatio("$mode enlace/fondo", p.link, p.background, 4.5)
            assertRatio("$mode enlace/tarjeta", p.link, p.surface, 4.5)
            assertRatio("$mode boton primario", p.onAccent, p.accent, 4.5)
            assertRatio("$mode listo/tarjeta", p.success, p.surface, 4.5)
            assertRatio("$mode aviso/fondo", p.warn, p.background, 4.5)
            assertRatio("$mode insignia", p.onBadge, p.badge, 4.5)
            assertRatio("$mode insignia lista", p.onSuccessBadge, p.successBadge, 4.5)
            // Componentes no textuales (WCAG 1.4.11): 3:1
            assertRatio("$mode borde boton secundario", p.outline, p.surface, 3.0)
            assertRatio("$mode borde boton secundario sobre fondo", p.outline, p.background, 3.0)
            assertRatio("$mode check de confianza", p.check, p.background, 3.0)
        }
    }

    @Test
    fun `el fondo claro es el rosa de la marca y el logo usa los colores de la marca`() {
        assertEquals(0xFFFDE2E4.toInt(), GuidePalette.LIGHT.background)
        assertEquals(0xFF9BB2F2.toInt(), GuidePalette.LOGO_BLUE)
        assertEquals(0xFFF2A0BC.toInt(), GuidePalette.LOGO_PINK)
        assertEquals(0xFF8CCBD6.toInt(), GuidePalette.LOGO_LENS)
    }
}
