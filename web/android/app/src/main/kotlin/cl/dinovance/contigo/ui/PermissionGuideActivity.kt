// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import cl.dinovance.contigo.R

/**
 * Pantalla guiada para dar el permiso de acceso a notificaciones (DEC-05). En Android 13 o más, una app instalada
 * desde un archivo necesita primero «Permitir ajustes restringidos» en la ficha de la app; sin ese paso el interruptor
 * sale gris. Los estados (acceso concedido, batería sin restricciones, origen de instalación) los comprueba el teléfono
 * en cada `onResume`; qué paso toca y qué botón es el principal lo decide [PermissionGuideModel] (puro, probado en JVM).
 */
class PermissionGuideActivity : Activity() {
    private lateinit var palette: GuidePalette
    private lateinit var scroll: ScrollView
    private lateinit var howToggle: Button
    private lateinit var howCard: View
    private lateinit var restrictedLink: Button
    private lateinit var doneButton: Button
    private lateinit var missingHint: TextView
    private val cards = mutableMapOf<StepId, StepCard>()

    private var restrictedOpened = false
    private var restrictedRequested = false
    private var howOpen = false
    private var lastCurrent: Any? = UNSET

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        restrictedOpened = savedInstanceState?.getBoolean(KEY_OPENED) ?: false
        restrictedRequested = savedInstanceState?.getBoolean(KEY_REQUESTED) ?: false
        howOpen = savedInstanceState?.getBoolean(KEY_HOW) ?: false
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        palette = if (night) GuidePalette.DARK else GuidePalette.LIGHT
        title = getString(R.string.guide_title)
        setContentView(buildScreen())
        setupWindow()
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean(KEY_OPENED, restrictedOpened)
        outState.putBoolean(KEY_REQUESTED, restrictedRequested)
        outState.putBoolean(KEY_HOW, howOpen)
    }

    // ---- Estado que comprueba el teléfono (Tesler) ----

    private fun currentInput(): GuideInput {
        val hint = restrictedHint()
        return GuideInput(
            listenerAllowed = NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName),
            batteryOk = (getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName),
            // Si la persona dice que Android no la deja, el paso pasa a ser una tarjeta normal.
            restricted = if (restrictedRequested && hint == RestrictedHint.UNKNOWN) RestrictedHint.LIKELY else hint,
            restrictedOpened = restrictedOpened,
        )
    }

    private fun restrictedHint(): RestrictedHint {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return RestrictedHint.NOT_NEEDED
        val info = try {
            packageManager.getInstallSourceInfo(packageName)
        } catch (e: PackageManager.NameNotFoundException) {
            return RestrictedHint.of(Build.VERSION.SDK_INT, installer = null, packageSource = null)
        }
        return RestrictedHint.of(Build.VERSION.SDK_INT, info.installingPackageName, info.packageSource)
    }

    // ---- Construcción ----

    private fun buildScreen(): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(PADDING_DP), dp(PADDING_DP), dp(PADDING_DP), dp(PADDING_DP))
        }
        column.addView(LogoView(this).apply {
            contentDescription = getString(R.string.guide_logo_desc)
            layoutParams = LinearLayout.LayoutParams(dp(LOGO_W_DP), dp(LOGO_H_DP)).apply { gravity = Gravity.CENTER_HORIZONTAL }
        })
        column.addView(text(getString(R.string.guide_title), TITLE_SP, palette.text, bold = true).apply {
            gravity = Gravity.CENTER
            ViewCompat.setAccessibilityHeading(this, true)
            layoutParams = lp(top = SPACE_MD_DP)
        })
        val trust = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; layoutParams = lp(top = SPACE_LG_DP) }
        listOf(R.string.guide_trust_1, R.string.guide_trust_2, R.string.guide_trust_3).forEachIndexed { i, res ->
            trust.addView(trustRow(getString(res)).apply { layoutParams = lp(top = if (i == 0) 0 else SPACE_SM_DP) })
        }
        column.addView(trust)

        howToggle = linkButton(getString(R.string.guide_how)) { howOpen = !howOpen; renderHow() }.apply {
            layoutParams = lp(top = SPACE_SM_DP).apply { width = ViewGroup.LayoutParams.WRAP_CONTENT }
        }
        column.addView(howToggle)
        howCard = card(strokeColor = palette.line).apply {
            listOf(R.string.guide_how_1, R.string.guide_how_2, R.string.guide_how_3, R.string.guide_how_4).forEachIndexed { i, res ->
                addView(text(getString(res), BODY_SP, palette.text).apply { layoutParams = lp(top = if (i == 0) 0 else SPACE_XS_DP) })
            }
            addView(text(getString(R.string.guide_how_off), BODY_SP, palette.link, bold = true).apply { layoutParams = lp(top = SPACE_SM_DP) })
        }
        column.addView(howCard, lp(top = SPACE_XS_DP))

        restrictedLink = linkButton(getString(R.string.guide_restricted_link)) {
            restrictedRequested = true
            render()
            focus(cards.getValue(StepId.RESTRICTED).titleView)
        }
        cards[StepId.RESTRICTED] = StepCard(
            id = StepId.RESTRICTED,
            title = getString(R.string.guide_restricted_title),
            body = getString(R.string.guide_restricted_line1) + "\n" + getString(R.string.guide_restricted_line2),
            doneBody = null,
            action = getString(R.string.guide_open_app_info),
        ) {
            restrictedOpened = true
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
        }
        cards[StepId.LISTENER] = StepCard(
            id = StepId.LISTENER,
            title = getString(R.string.guide_listener_title),
            body = getString(R.string.guide_listener_body),
            doneBody = getString(R.string.guide_listener_done),
            action = getString(R.string.guide_open_listener),
            extra = restrictedLink,
        ) { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
        cards[StepId.BATTERY] = StepCard(
            id = StepId.BATTERY,
            title = getString(R.string.guide_battery_title),
            body = getString(R.string.guide_battery_body),
            doneBody = getString(R.string.guide_battery_done),
            action = getString(R.string.guide_open_battery),
        ) { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        StepId.entries.forEach { column.addView(cards.getValue(it).root, lp(top = SPACE_CARDS_DP)) }

        scroll = ScrollView(this).apply {
            isFillViewport = true
            addView(column)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        }

        // Zona del pulgar: «Listo» fijo abajo, ancho completo (Fitts, Jakob).
        missingHint = text(getString(R.string.guide_missing), BODY_SP, palette.warn).apply {
            gravity = Gravity.CENTER
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        doneButton = actionButton(getString(R.string.guide_close)) { finish() }
        val bottom = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(palette.background)
            setPadding(dp(PADDING_DP), dp(SPACE_SM_DP), dp(PADDING_DP), dp(SPACE_LG_DP))
            addView(missingHint, lp(bottom = SPACE_SM_DP))
            addView(doneButton, lp())
        }
        val divider = View(this).apply { setBackgroundColor(palette.line) }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(palette.background)
            addView(scroll)
            addView(divider, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)))
            addView(bottom)
            // Orden de foco: contenido y luego «Listo».
            ViewCompat.setOnApplyWindowInsetsListener(this) { v, insets ->
                val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                WindowInsetsCompat.CONSUMED
            }
        }
    }

    private fun setupWindow() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            @Suppress("DEPRECATION")
            window.statusBarColor = Color.TRANSPARENT
            @Suppress("DEPRECATION")
            window.navigationBarColor = palette.background
        }
        window.decorView.setBackgroundColor(palette.background)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !palette.dark
            isAppearanceLightNavigationBars = !palette.dark
        }
    }

    // ---- Pintar el estado ----

    private fun render() {
        val model = PermissionGuideModel.from(currentInput())
        val total = model.steps.count { it.display == StepDisplay.CARD }
        model.steps.forEach { cards.getValue(it.id).bind(it, total, it.id == model.current) }
        restrictedLink.visibility = if (model.step(StepId.RESTRICTED).display == StepDisplay.COLLAPSED) View.VISIBLE else View.GONE
        missingHint.visibility = if (model.showMissingHint) View.VISIBLE else View.GONE
        styleButton(doneButton, primary = model.doneEmphasized)
        renderHow()
        // Al volver de Ajustes, el foco pasa solo al siguiente paso (o a «Listo»).
        if (lastCurrent != UNSET && lastCurrent != model.current) {
            focus(model.current?.let { cards.getValue(it).titleView } ?: doneButton)
        }
        lastCurrent = model.current
    }

    private fun renderHow() {
        howCard.visibility = if (howOpen) View.VISIBLE else View.GONE
        howToggle.text = getString(R.string.guide_how) + if (howOpen) "  ▴" else "  ▾"
        howToggle.contentDescription = getString(R.string.guide_how)
        ViewCompat.setStateDescription(howToggle, getString(if (howOpen) R.string.guide_expanded else R.string.guide_collapsed))
    }

    private fun focus(target: View) {
        target.post {
            offsetInScroll(target)?.let { scroll.smoothScrollTo(0, it) }
            target.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
        }
    }

    private fun offsetInScroll(target: View): Int? {
        var y = 0
        var v: View? = target
        while (v != null && v !== scroll) {
            y += v.top
            v = v.parent as? View
        }
        return if (v === scroll) (y - dp(SPACE_LG_DP)).coerceAtLeast(0) else null
    }

    /** Tarjeta de un paso: número o check, título, estado, explicación y su único botón (proximidad). */
    private inner class StepCard(
        val id: StepId,
        val title: String,
        val body: String,
        val doneBody: String?,
        action: String,
        extra: View? = null,
        onAction: () -> Unit,
    ) {
        val badge = BadgeView(this@PermissionGuideActivity)
        val titleView = text(title, STEP_TITLE_SP, palette.text, bold = true).apply { ViewCompat.setAccessibilityHeading(this, true) }
        val statusView = text("", BODY_SP, palette.muted, bold = true).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        val bodyView = text(body, BODY_SP, palette.text).apply { setLineSpacing(0f, LINE_SPACING) }
        val button = actionButton(action, onAction)
        val root: LinearLayout = card(strokeColor = palette.line).apply {
            val header = LinearLayout(this@PermissionGuideActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                addView(badge, LinearLayout.LayoutParams(dp(BADGE_DP), dp(BADGE_DP)))
                addView(LinearLayout(this@PermissionGuideActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(titleView)
                    addView(statusView)
                }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(SPACE_MD_DP) })
            }
            addView(header)
            addView(bodyView, lp(top = SPACE_SM_DP))
            addView(button, lp(top = SPACE_MD_DP))
            extra?.let { addView(it, lp(top = SPACE_SM_DP)) }
        }

        fun bind(state: StepState, total: Int, isCurrent: Boolean) {
            root.visibility = if (state.display == StepDisplay.CARD) View.VISIBLE else View.GONE
            if (state.display != StepDisplay.CARD) return
            val number = state.number ?: 0
            badge.set(number, state.done, palette)
            titleView.contentDescription = getString(R.string.guide_step_label, number, total, title)
            statusView.text = getString(
                when {
                    state.done -> R.string.guide_status_done
                    state.optional -> R.string.guide_status_recommended
                    else -> R.string.guide_status_pending
                },
            )
            statusView.contentDescription = if (state.done) getString(R.string.guide_status_done_desc) else null
            statusView.setTextColor(if (state.done) palette.success else palette.muted)
            bodyView.text = if (state.done && doneBody != null) doneBody else body
            // Hecho: sin botón (nada que hacer). Pendiente: uno solo, principal si es el paso actual (Hick).
            button.visibility = if (state.done) View.GONE else View.VISIBLE
            styleButton(button, primary = state.primary)
            val stroke = when {
                state.done -> palette.success
                isCurrent -> palette.link
                else -> palette.line
            }
            (root.background as GradientDrawable).setStroke(dp(if (state.done || isCurrent) 2 else 1), stroke)
        }
    }

    // ---- Piezas ----

    private fun trustRow(label: String) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(CheckView(context, palette.check, palette.onSuccessBadge).apply { importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }, LinearLayout.LayoutParams(dp(CHECK_DP), dp(CHECK_DP)))
        addView(text(label, BODY_SP, palette.text), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(SPACE_MD_DP) })
    }

    private fun card(strokeColor: Int) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(CARD_PADDING_DP), dp(CARD_PADDING_DP), dp(CARD_PADDING_DP), dp(CARD_PADDING_DP))
        background = GradientDrawable().apply {
            cornerRadius = dp(CARD_RADIUS_DP).toFloat()
            setColor(palette.surface)
            setStroke(dp(1), strokeColor)
        }
    }

    private fun text(value: String, sp: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = value
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
        setTextColor(color)
        if (bold) typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private fun actionButton(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        stateListAnimator = null
        setTextSize(TypedValue.COMPLEX_UNIT_SP, BUTTON_SP)
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        minHeight = dp(MIN_TOUCH_DP)
        minimumHeight = dp(MIN_TOUCH_DP)
        setPadding(dp(SPACE_LG_DP), dp(SPACE_SM_DP), dp(SPACE_LG_DP), dp(SPACE_SM_DP))
        gravity = Gravity.CENTER
        setOnClickListener { onClick() }
    }

    /** Principal: relleno de acento. Secundario: borde y fondo transparente. Frase normal, esquinas redondeadas. */
    private fun styleButton(button: Button, primary: Boolean) {
        val shape = GradientDrawable().apply {
            cornerRadius = dp(BUTTON_RADIUS_DP).toFloat()
            if (primary) setColor(palette.accent) else {
                setColor(Color.TRANSPARENT)
                setStroke(dp(2), palette.outline)
            }
        }
        val mask = GradientDrawable().apply { cornerRadius = dp(BUTTON_RADIUS_DP).toFloat(); setColor(Color.WHITE) }
        button.background = RippleDrawable(ColorStateList.valueOf(palette.outline and RIPPLE_ALPHA_MASK), shape, mask)
        button.setTextColor(if (primary) palette.onAccent else palette.link)
    }

    private fun linkButton(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        stateListAnimator = null
        setTextSize(TypedValue.COMPLEX_UNIT_SP, BODY_SP)
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        setTextColor(palette.link)
        paintFlags = paintFlags or Paint.UNDERLINE_TEXT_FLAG
        minHeight = dp(LINK_TOUCH_DP)
        minimumHeight = dp(LINK_TOUCH_DP)
        gravity = Gravity.CENTER_VERTICAL or Gravity.START
        setPadding(dp(SPACE_XS_DP), 0, dp(SPACE_XS_DP), 0)
        val mask = GradientDrawable().apply { cornerRadius = dp(BUTTON_RADIUS_DP).toFloat(); setColor(Color.WHITE) }
        background = RippleDrawable(ColorStateList.valueOf(palette.outline and RIPPLE_ALPHA_MASK), null, mask)
        setOnClickListener { onClick() }
    }

    private fun lp(top: Int = 0, bottom: Int = 0) =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(top)
            bottomMargin = dp(bottom)
        }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private companion object {
        val UNSET = Any()
        const val KEY_OPENED = "restrictedOpened"
        const val KEY_REQUESTED = "restrictedRequested"
        const val KEY_HOW = "howOpen"
        const val PADDING_DP = 20
        const val CARD_PADDING_DP = 18
        const val CARD_RADIUS_DP = 20
        const val BUTTON_RADIUS_DP = 16
        const val SPACE_XS_DP = 4
        const val SPACE_SM_DP = 8
        const val SPACE_MD_DP = 12
        const val SPACE_LG_DP = 16
        const val SPACE_CARDS_DP = 18
        const val MIN_TOUCH_DP = 52
        const val LINK_TOUCH_DP = 48
        const val BADGE_DP = 36
        const val CHECK_DP = 24
        const val LOGO_W_DP = 96
        const val LOGO_H_DP = 64
        const val TITLE_SP = 24f
        const val STEP_TITLE_SP = 18f
        const val BODY_SP = 16f
        const val BUTTON_SP = 17f
        const val LINE_SPACING = 1.1f
        const val RIPPLE_ALPHA_MASK = 0x40FFFFFF
    }
}

/** Logo de Contigo dibujado: círculo azul, círculo rosa y el lente turquesa donde se cruzan (como el ícono de la app). */
private class LogoView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val clip = Path()

    override fun onDraw(canvas: Canvas) {
        val r = minOf(height / 2f, width / 3f)
        val cy = height / 2f
        val leftX = width / 2f - r / 2f
        val rightX = width / 2f + r / 2f
        paint.color = GuidePalette.LOGO_BLUE
        canvas.drawCircle(leftX, cy, r, paint)
        paint.color = GuidePalette.LOGO_PINK
        canvas.drawCircle(rightX, cy, r, paint)
        clip.reset()
        clip.addCircle(leftX, cy, r, Path.Direction.CW)
        canvas.save()
        canvas.clipPath(clip)
        paint.color = GuidePalette.LOGO_LENS
        canvas.drawCircle(rightX, cy, r, paint)
        canvas.restore()
    }
}

/** Círculo con un check: marca decorativa de las líneas de confianza. */
private class CheckView(context: Context, private val color: Int, private val mark: Int) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()

    override fun onDraw(canvas: Canvas) {
        val s = minOf(width, height).toFloat()
        paint.style = Paint.Style.FILL
        paint.color = color
        canvas.drawCircle(width / 2f, height / 2f, s / 2f, paint)
        drawCheck(canvas, paint, path, width / 2f, height / 2f, s, mark)
    }
}

/** Insignia del paso: número sobre el acento, o check sobre verde cuando está listo. */
private class BadgeView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private var number = 0
    private var done = false
    private var bg = 0
    private var fg = 0

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun set(number: Int, done: Boolean, palette: GuidePalette) {
        this.number = number
        this.done = done
        bg = if (done) palette.successBadge else palette.badge
        fg = if (done) palette.onSuccessBadge else palette.onBadge
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val s = minOf(width, height).toFloat()
        val cx = width / 2f
        val cy = height / 2f
        paint.style = Paint.Style.FILL
        paint.color = bg
        canvas.drawCircle(cx, cy, s / 2f, paint)
        if (done) {
            drawCheck(canvas, paint, path, cx, cy, s, fg)
        } else {
            paint.style = Paint.Style.FILL
            paint.color = fg
            paint.textSize = s * 0.5f
            paint.typeface = Typeface.DEFAULT_BOLD
            paint.textAlign = Paint.Align.CENTER
            canvas.drawText(number.toString(), cx, cy - (paint.descent() + paint.ascent()) / 2f, paint)
        }
    }
}

private fun drawCheck(canvas: Canvas, paint: Paint, path: Path, cx: Float, cy: Float, size: Float, color: Int) {
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = size * 0.12f
    paint.strokeCap = Paint.Cap.ROUND
    paint.strokeJoin = Paint.Join.ROUND
    paint.color = color
    path.reset()
    path.moveTo(cx - size * 0.22f, cy + size * 0.01f)
    path.lineTo(cx - size * 0.06f, cy + size * 0.17f)
    path.lineTo(cx + size * 0.24f, cy - size * 0.15f)
    canvas.drawPath(path, paint)
}
