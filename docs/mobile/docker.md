<!-- Copyright (c) 2026 Dinovance -->
# Docker para trabajo móvil (informe del agente DEVOPS)

Ver el mapa completo en `docker/README.md`.

## Funciona (visto en ejecución real)
- Imagen `nido-mobile-android-build:1` (base `node:22.12.0-bookworm`) construida; `docker compose -f docker-compose.mobile.yml config -q` válido.
- Dentro del contenedor (uid 1000): `java -version` = Temurin 21.0.13.1; `node -v` = v22.12.0; `gradle --version` = Gradle 8.14.3; `sdkmanager --version` = 12.0; `ANDROID_HOME=/opt/android-sdk` lista build-tools, cmdline-tools, licenses, platform-tools, platforms; el SDK es de solo lectura (touch falla con "Read-only file system").
- `scripts/docker-test.sh`: `npm ci` ya hecho, vitest `43 archivos, 486 tests pasados`; Kotlin reportado "PENDIENTE" (no hay native/ ni android-plugin/). Salió con rc=0.
- `scripts/docker-android-build.sh debug|release` sin `web/android`: avisa claramente y sale con rc=3.
- Compose de nido-selfhost: servicio `cloudflared` (cloudflare/cloudflared:2025.11.1, profile `tunnel`, read_only, cap_drop ALL, no-new-privileges, user 65532, sin puertos); `docker compose --profile tunnel config` válido con token vacío. Sección "Activar el túnel" añadida al README y `CLOUDFLARE_TUNNEL_TOKEN=` vacío a `.env.example`.

## No probado
- Build real de APK (debug o release): `web/android` no existe aún. No se sabe si Gradle funciona con el SDK en solo lectura (AGP puede querer escribir en él; plan B: copia de trabajo del SDK).
- Rama release/keystore: el contrato `keystore.properties` + `NIDO_KEYSTORE_PROPERTIES` debe implementarlo el build.gradle de web/android. `~/.nido-signing` no existe.
- `npx cap sync` (depende de que Capacitor esté en package.json), tests JVM Kotlin.
- El túnel nunca se levantó ni se contactó a Cloudflare; el servicio fallará sin token real. No se ejecutó `up` de nada de nido-selfhost.
- `./gradlew` descarga su distribución por red; si se quiere offline, usar el Gradle montado en /opt/gradle.

## Archivos
nido-mobile: `docker/android-build/{Dockerfile,build-in-container.sh,test-in-container.sh}`, `docker/README.md`, `docker-compose.mobile.yml`, `scripts/docker-{android-build,test,shell}.sh`, `.gitignore`. nido-selfhost: `docker-compose.yml`, `.env.example`, `README.md`.
