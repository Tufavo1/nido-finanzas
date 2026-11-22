# Copyright (c) 2026 Dinovance
# Reglas de R8 para el release. Capacitor trae sus propias reglas de consumidor; aqui solo lo propio.

# Puente Capacitor: el plugin se busca por reflexion y sus metodos se invocan por nombre desde JavaScript.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
    @android.webkit.JavascriptInterface public *;
}
-keep class cl.dinovance.contigo.plugin.** { *; }

# Componentes que el sistema instancia por nombre desde el manifiesto (el manifiesto ya los conserva; por si acaso).
-keep class cl.dinovance.contigo.capture.NotificationCaptureService
-keep class cl.dinovance.contigo.capture.DraftActionReceiver
-keep class cl.dinovance.contigo.capture.ReminderReceiver
-keep class cl.dinovance.contigo.ui.PermissionGuideActivity

# Nombres de enumeraciones que se guardan en disco (DraftStatus.valueOf) no deben renombrarse.
-keepclassmembers enum cl.dinovance.contigo.** { *; }
-keepclassmembers enum cl.nido.parser.** { *; }

# Marcos de pila legibles en CrashReport (clase.metodo(archivo:linea)); el archivo se oculta con un nombre fijo.
-keepattributes SourceFile,LineNumberTable,*Annotation*
-renamesourcefileattribute SourceFile

# Entrar con Google (Credential Manager + Sign in with Google): se instancian por reflexion desde los proveedores de Play Services.
-keep class androidx.credentials.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }
-dontwarn androidx.credentials.**
-dontwarn com.google.android.libraries.identity.googleid.**
