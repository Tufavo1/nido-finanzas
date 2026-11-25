<!-- Copyright (c) 2026 Dinovance -->
# Mapa de contenedores (todo local, solo 127.0.0.1)

| Contenedor | Dónde | Para qué | Puertos |
|---|---|---|---|
| Pila de staging (`nido-selfhost-*`: db, auth, rest, realtime, gateway/Kong, mailpit) | `<ruta local>/nido-selfhost` (`make up`) | Backend Supabase local contra el que prueba la app | 127.0.0.1:55321 gateway (API), :55322 Postgres, :55324 Mailpit |
| `nido-mobile-android-build` (servicios `build`, `test`, `shell`) | `docker-compose.mobile.yml` | Compila APK y corre vitest + tests JVM Kotlin | ninguno publicado |
| `cloudflared` (opcional, profile `tunnel`) | `nido-selfhost/docker-compose.yml` | Túnel Cloudflare hacia `http://gateway:8000` | ninguno publicado (conexión saliente); NO activado |

## Cómo se encadenan
1. `make up` en nido-selfhost levanta el staging; la app (en el emulador/dispositivo, o el build de Vite) apunta a `http://127.0.0.1:55321` (desde el emulador Android: `10.0.2.2:55321`).
2. `scripts/docker-android-build.sh [debug|release]` compila en el contenedor de build (no necesita la pila).
3. `scripts/docker-test.sh` corre los tests en el contenedor de build.
4. El túnel es independiente y solo se activa a mano (`docker compose --profile tunnel up -d cloudflared` en nido-selfhost, siguiendo su README "Activar el túnel"); comparte la red del compose con el gateway.

## Contenedor de build
- Imagen: `node:22.12.0-bookworm` (fija), sin JDK/SDK/licencias propias. Usuario uid 1000.
- Montajes de solo lectura desde el host: JDK 21 (`NIDO_JDK_DIR`, def. `~/dev/jdk-21`), Gradle 8.14.3 (`NIDO_GRADLE_DIR`), SDK (`NIDO_ANDROID_SDK_DIR`, def. `~/Android/Sdk`). Repo en `/work` (`:z` por SELinux).
- Cachés en volúmenes con nombre: `nido-mobile_nido-gradle-cache`, `nido-mobile_nido-npm-cache`.
- Release: keystore fuera del repo en `~/.nido-signing/` (`NIDO_SIGNING_DIR`), montado en `/signing` solo lectura. Convención: `keystore.properties` (storeFile, storePassword, keyAlias, keyPassword) + `.jks`; el Gradle de `web/android` debe leer `NIDO_KEYSTORE_PROPERTIES`.
- Salida: `dist-apk/nido-<modo>.apk` y `.sha256`.

## Comandos
```
scripts/docker-shell.sh                 # shell interactivo
scripts/docker-test.sh                  # vitest + Kotlin JVM (si existe native/ o android-plugin/)
scripts/docker-android-build.sh debug   # APK debug
scripts/docker-android-build.sh release # APK firmado (requiere ~/.nido-signing)
docker compose -f docker-compose.mobile.yml --profile build build   # reconstruir imagen
```

## Observabilidad (nido-selfhost, profile `observability`)
Loki, Alloy, Prometheus, Grafana (127.0.0.1:55330), ntfy (127.0.0.1:55332), sec-ingest; syslog UDP 127.0.0.1:55340. Detalle en `docs/mobile/observabilidad-infra.md`.
