// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import android.content.Context
import cl.dinovance.contigo.security.AtomicFileStorage
import cl.dinovance.contigo.security.KeystoreAesGcm
import cl.dinovance.contigo.security.SecureKeyValueStore
import java.io.File
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
    )

    companion object {
        private const val DRAFTS_KEY_ALIAS = "contigo_drafts_v1"
        private const val SESSION_KEY_ALIAS = "contigo_session_v1"

        @Volatile
        private var instance: CaptureGraph? = null

        fun get(context: Context): CaptureGraph =
            instance ?: synchronized(this) { instance ?: CaptureGraph(context.applicationContext).also { instance = it } }
    }
}
