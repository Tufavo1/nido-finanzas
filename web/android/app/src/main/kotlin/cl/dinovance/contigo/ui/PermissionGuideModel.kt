// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.ui

/** Si hace falta «Permitir ajustes restringidos» antes de poder activar el acceso a notificaciones. */
enum class RestrictedHint {
    /** Android 12 o menos, o instalada desde una tienda: el interruptor no sale gris. */
    NOT_NEEDED,

    /** Android 13 o más e instalada desde un archivo: casi seguro hace falta. */
    LIKELY,

    /** Android 13 o más y el sistema no dice de dónde vino: se ofrece colapsado. */
    UNKNOWN;

    companion object {
        /** Valores de `PackageInstaller.PACKAGE_SOURCE_*` (API 33); copiados para que esto corra en la JVM. */
        const val SOURCE_STORE = 2
        const val SOURCE_LOCAL_FILE = 3
        const val SOURCE_DOWNLOADED_FILE = 4
        private const val TIRAMISU = 33
        private const val PLAY_STORE = "com.android.vending"

        fun of(sdk: Int, installer: String?, packageSource: Int?): RestrictedHint = when {
            sdk < TIRAMISU -> NOT_NEEDED
            installer == PLAY_STORE || packageSource == SOURCE_STORE -> NOT_NEEDED
            packageSource == SOURCE_LOCAL_FILE || packageSource == SOURCE_DOWNLOADED_FILE -> LIKELY
            else -> UNKNOWN
        }
    }
}

enum class StepId { RESTRICTED, LISTENER, BATTERY }

/** CARD = tarjeta numerada; COLLAPSED = solo un enlace «Si Android no te deja activarlo, toca aquí»; HIDDEN = no se muestra. */
enum class StepDisplay { CARD, COLLAPSED, HIDDEN }

data class GuideInput(
    val listenerAllowed: Boolean,
    val batteryOk: Boolean,
    val restricted: RestrictedHint,
    /** El usuario ya abrió la ficha de la app en esta visita (el sistema no deja comprobar el ajuste restringido). */
    val restrictedOpened: Boolean = false,
)

data class StepState(
    val id: StepId,
    val display: StepDisplay,
    val done: Boolean,
    val optional: Boolean,
    /** Número visible (1..n) solo para las tarjetas. */
    val number: Int?,
    /** Su botón es la acción principal de la pantalla. */
    val primary: Boolean,
)

/**
 * Estado de la guía de permisos deducido de lo que el teléfono comprueba solo (ley de Tesler): el usuario no tiene que
 * adivinar qué paso le falta. Lógica pura, sin Android, para probarla en la JVM.
 */
data class PermissionGuideModel(
    val steps: List<StepState>,
    /** Paso que recibe el foco al volver a la pantalla; null = el botón «Listo». */
    val current: StepId?,
    val doneEmphasized: Boolean,
    val showMissingHint: Boolean,
) {
    fun step(id: StepId): StepState = steps.first { it.id == id }

    companion object {
        fun from(input: GuideInput): PermissionGuideModel {
            val allowed = input.listenerAllowed
            val restrictedDisplay = when (input.restricted) {
                RestrictedHint.NOT_NEEDED -> StepDisplay.HIDDEN
                RestrictedHint.LIKELY -> StepDisplay.CARD
                RestrictedHint.UNKNOWN -> if (allowed) StepDisplay.HIDDEN else StepDisplay.COLLAPSED
            }
            val current = when {
                !allowed && restrictedDisplay == StepDisplay.CARD && !input.restrictedOpened -> StepId.RESTRICTED
                !allowed -> StepId.LISTENER
                !input.batteryOk -> StepId.BATTERY
                else -> null
            }
            val raw = listOf(
                Triple(StepId.RESTRICTED, restrictedDisplay, allowed),
                Triple(StepId.LISTENER, StepDisplay.CARD, allowed),
                Triple(StepId.BATTERY, StepDisplay.CARD, input.batteryOk),
            )
            var n = 0
            val steps = raw.map { (id, display, done) ->
                val optional = id == StepId.BATTERY
                StepState(
                    id = id,
                    display = display,
                    done = done,
                    optional = optional,
                    number = if (display == StepDisplay.CARD) ++n else null,
                    // Hick: una sola acción principal. Lo opcional nunca compite con «Listo».
                    primary = id == current && !optional,
                )
            }
            return PermissionGuideModel(steps, current, doneEmphasized = allowed, showMissingHint = !allowed)
        }
    }
}
