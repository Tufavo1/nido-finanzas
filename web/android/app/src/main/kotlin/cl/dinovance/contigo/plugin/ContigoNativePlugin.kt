// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.plugin

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import cl.dinovance.contigo.capture.CaptureGraph
import cl.dinovance.contigo.capture.Draft
import cl.dinovance.contigo.capture.OwnerFilter
import cl.dinovance.contigo.capture.ReminderPolicy
import cl.dinovance.contigo.capture.CaptureNotifier
import cl.dinovance.contigo.diagnostics.CrashRecorder
import cl.dinovance.contigo.ui.PermissionGuideActivity
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.PluginMethod
import cl.dinovance.contigo.capture.DraftEvents
import org.json.JSONArray

/** Puente Capacitor. La interfaz TypeScript equivalente está en web/src/lib/nativeBridge.ts. */
@CapacitorPlugin(name = "ContigoNative")
class ContigoNativePlugin : Plugin() {
    private val graph by lazy { CaptureGraph.get(context.applicationContext) }
    private var pendingOpenDraftId: String? = null

    override fun load() {
        DraftEvents.listener = { notifyListeners(EVENT_DRAFTS_CHANGED, JSObject()) }
        pendingOpenDraftId = bridge.activity?.intent?.draftIdIfOpenAction()
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        intent.draftIdIfOpenAction()?.let {
            pendingOpenDraftId = it
            notifyListeners(EVENT_DRAFT_OPEN, JSObject().put("id", it))
        }
    }

    override fun handleOnDestroy() {
        DraftEvents.listener = null
    }

    // ---- Estado y permisos ----

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val health = graph.prefs.health()
        val allowed = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
        val result = JSObject()
            .put("listenerAllowed", allowed)
            .put("listenerConnected", health.connected)
            .put("revokedSinceConnected", health.everConnected && !allowed)
            .put("notificationsAllowed", NotificationManagerCompat.from(context).areNotificationsEnabled())
            .put("batteryOptimized", !isIgnoringBatteryOptimizations())
            .put("restrictedSettingsLikely", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !allowed && !installedFromPlay())
            .put("lastEventAt", health.lastEventAt)
            .put("lastHeartbeatAt", health.lastHeartbeatAt)
            .put("failures", health.failures)
            .put("lastFailureClass", health.lastFailureClass)
            .put("whitelistCount", graph.prefs.whitelist().size)
            .put("hideOnLockScreen", graph.prefs.hideOnLockScreen())
        call.resolve(result)
    }

    @PluginMethod
    fun openPermissionGuide(call: PluginCall) {
        context.startActivity(Intent(context, PermissionGuideActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }

    @PluginMethod
    fun openListenerSettings(call: PluginCall) {
        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }

    @PluginMethod
    fun openAppDetails(call: PluginCall) {
        val uri = Uri.fromParts("package", context.packageName, null)
        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && activity != null &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_POST_NOTIFICATIONS)
        }
        call.resolve()
    }

    // ---- Lista blanca y privacidad ----

    @PluginMethod
    fun getAllowedPackages(call: PluginCall) = call.resolve(JSObject().put("packages", JSONArray(graph.prefs.whitelist().sorted())))

    @PluginMethod
    fun setAllowedPackages(call: PluginCall) {
        val raw = call.getArray("packages") ?: return call.reject("Falta la lista de paquetes", "INVALID_ARGUMENT")
        val packages = (0 until raw.length()).map { raw.optString(it) }
        val own = context.packageName
        if (packages.size > MAX_PACKAGES || packages.any { !PACKAGE_NAME.matches(it) }) {
            return call.reject("Hay un nombre de paquete no válido", "INVALID_ARGUMENT")
        }
        graph.prefs.setWhitelist(packages.filter { it != own }.toSet())
        call.resolve()
    }

    /** Apps que mostraron notificaciones hace poco: solo paquete, nombre visible y hora. Jamás texto. */
    @PluginMethod
    fun getRecentNotifyingApps(call: PluginCall) {
        val apps = JSArray()
        graph.recent.list().forEach { (pkg, last) ->
            apps.put(JSObject().put("packageName", pkg).put("label", labelOf(pkg)).put("lastSeenMillis", last))
        }
        call.resolve(JSObject().put("apps", apps))
    }

    @PluginMethod
    fun setHideOnLockScreen(call: PluginCall) {
        graph.prefs.setHideOnLockScreen(call.getBoolean("hide", true) ?: true)
        call.resolve()
    }

    // ---- Borradores ----

    @PluginMethod
    fun listDrafts(call: PluginCall) {
        val array = JSArray()
        // Solo los del usuario/hogar activo: los de otro dueño no se muestran ni se envían (H-06).
        OwnerFilter.visible(graph.drafts.list(), graph.prefs.activeOwner()).forEach { array.put(it.toJs()) }
        call.resolve(JSObject().put("drafts", array).put("pendingToSend", ReminderPolicy.pendingToSend(graph.drafts.list(), graph.prefs.activeOwner())))
    }

    @PluginMethod
    fun removeDraft(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("Falta el id", "INVALID_ARGUMENT")
        graph.drafts.remove(id)
        graph.notifier.cancel(id)
        call.resolve()
    }

    /** Id del borrador que la persona abrió desde «Cambiar categoría» o tocando la notificación (se entrega una vez). */
    @PluginMethod
    fun consumePendingOpen(call: PluginCall) {
        val id = pendingOpenDraftId
        pendingOpenDraftId = null
        call.resolve(JSObject().put("id", id))
    }

    // ---- Almacén seguro (sesión de Supabase) ----

    @PluginMethod
    fun secureGet(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("Falta la clave", "INVALID_ARGUMENT")
        call.resolve(JSObject().put("value", graph.session.get(key)))
    }

    @PluginMethod
    fun secureSet(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("Falta la clave", "INVALID_ARGUMENT")
        val value = call.getString("value") ?: return call.reject("Falta el valor", "INVALID_ARGUMENT")
        graph.session.set(key, value)
        call.resolve()
    }

    @PluginMethod
    fun secureRemove(call: PluginCall) {
        val key = call.getString("key") ?: return call.reject("Falta la clave", "INVALID_ARGUMENT")
        graph.session.remove(key)
        call.resolve()
    }

    /** «Borrar todo lo capturado»: borradores, notificaciones propias y la lista de apps recientes. Deja la sesión. */
    @PluginMethod
    fun clearCaptured(call: PluginCall) {
        graph.drafts.list().forEach { graph.notifier.cancel(it.id) }
        graph.drafts.clear()
        graph.recent.clear()
        call.resolve()
    }

    /** La app avisa quién inició sesión (ownerKey = usuario:hogar, opaco). null = sin sesión. */
    @PluginMethod
    fun setActiveOwner(call: PluginCall) {
        val key = call.getString("ownerKey")
        if (key != null && !OWNER_KEY.matches(key)) return call.reject("Dueño no válido", "INVALID_ARGUMENT")
        if (key != null) {
            // Avisos que llegaron sin sesion (p. ej. token vencido): vuelven a su persona si es la misma (R2-03)
            OwnerFilter.adoptable(graph.drafts.list(), key, graph.prefs.lastUser()).forEach { d -> graph.drafts.update(d.id) { it.copy(ownerKey = key) } }
            graph.prefs.setLastUser(OwnerFilter.userOf(key))
        }
        graph.prefs.setActiveOwner(key)
        call.resolve()
    }

    /** Borra todas las colas `queue-*` del almacén seguro, sin tocar la sesión. */
    @PluginMethod
    fun clearQueues(call: PluginCall) {
        graph.session.removeByPrefix("queue-")
        call.resolve()
    }

    /**
     * Cambio de cuenta: borra las colas de las personas anteriores y los borradores que no son del nuevo dueño
     * (con sus notificaciones) y fija el dueño. NUNCA borra la sesión de la persona nueva.
     */
    @PluginMethod
    fun wipeForAccountSwitch(call: PluginCall) {
        val key = call.getString("ownerKey")
        if (key != null && !OWNER_KEY.matches(key)) return call.reject("Dueño no válido", "INVALID_ARGUMENT")
        graph.session.removeByPrefix("queue-")
        if (key != null) OwnerFilter.adoptable(graph.drafts.list(), key, graph.prefs.lastUser()).forEach { d -> graph.drafts.update(d.id) { it.copy(ownerKey = key) } }
        OwnerFilter.foreign(graph.drafts.list(), key).forEach {
            graph.notifier.cancel(it.id)
            graph.drafts.remove(it.id)
        }
        graph.prefs.setActiveOwner(key)
        graph.prefs.setLastUser(key?.let(OwnerFilter::userOf))
        call.resolve()
    }

    /** Cierre de sesión o borrado de cuenta: vacía sesión, cola y notificaciones propias (CA-05-4). */
    @PluginMethod
    fun wipe(call: PluginCall) {
        graph.drafts.list().forEach { graph.notifier.cancel(it.id) }
        graph.drafts.clear()
        graph.recent.clear()
        graph.session.removeByPrefix("queue-")
        graph.session.clear()
        graph.prefs.setActiveOwner(null)
        graph.prefs.setLastUser(null)
        call.resolve()
    }

    // ---- Diagnóstico ----

    @PluginMethod
    fun peekCrashReports(call: PluginCall) {
        val array = JSArray()
        CrashRecorder.logFor(context).read().forEach { array.put(it.toJson()) }
        call.resolve(JSObject().put("reports", array))
    }

    @PluginMethod
    fun clearCrashReports(call: PluginCall) {
        CrashRecorder.logFor(context).clear()
        call.resolve()
    }

    private fun labelOf(packageName: String): String = try {
        context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(packageName, 0)).toString()
    } catch (e: PackageManager.NameNotFoundException) {
        packageName
    }

    private fun Draft.toJs(): JSObject = JSObject(toJson().toString())

    private fun Intent.draftIdIfOpenAction(): String? =
        if (action == CaptureNotifier.ACTION_OPEN || action == CaptureNotifier.ACTION_CHANGE_CATEGORY) getStringExtra(CaptureNotifier.EXTRA_DRAFT_ID) else null

    private fun isIgnoringBatteryOptimizations(): Boolean =
        (context.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(context.packageName)

    private fun installedFromPlay(): Boolean {
        val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getInstallerPackageName(context.packageName)
        }
        return installer == PLAY_STORE
    }

    private companion object {
        const val EVENT_DRAFTS_CHANGED = "draftsChanged"
        const val EVENT_DRAFT_OPEN = "draftOpen"
        const val REQUEST_POST_NOTIFICATIONS = 4101
        const val MAX_PACKAGES = 50
        private val OWNER_KEY = Regex("[A-Za-z0-9:_-]{1,100}")
        const val PLAY_STORE = "com.android.vending"
        val PACKAGE_NAME = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$")
    }
}
