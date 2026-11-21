// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.ui

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import cl.dinovance.contigo.R

/**
 * Pantalla guiada para dar el permiso de acceso a notificaciones (DEC-05). En Android 13 o más, una app instalada
 * fuera de Play Store necesita primero «Permitir ajustes restringidos» en la ficha de la app; sin ese paso el
 * interruptor sale gris. Los pasos van en orden y cada botón abre el ajuste correcto.
 */
class PermissionGuideActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = getString(R.string.guide_title)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(PADDING_DP), dp(PADDING_DP), dp(PADDING_DP), dp(PADDING_DP))
        }
        column.addView(text(R.string.guide_title, TITLE_SP, bold = true))
        column.addView(text(R.string.guide_intro, BODY_SP))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            column.addView(text(R.string.guide_step_restricted, BODY_SP))
            column.addView(button(R.string.guide_open_app_info) { startActivity(appDetails()) })
        }
        column.addView(text(R.string.guide_step_listener, BODY_SP))
        column.addView(button(R.string.guide_open_listener) { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) })
        column.addView(text(R.string.guide_step_battery, BODY_SP))
        column.addView(button(R.string.guide_open_battery) { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) })
        column.addView(button(R.string.guide_close) { finish() })
        setContentView(ScrollView(this).apply { addView(column) })
    }

    private fun appDetails() = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))

    private fun text(res: Int, sp: Float, bold: Boolean = false) = TextView(this).apply {
        setText(res)
        textSize = sp
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(SPACING_DP), 0, dp(SPACING_DP))
    }

    private fun button(res: Int, onClick: () -> Unit) = Button(this).apply {
        setText(res)
        minHeight = dp(MIN_TOUCH_DP)
        gravity = Gravity.CENTER
        setOnClickListener { _: View -> onClick() }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val PADDING_DP = 20
        const val SPACING_DP = 8
        const val MIN_TOUCH_DP = 48
        const val TITLE_SP = 22f
        const val BODY_SP = 16f
    }
}
