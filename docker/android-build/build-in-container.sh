#!/usr/bin/env bash
# Copyright (c) 2026 Dinovance
# Se ejecuta DENTRO del contenedor. Modo por NIDO_BUILD_MODE (debug|release).
set -euo pipefail
MODE="${NIDO_BUILD_MODE:-debug}"
cd /work/web
if [ ! -d android ]; then
  echo "ERROR: no existe web/android (proyecto Capacitor aun no creado)." >&2
  exit 20
fi
if [ ! -d node_modules ]; then echo ">> npm ci (web/)"; npm ci; else echo ">> node_modules ya existe: se omite npm ci"; fi
echo ">> build de Vite"; npm run build
echo ">> cap sync android"; npx cap sync android
cd android
[ -x ./gradlew ] || { echo "ERROR: web/android/gradlew no existe o no es ejecutable." >&2; exit 21; }
if [ "$MODE" = "release" ]; then
  [ -f /signing/keystore.properties ] || { echo "ERROR: falta /signing/keystore.properties" >&2; exit 22; }
  export NIDO_KEYSTORE_PROPERTIES=/signing/keystore.properties
  TASK=assembleRelease
else
  TASK=assembleDebug
fi
echo ">> ./gradlew $TASK"
./gradlew --no-daemon "$TASK"
mkdir -p /work/dist-apk
APK="$(find app/build/outputs/apk/"$MODE" -name '*.apk' | sort | head -1)"
[ -n "$APK" ] || { echo "ERROR: Gradle termino pero no hay APK en app/build/outputs/apk/$MODE" >&2; exit 23; }
DEST="/work/dist-apk/nido-$MODE.apk"
cp "$APK" "$DEST"
( cd /work/dist-apk && sha256sum "nido-$MODE.apk" > "nido-$MODE.apk.sha256" )
echo ">> APK: dist-apk/nido-$MODE.apk"; cat "$DEST.sha256"
