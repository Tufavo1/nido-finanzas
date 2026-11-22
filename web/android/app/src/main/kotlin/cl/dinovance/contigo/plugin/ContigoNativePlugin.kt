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
import cl.dinovance.contigo.capture.AutoProfile
import cl.dinovance.contigo.capture.BankPresets
import cl.dinovance.contigo.capture.OwnerFilter
import cl.dinovance.contigo.sync.SyncScheduler
import org.json.JSONObject
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
        graph.autoLog.clear()
        graph.clearProfile()
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
        graph.clearProfile()
        graph.autoLog.clear()
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

    // ---- Registro automatico por banco (opt-in) y envio en segundo plano ----

    @PluginMethod
    fun getBankPresets(call: PluginCall) {
        val banks = JSArray()
        BankPresets.ALL.forEach {
            banks.put(
                JSObject().put("id", it.id).put("name", it.displayName).put("packageName", graph.prefs.bankPackage(it.id))
                    .put("autoSave", graph.prefs.autoEnabled(it.id)).put("candidatePackages", JSArray(it.candidatePackages)),
            )
        }
        call.resolve(JSObject().put("banks", banks).put("maxClp", graph.prefs.maxClp()))
    }

    /** Asocia (o quita con null) la app de un banco; es lo que guarda el «modo aprender». Quitarla apaga el guardado automatico. */
    @PluginMethod
    fun setBankPackage(call: PluginCall) {
        val bank = call.getString("bankId")?.let(BankPresets::byId) ?: return call.reject("Banco no válido", "INVALID_ARGUMENT")
        val pkg = if (call.data.isNull("packageName")) null else call.getString("packageName")
        if (pkg != null && (!PACKAGE_NAME.matches(pkg) || pkg == context.packageName)) return call.reject("Paquete no válido", "INVALID_ARGUMENT")
        graph.prefs.setBankPackage(bank.id, pkg)
        if (pkg == null) graph.prefs.setBankAutoSave(bank.id, false) else graph.prefs.setWhitelist(graph.prefs.whitelist() + pkg)
        call.resolve()
    }

    @PluginMethod
    fun setBankAutoSave(call: PluginCall) {
        val bank = call.getString("bankId")?.let(BankPresets::byId) ?: return call.reject("Banco no válido", "INVALID_ARGUMENT")
        val enabled = call.getBoolean("enabled") ?: return call.reject("Falta enabled", "INVALID_ARGUMENT")
        if (enabled && graph.prefs.bankPackage(bank.id) == null) return call.reject("Asocia primero la app del banco", "NO_PACKAGE")
        graph.prefs.setBankAutoSave(bank.id, enabled)
        call.resolve()
    }

    @PluginMethod
    fun setAutoCap(call: PluginCall) {
        val max = call.getLong("maxClp") ?: return call.reject("Falta maxClp", "INVALID_ARGUMENT")
        if (max < 1 || max >= MAX_CLP) return call.reject("Tope no válido", "INVALID_ARGUMENT")
        graph.prefs.setMaxClp(max)
        call.resolve()
    }

    /** La app entrega dueño, hogar y categorias aprendidas para poder guardar con la app cerrada. */
    @PluginMethod
    fun setAutoProfile(call: PluginCall) {
        val profile = AutoProfile.fromJs(
            call.getString("ownerKey").orEmpty(), call.getString("userId").orEmpty(), call.getString("householdId").orEmpty(),
            call.getString("paidBy").orEmpty(), call.getBoolean("shared") ?: false, call.getArray("categories") ?: JSArray(),
        ) ?: return call.reject("Perfil no válido", "INVALID_ARGUMENT")
        // Solo el perfil del dueño activo: una respuesta tardía de otra persona no puede dejar su perfil guardado (R3-04)
        if (profile.ownerKey != graph.prefs.activeOwner()) return call.reject("El perfil no es del dueño activo", "OWNER_MISMATCH")
        graph.saveProfile(profile)
        SyncScheduler.enqueue(context)
        call.resolve(JSObject().put("ownerKey", profile.ownerKey))
    }

    /** Direccion del Worker (VITE_API_BASE): solo https. */
    @PluginMethod
    fun configureSync(call: PluginCall) {
        val base = call.getString("apiBase")?.trimEnd('/')
        if (base != null && (!base.startsWith("https://") || base.length > 200)) return call.reject("Dirección no válida", "INVALID_ARGUMENT")
        graph.prefs.setApiBase(base)
        call.resolve()
    }

    @PluginMethod
    fun getSyncState(call: PluginCall) {
        val owner = graph.prefs.activeOwner()
        val all = OwnerFilter.visible(graph.drafts.list(), owner)
        val pending = ReminderPolicy.pendingToSend(graph.drafts.list(), owner)
        val rejected = all.count { it.syncRejected }
        val error = graph.prefs.lastSyncError()
        val last = graph.prefs.lastSyncOkAt()
        call.resolve(
            JSObject().put("state", if ((error != null && pending > 0) || rejected > 0) "error" else "idle").put("pending", pending)
                .put("rejected", rejected).put("lastSyncAt", if (last > 0) last else JSONObject.NULL).put("lastError", error ?: JSONObject.NULL),
        )
    }

    @PluginMethod
    fun syncNow(call: PluginCall) {
        SyncScheduler.enqueue(context)
        call.resolve()
    }

    /** Gastos guardados solos de la persona activa (otra persona del mismo telefono no ve los ajenos). status: pending | synced | rejected. */
    @PluginMethod
    fun listAutoSaved(call: PluginCall) {
        val items = JSArray()
        graph.autoLog.listFor(graph.prefs.activeOwner()).forEach {
            val status = if (it.rejected) "rejected" else if (it.synced) "synced" else "pending"
            items.put(JSObject().put("id", it.id).put("amount", it.amountClp).put("note", it.note).put("at", it.at).put("synced", it.synced).put("status", status))
        }
        call.resolve(JSObject().put("items", items))
    }

    /**
     * Deshacer, coordinado con el envio (mismo cerrojo que syncOnce): solo es «deshecho» si el borrador AUN esta en la cola del
     * telefono. Si ya salio (por el servicio o por la app abierta) o esta en vuelo, `needsDelete` = la app debe borrarlo en el servidor.
     */
    @PluginMethod
    fun undoAutoSaved(call: PluginCall) {
        val id = call.getString("id")?.lowercase() ?: return call.reject("Falta el id", "INVALID_ARGUMENT")
        val owner = graph.prefs.activeOwner()
        val result = graph.syncer.coordinated {
            val entry = graph.autoLog.listFor(owner).firstOrNull { it.id == id }
            if (entry == null) {
                Pair(false, false) // no es de la persona activa o ya no existe: nada que deshacer
            } else {
                val stillHere = graph.drafts.list().any { it.id == id && it.ownerKey == owner } // aun no salio
                if (stillHere && !entry.synced) {
                    graph.drafts.remove(id)
                    graph.notifier.cancel(id)
                    graph.autoLog.remove(id)
                    Pair(true, false)
                } else {
                    Pair(false, true)
                }
            }
        }
        call.resolve(JSObject().put("undone", result.first).put("needsDelete", result.second))
    }

    @PluginMethod
    fun dismissAutoSaved(call: PluginCall) {
        val id = call.getString("id")?.lowercase() ?: return call.reject("Falta el id", "INVALID_ARGUMENT")
        if (graph.autoLog.listFor(graph.prefs.activeOwner()).any { it.id == id }) graph.autoLog.remove(id)
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

    /** Con `bankAutoOff` el borrador es de un banco con el guardado automatico APAGADO: el modo global de Ajustes tampoco lo guarda solo. */
    private fun Draft.toJs(): JSObject {
        val bank = graph.prefs.bankOfPackage(sourcePackage)
        return JSObject(toJson().toString()).put("bankAutoOff", bank != null && !graph.prefs.autoEnabled(bank))
    }

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
        private const val MAX_CLP = 10_000_000_000L
        private val OWNER_KEY = Regex("[A-Za-z0-9:_-]{1,100}")
        const val PLAY_STORE = "com.android.vending"
        val PACKAGE_NAME = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$")
    }
}
