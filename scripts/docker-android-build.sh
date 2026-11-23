#!/usr/bin/env bash
# Copyright (c) 2026 Dinovance
# Uso: scripts/docker-android-build.sh [debug|release]
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODO="${1:-debug}"
case "$MODO" in debug|release) ;; *) echo "Uso: $0 [debug|release]" >&2; exit 2;; esac
cd "$RAIZ"

if [ ! -d web/android ]; then
  echo "AVISO: todavia no existe web/android (el proyecto Capacitor lo crean otros agentes)." >&2
  echo "       Nada que compilar. Cuando exista, vuelve a ejecutar este script." >&2
  exit 3
fi

EXTRA=()
if [ "$MODO" = "release" ]; then
  FIRMA="${NIDO_SIGNING_DIR:-$HOME/.nido-signing}"
  if [ ! -d "$FIRMA" ] || [ ! -f "$FIRMA/keystore.properties" ]; then
    echo "ERROR: build release requiere un keystore fuera del repo en $FIRMA" >&2
    echo "       Debe contener keystore.properties (storeFile, storePassword, keyAlias, keyPassword)" >&2
    echo "       y el archivo .jks que referencia (storeFile=/signing/<archivo>.jks)." >&2
    echo "       Crealo tu (keytool) con permisos 700 y respaldalo; este script no lo crea ni lo lee." >&2
    echo "       Alternativa: otra carpeta con NIDO_SIGNING_DIR=/ruta." >&2
    exit 4
  fi
  EXTRA=(-v "$FIRMA:/signing:ro,z")
fi

mkdir -p dist-apk
NIDO_BUILD_MODE="$MODO" docker compose -f docker-compose.mobile.yml --profile build \
  run --rm "${EXTRA[@]}" build
echo "Listo: dist-apk/nido-$MODO.apk (+ .sha256)"
