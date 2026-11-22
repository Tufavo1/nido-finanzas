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
import androidx.core.content.ContextCompat
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialException
import java.io.File
import cl.dinovance.contigo.auth.GoogleSignInLogic
import cl.dinovance.contigo.capture.BankSetup
import cl.dinovance.contigo.capture.NotificationCaptureService
import cl.dinovance.contigo.sync.ApiBasePolicy
import cl.dinovance.contigo.update.CheckResult
import cl.dinovance.contigo.update.UpdateEvents
import cl.dinovance.contigo.update.HttpUrlGet
import cl.dinovance.contigo.update.PackageApkInspector
import cl.dinovance.contigo.update.SafeFetcher
import cl.dinovance.contigo.update.UpdateError
import cl.dinovance.contigo.update.UpdateException
import cl.dinovance.contigo.update.UpdateInfo
import cl.dinovance.contigo.update.UpdateInstaller
import cl.dinovance.contigo.update.UpdateService
import cl.dinovance.contigo.capture.AutoProfile
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
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
            .put("whitelistCount", graph.prefs.effectiveWhitelist().size)
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
    fun getAllowedPackages(call: PluginCall) = call.resolve(JSObject().put("packages", JSONArray(graph.prefs.effectiveWhitelist().sorted())))

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
        graph.diagnostics.clear()
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
            val adopted = OwnerFilter.adoptable(graph.drafts.list(), key, graph.prefs.lastUser())
            adopted.forEach { d -> graph.drafts.update(d.id) { it.copy(ownerKey = key) } }
            graph.prefs.setLastUser(OwnerFilter.userOf(key))
            if (adopted.isNotEmpty()) DraftEvents.changed() // la bandeja se refresca con lo que llego antes de iniciar sesion
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
        graph.diagnostics.clear()
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
                JSObject().put("id", it.id).put("name", it.displayName).put("packageName", graph.prefs.bankPackage(it.id) ?: graph.prefs.detectedPackages(it.id).minOrNull())
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
        if (enabled) graph.refreshBanks(context)
        if (enabled && !graph.prefs.hasBankApp(bank.id)) return call.reject("Asocia primero la app del banco", "NO_PACKAGE")
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
        // S-18: fijada la primera direccion valida, el JS solo puede repetir el mismo origen
        when (val r = ApiBasePolicy.decide(graph.prefs.apiBase(), base)) {
            is ApiBasePolicy.Decision.Reject -> return call.reject(if (r.code == "API_BASE_LOCKED") "La dirección del servidor ya está fijada" else "Dirección no válida", r.code)
            is ApiBasePolicy.Decision.Accept -> graph.prefs.setApiBase(r.base)
        }
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

    // ---- Entrar con Google (Credential Manager). Google bloquea el OAuth web dentro de una WebView (disallowed_useragent) ----

    @PluginMethod
    fun isGoogleSignInSupported(call: PluginCall) {
        // Credential Manager llega por Google Play Services; sin ellos el selector no existe
        val ok = try {
            context.packageManager.getPackageInfo("com.google.android.gms", 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
        call.resolve(JSObject().put("supported", ok))
    }

    /** nonce en claro de la app; al selector va su SHA-256 hex (setNonce) y Supabase lo recibe en claro. Sin tokens ni correos en logs. */
    @PluginMethod
    fun googleSignIn(call: PluginCall) {
        val nonce = call.getString("nonce")
        val clientId = call.getString("serverClientId")
        if (!GoogleSignInLogic.isValidNonce(nonce)) return call.reject("Nonce no válido", "INVALID_NONCE")
        if (!GoogleSignInLogic.isValidClientId(clientId)) return call.reject("Cliente no válido", "UNSUPPORTED")
        val act = activity ?: return call.reject("Sin pantalla", "FAILED")
        val option = GetSignInWithGoogleOption.Builder(clientId!!).setNonce(GoogleSignInLogic.hashNonce(nonce!!)).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        CredentialManager.create(act).getCredentialAsync(
            act, request, null, ContextCompat.getMainExecutor(act),
            object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                override fun onResult(result: GetCredentialResponse) {
                    val credential = result.credential
                    if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                        try {
                            call.resolve(JSObject().put("idToken", GoogleIdTokenCredential.createFrom(credential.data).idToken))
                        } catch (e: GoogleIdTokenParsingException) {
                            call.reject("No se pudo leer la cuenta", "FAILED")
                        }
                    } else {
                        call.reject("Credencial inesperada", "FAILED")
                    }
                }

                override fun onError(e: GetCredentialException) {
                    call.reject("Google no respondió", GoogleSignInLogic.errorCode(e))
                }
            },
        )
    }

    /** Procesa los avisos que ya estaban en la barra (solo apps permitidas, ultimas 24 h, maximo 50, sin duplicar). {processed, connected}. */
    @PluginMethod
    fun rescanNotifications(call: PluginCall) {
        val service = NotificationCaptureService.instance
        updateExecutor.execute {
            val n = service?.rescanActive() ?: 0
            call.resolve(JSObject().put("processed", n).put("connected", service != null))
        }
    }

    // ---- Deteccion automatica de bancos, activacion en un paso y diagnostico ----

    /** Apps de banco encontradas por NOMBRE VISIBLE entre las apps con icono (sin QUERY_ALL_PACKAGES). Incluye not_found. */
    @PluginMethod
    fun getDetectedBanks(call: PluginCall) {
        val list = JSArray()
        graph.refreshBanks(context).forEach {
            list.put(JSObject().put("bankId", it.bankId).put("appLabel", it.appLabel ?: JSONObject.NULL).put("packageName", it.packageName ?: JSONObject.NULL).put("status", it.status.name))
        }
        call.resolve(JSObject().put("detected", list))
    }

    private fun resolveSetup(call: PluginCall, enabled: Boolean) {
        graph.refreshBanks(context)
        val r = BankSetup(graph.prefs).setAll(enabled)
        call.resolve(JSObject().put("enabled", JSONArray(r.enabled)).put("disabled", JSONArray(r.disabled)).put("withoutApp", JSONArray(r.withoutApp)))
    }

    /** Activa captura + guardado automatico en todos los bancos con app, con el tope por defecto. Sin apps no hace nada y lo informa (withoutApp). */
    @PluginMethod
    fun enableAllDetected(call: PluginCall) = resolveSetup(call, true)

    @PluginMethod
    fun setAutoSaveAll(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: return call.reject("Falta enabled", "INVALID_ARGUMENT")
        resolveSetup(call, enabled)
    }

    /** Motivos tipificados y texto ENMASCARADO de los ultimos avisos no aceptados (maximo 20). Solo local. */
    @PluginMethod
    fun getCaptureDiagnostics(call: PluginCall) {
        val items = JSArray()
        graph.diagnostics.list().forEach {
            items.put(JSObject().put("atMillis", it.atMillis).put("bankId", it.bankId ?: JSONObject.NULL).put("reason", it.reason.name).put("maskedText", it.maskedText))
        }
        call.resolve(JSObject().put("items", items))
    }

    // ---- Actualizaciones desde el release publicado en GitHub ----

    private val updateService by lazy {
        val repo = context.getString(cl.dinovance.contigo.R.string.update_repo).takeIf { Regex("[A-Za-z0-9_.-]{1,60}/[A-Za-z0-9_.-]{1,100}").matches(it) } ?: ""
        UpdateService(
            SafeFetcher(HttpUrlGet()), PackageApkInspector(context), { installedVersionCode() }, context.packageName,
            "https://api.github.com/repos/$repo/releases/latest", File(context.cacheDir, UpdateInstaller.DIR),
        )
    }
    @Volatile private var lastUpdate: UpdateInfo? = null
    private val updateExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()

    @Suppress("DEPRECATION")
    private fun installedVersionCode(): Long = context.packageManager.getPackageInfo(context.packageName, 0).let { if (Build.VERSION.SDK_INT >= 28) it.longVersionCode else it.versionCode.toLong() }

    private fun PluginCall.updateError(e: Throwable) {
        reject("Actualización: " + ((e as? UpdateException)?.error?.name ?: UpdateError.INSTALL_FAILED.name), (e as? UpdateException)?.error?.name ?: UpdateError.INSTALL_FAILED.name)
    }

    @PluginMethod
    fun getAppInfo(call: PluginCall) {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        call.resolve(JSObject().put("versionName", info.versionName ?: "").put("versionCode", installedVersionCode()))
    }

    /** Pide a GitHub (anonimo: se ve la IP, nada mas) el ultimo release PUBLICADO y lo compara con el instalado. */
    @PluginMethod
    fun checkForUpdate(call: PluginCall) {
        updateExecutor.execute {
            try {
                when (val r = updateService.check()) {
                    is CheckResult.UpToDate -> { lastUpdate = null; call.resolve(JSObject().put("available", false)) }
                    is CheckResult.Available -> {
                        lastUpdate = r.info
                        call.resolve(JSObject().put("available", true).put("versionName", r.info.versionName).put("versionCode", r.info.versionCode)
                            .put("sizeBytes", r.info.sizeBytes).put("notes", r.info.notes ?: JSONObject.NULL))
                    }
                }
            } catch (e: Exception) { call.updateError(e) }
        }
    }

    /** Descarga, verifica hash/paquete/version/firma y avisa el progreso con el evento `updateProgress`. */
    @PluginMethod
    fun downloadUpdate(call: PluginCall) {
        val info = lastUpdate ?: return call.reject("Primero comprueba si hay actualización", UpdateError.NOTHING_DOWNLOADED.name)
        updateExecutor.execute {
            try {
                var last = 0L
                updateService.download(info) { done, total ->
                    if (done - last >= 256 * 1024 || done == total) { last = done; notifyListeners("updateProgress", JSObject().put("downloaded", done).put("total", total)) }
                }
                call.resolve(JSObject().put("versionName", info.versionName).put("versionCode", info.versionCode))
            } catch (e: Exception) { updateService.cleanup(); call.updateError(e) }
        }
    }

    @PluginMethod
    fun installUpdate(call: PluginCall) {
        if (!UpdateInstaller.canInstall(context)) return call.reject("Permite instalar apps desconocidas para Contigo", UpdateError.INSTALL_NOT_ALLOWED.name)
        updateExecutor.execute {
            try {
                UpdateEvents.onInstall = { status, error -> notifyListeners("updateInstall", JSObject().put("status", status).put("error", error ?: JSONObject.NULL)) }
                UpdateInstaller.install(context, updateService.pendingFile())
                call.resolve()
            } catch (e: Exception) { updateService.cleanup(); call.updateError(e) }
        }
    }

    /** Abre «Instalar apps desconocidas» de Contigo en Ajustes. */
    @PluginMethod
    fun openInstallSettings(call: PluginCall) {
        val i = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, android.net.Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
        call.resolve()
    }

    @PluginMethod
    fun canInstallUpdates(call: PluginCall) = call.resolve(JSObject().put("allowed", UpdateInstaller.canInstall(context)))

    @PluginMethod
    fun discardUpdate(call: PluginCall) {
        updateService.cleanup()
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
