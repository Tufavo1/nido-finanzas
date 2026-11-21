// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import android.app.Application
import cl.dinovance.contigo.diagnostics.CrashRecorder

class ContigoApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashRecorder.install(this)
    }
}
