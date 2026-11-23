// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.sync

import android.app.Activity
import android.app.Application
import android.os.Bundle
import java.util.concurrent.atomic.AtomicInteger

/** Cuenta las pantallas visibles: con la app abierta, la sesion la renueva supabase-js y no el segundo plano. */
object ForegroundTracker : Application.ActivityLifecycleCallbacks {
    private val started = AtomicInteger(0)

    fun isForeground(): Boolean = started.get() > 0

    override fun onActivityStarted(activity: Activity) { started.incrementAndGet() }
    override fun onActivityStopped(activity: Activity) { started.updateAndGet { maxOf(0, it - 1) } }
    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
    override fun onActivityResumed(activity: Activity) {}
    override fun onActivityPaused(activity: Activity) {}
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
    override fun onActivityDestroyed(activity: Activity) {}
}
