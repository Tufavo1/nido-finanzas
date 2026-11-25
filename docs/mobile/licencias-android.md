<!-- Copyright (c) 2026 Dinovance -->
# Inventario de dependencias directas de Android (licencias)

Solo lo que `web/android/app/build.gradle` añade a mano (las de Capacitor y AndroidX base están en `capacitor.build.gradle` y en `web/package-lock.json`). Versiones fijas.

| Dependencia | Versión | Licencia | Uso |
|---|---|---|---|
| `androidx.work:work-runtime` | 2.9.1 | Apache-2.0 | Envío de gastos en segundo plano |
| `androidx.credentials:credentials` | 1.3.0 | Apache-2.0 | Credential Manager: selector de cuentas de Google |
| `androidx.credentials:credentials-play-services-auth` | 1.3.0 | Apache-2.0 | Proveedor de Credential Manager por Google Play Services |
| `com.google.android.libraries.identity.googleid:googleid` | 1.1.1 | Apache-2.0 | Sign in with Google (token de identidad) |
| `androidx.appcompat:appcompat` | 1.7.1 (`androidxAppCompatVersion`) | Apache-2.0 (por documentación, no verificado offline) | Base de Activity/tema de la app |
| `androidx.coordinatorlayout:coordinatorlayout` | 1.3.0 (`androidxCoordinatorLayoutVersion`) | Apache-2.0 (por documentación, no verificado offline) | Diseño de vistas con coordinación de gestos |
| `androidx.core:core-splashscreen` | 1.2.0 (`coreSplashScreenVersion`) | Apache-2.0 (por documentación, no verificado offline) | Pantalla de inicio del sistema |
| `androidx.core:core-ktx` | 1.17.0 (`androidxCoreVersion`) | Apache-2.0 (por documentación, no verificado offline) | Extensiones de Kotlin para AndroidX core |

Las cuatro AndroidX de la tabla están declaradas en `web/android/app/build.gradle:83-87`; sus versiones se leen de `web/android/variables.gradle`.

Reglas de R8 para las dos últimas: `web/android/app/proguard-rules.pro`.
