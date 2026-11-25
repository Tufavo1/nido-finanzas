// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import android.content.Context
import cl.dinovance.contigo.security.AtomicFileStorage
import cl.dinovance.contigo.security.KeystoreAesGcm
import cl.dinovance.contigo.security.SecureKeyValueStore
import java.io.File
import cl.dinovance.contigo.sync.ExpenseSyncer
import cl.dinovance.contigo.sync.ForegroundTracker
import cl.dinovance.contigo.sync.KeystoreSessionSource
import cl.dinovance.contigo.sync.SyncScheduler
import cl.dinovance.contigo.sync.UrlConnectionTransport
import java.util.UUID

/** Ensamblado único de las piezas de captura; el servicio, el receptor y el plugin comparten las mismas. */
class CaptureGraph private constructor(context: Context) {
    /** Momento en que se creo el grafo (≈ inicio del proceso): margen para que el sistema conecte el servicio al abrir la app. */
    val createdAtElapsed: Long = android.os.SystemClock.elapsedRealtime()
    val session = SecureKeyValueStore(File(context.noBackupFilesDir, "session"), KeystoreAesGcm(SESSION_KEY_ALIAS))
    // Lo sensible de las preferencias va cifrado en el almacen de la sesion (wipe() lo borra junto con la sesion)
    val prefs = CapturePrefs(context) { fail -> secureText(session, SensitivePrefs.STORE_KEY, fail) }
    val versionCode: Long = try {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    } catch (e: Exception) {
        0L
    }
    val drafts: DraftRepository = EncryptedDraftRepository(
        storage = AtomicFileStorage(File(context.noBackupFilesDir, "drafts.bin")),
        cipher = KeystoreAesGcm(DRAFTS_KEY_ALIAS),
        onFailure = { prefs.recordFailure(it, System.currentTimeMillis()) },
        clock = System::currentTimeMillis,
    )
    val recent = RecentApps(prefs)
    val notifier = CaptureNotifier(context.applicationContext, prefs)
    private val fail: (String) -> Unit = { prefs.recordFailure(it, System.currentTimeMillis()) }
    val autoLog = AutoSavedLog(secureText(session, LOG_KEY, fail), fail, System::currentTimeMillis)
    val diagnostics = DiagnosticsLog(secureText(session, DIAG_KEY, fail), fail, System::currentTimeMillis)
    // Avisos ya vistos y ya convertidos en borrador (solo hashes): almacen aparte, NO se borra con el cierre de sesion para que un
    // gasto ya enviado no renazca desde la barra ni por un reenvio del sistema
    private val seenStore = SecureKeyValueStore(File(context.noBackupFilesDir, "seen"), KeystoreAesGcm(SESSION_KEY_ALIAS))
    val ledger = NoticeLedger(secureText(seenStore, LEDGER_KEY, fail), onFailure = fail)
    // Compras ya convertidas en borrador (solo hashes): regla cross-fuente banco + Billetera Google, mismo almacen que el registro
    val purchases = PurchaseMemory(secureText(seenStore, PURCHASES_KEY, fail), onFailure = fail)
    val processor = CaptureProcessor(
        whitelist = prefs::effectiveWhitelist,
        repository = drafts,
        notifier = notifier,
        health = prefs,
        clock = System::currentTimeMillis,
        newId = { UUID.randomUUID().toString() },
        ownPackage = context.packageName,
        ownerProvider = prefs::activeOwner,
        requireOwner = true,
        auto = prefs,
        profile = ::loadProfile,
        autoLog = autoLog,
        diag = diagnostics,
        notificationsAllowed = { androidx.core.app.NotificationManagerCompat.from(context.applicationContext).areNotificationsEnabled() },
        onAutoSaved = { SyncScheduler.enqueue(context.applicationContext) },
        ledger = ledger,
        purchases = purchases,
    )
    val seen = SeenNotices(secureText(seenStore, SEEN_KEY, fail), onFailure = fail)
    val rescanner = NotificationRescanner(
        accepts = { processor.accepts(it) },
        process = { p, t, x, at -> processor.process(p, t, x, at) },
        seen = seen,
        clock = System::currentTimeMillis,
        recent = { p, at -> if (p != context.packageName) recent.record(p, at) },
        onFailure = { prefs.recordFailure(it, System.currentTimeMillis()) },
        processNotice = { processor.process(it) },
    )
    private val transport = UrlConnectionTransport()
    val syncer = ExpenseSyncer(
        repository = drafts,
        profile = ::loadProfile,
        owner = prefs::activeOwner,
        apiBase = prefs::apiBase,
        session = KeystoreSessionSource(session, transport, prefs::apiBase, ForegroundTracker::isForeground),
        transport = transport,
        status = prefs,
        log = autoLog,
        onOwnerMismatch = ::clearProfile,
    )

    /** Busca las apps de banco instaladas (lanzador, sin QUERY_ALL_PACKAGES), guarda las que coinciden por nombre y devuelve el resultado. */
    fun refreshBanks(context: Context): List<DetectedBank> {
        val pm = context.packageManager
        val intent = android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_LAUNCHER)
        val apps = try {
            pm.queryIntentActivities(intent, 0).map { InstalledApp(it.activityInfo.packageName, it.loadLabel(pm).toString()) }.distinctBy { it.packageName }
        } catch (e: Exception) {
            emptyList()
        }
        val learned = BankPresets.ALL.associate { b -> b.id to setOfNotNull(prefs.bankPackage(b.id)) }
        val result = BankDetector.detect(apps, learned, context.packageName)
        BankPresets.ALL.forEach { b ->
            prefs.setDetectedPackages(b.id, result.filter { it.bankId == b.id && it.status == DetectStatus.installed }.mapNotNull { it.packageName }.toSet())
        }
        return result
    }

    fun loadProfile(): AutoProfile? = try {
        session.get(PROFILE_KEY)?.let(AutoProfile::parse)
    } catch (e: Exception) {
        null
    }

    /** false si no se pudo guardar cifrado (Keystore roto): el plugin lo informa en vez de tumbar la app. */
    fun saveProfile(profile: AutoProfile): Boolean = session.trySet(PROFILE_KEY, profile.toJson())

    fun clearProfile() = session.remove(PROFILE_KEY)

    companion object {
        const val PROFILE_KEY = "auto-profile"
        const val LOG_KEY = "auto-log"
        const val DIAG_KEY = "diag-log"
        const val SEEN_KEY = "seen-notices"
        const val LEDGER_KEY = "notice-ledger"
        const val PURCHASES_KEY = "purchase-memory"

        /** Claves del almacen seguro que son de la capa nativa: el WebView no las lee ni escribe (secureGet/secureSet/secureRemove). */
        private val RESERVED_KEYS = setOf(PROFILE_KEY, LOG_KEY, DIAG_KEY, SensitivePrefs.STORE_KEY)

        fun isReservedKey(key: String): Boolean = key in RESERVED_KEYS

        /** Texto cifrado en [store] que nunca lanza (fallos por nombre de clase). */
        fun secureText(store: SecureKeyValueStore, key: String, onFailure: (String) -> Unit): TextStore =
            SafeTextStore({ store.get(key) }, { v -> if (v == null) store.remove(key) else store.set(key, v) }, onFailure)
        private const val DRAFTS_KEY_ALIAS = "contigo_drafts_v1"
        private const val SESSION_KEY_ALIAS = "contigo_session_v1"

        @Volatile
        private var instance: CaptureGraph? = null

        fun get(context: Context): CaptureGraph =
            instance ?: synchronized(this) { instance ?: CaptureGraph(context.applicationContext).also { instance = it } }
    }
}
