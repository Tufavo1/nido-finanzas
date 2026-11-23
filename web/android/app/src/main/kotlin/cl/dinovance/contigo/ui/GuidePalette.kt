// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.ui

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Colores de la guía de permisos, los mismos tokens de la PWA (web/src/styles.css) para que la pantalla nativa se vea
 * de la misma app. Constantes puras para probar los contrastes WCAG en la JVM (GuidePaletteTest).
 */
data class GuidePalette(
    val background: Int,
    val surface: Int,
    val line: Int,
    val text: Int,
    val muted: Int,
    val link: Int,
    val accent: Int,
    val onAccent: Int,
    val outline: Int,
    val badge: Int,
    val onBadge: Int,
    val success: Int,
    val successBadge: Int,
    val onSuccessBadge: Int,
    val check: Int,
    val warn: Int,
    val dark: Boolean,
) {
    companion object {
        const val LOGO_BLUE = 0xFF9BB2F2.toInt()
        const val LOGO_PINK = 0xFFF2A0BC.toInt()
        const val LOGO_LENS = 0xFF8CCBD6.toInt()

        val LIGHT = GuidePalette(
            background = 0xFFFDE2E4.toInt(),
            surface = 0xFFFFF6F7.toInt(),
            line = 0xFFF0C4D3.toInt(),
            text = 0xFF3A3350.toInt(),
            muted = 0xFF5A5074.toInt(),
            link = 0xFF1F5A66.toInt(),
            accent = 0xFF8CCBD6.toInt(),
            onAccent = 0xFF3A3350.toInt(),
            outline = 0xFF8E5A73.toInt(),
            badge = 0xFF8CCBD6.toInt(),
            onBadge = 0xFF3A3350.toInt(),
            success = 0xFF2C6B4A.toInt(),
            successBadge = 0xFF2C6B4A.toInt(),
            onSuccessBadge = 0xFFFFFFFF.toInt(),
            check = 0xFF2C6B4A.toInt(),
            warn = 0xFFB83A5A.toInt(),
            dark = false,
        )

        val DARK = GuidePalette(
            background = 0xFF1D1828.toInt(),
            surface = 0xFF282238.toInt(),
            line = 0xFF433B5E.toInt(),
            text = 0xFFFDEAED.toInt(),
            muted = 0xFFB9AFD0.toInt(),
            link = 0xFFBEE1E6.toInt(),
            accent = 0xFFBEE1E6.toInt(),
            onAccent = 0xFF1D1828.toInt(),
            outline = 0xFF8C82B2.toInt(),
            badge = 0xFFBEE1E6.toInt(),
            onBadge = 0xFF1D1828.toInt(),
            success = 0xFF8FD9AE.toInt(),
            successBadge = 0xFF8FD9AE.toInt(),
            onSuccessBadge = 0xFF1D1828.toInt(),
            check = 0xFF8FD9AE.toInt(),
            warn = 0xFFFF9FB3.toInt(),
            dark = true,
        )

        /** Razón de contraste WCAG 2.x entre dos colores opacos (0xAARRGGBB). */
        fun contrast(a: Int, b: Int): Double {
            val la = luminance(a)
            val lb = luminance(b)
            return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
        }

        private fun luminance(color: Int): Double {
            fun channel(shift: Int): Double {
                val c = ((color shr shift) and 0xFF) / 255.0
                return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
            }
            return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
        }
    }
}
