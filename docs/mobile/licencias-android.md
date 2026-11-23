<!-- Copyright (c) 2026 Dinovance -->
# Inventario de dependencias directas de Android (licencias)

Solo lo que `web/android/app/build.gradle` añade a mano (las de Capacitor y AndroidX base están en `capacitor.build.gradle` y en `web/package-lock.json`). Versiones fijas.

| Dependencia | Versión | Licencia | Uso |
|---|---|---|---|
| `androidx.work:work-runtime` | 2.9.1 | Apache-2.0 | Envío de gastos en segundo plano |
| `androidx.credentials:credentials` | 1.3.0 | Apache-2.0 | Credential Manager: selector de cuentas de Google |
| `androidx.credentials:credentials-play-services-auth` | 1.3.0 | Apache-2.0 | Proveedor de Credential Manager por Google Play Services |
| `com.google.android.libraries.identity.googleid:googleid` | 1.1.1 | Apache-2.0 | Sign in with Google (token de identidad) |

Reglas de R8 para las dos últimas: `web/android/app/proguard-rules.pro`.
