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
    val prefs = CapturePrefs(context)
    val drafts: DraftRepository = EncryptedDraftRepository(
        storage = AtomicFileStorage(File(context.noBackupFilesDir, "drafts.bin")),
        cipher = KeystoreAesGcm(DRAFTS_KEY_ALIAS),
        clock = System::currentTimeMillis,
    )
    val recent = RecentApps(prefs)
    val notifier = CaptureNotifier(context.applicationContext, prefs)
    val session = SecureKeyValueStore(File(context.noBackupFilesDir, "session"), KeystoreAesGcm(SESSION_KEY_ALIAS))
    val autoLog = AutoSavedLog(object : TextStore {
        override fun read() = session.get(LOG_KEY)
        override fun write(value: String?) { if (value == null) session.remove(LOG_KEY) else session.set(LOG_KEY, value) }
    }, System::currentTimeMillis)
    val processor = CaptureProcessor(
        whitelist = prefs::whitelist,
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
        onAutoSaved = { SyncScheduler.enqueue(context.applicationContext) },
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

    fun loadProfile(): AutoProfile? = try {
        session.get(PROFILE_KEY)?.let(AutoProfile::parse)
    } catch (e: Exception) {
        null
    }

    fun saveProfile(profile: AutoProfile) = session.set(PROFILE_KEY, profile.toJson())

    fun clearProfile() = session.remove(PROFILE_KEY)

    companion object {
        const val PROFILE_KEY = "auto-profile"
        const val LOG_KEY = "auto-log"
        private const val DRAFTS_KEY_ALIAS = "contigo_drafts_v1"
        private const val SESSION_KEY_ALIAS = "contigo_session_v1"

        @Volatile
        private var instance: CaptureGraph? = null

        fun get(context: Context): CaptureGraph =
            instance ?: synchronized(this) { instance ?: CaptureGraph(context.applicationContext).also { instance = it } }
    }
}
