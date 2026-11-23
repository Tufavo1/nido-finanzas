#!/usr/bin/env bash
# Copyright (c) 2026 Dinovance
# Se ejecuta DENTRO del contenedor: vitest de web + tests JVM de Kotlin si existe el modulo.
set -euo pipefail
cd /work/web
[ -f node_modules/.package-lock.json ] || { echo ">> npm ci (web/)"; npm ci; }
echo ">> vitest"; npm test
echo ">> Tests JVM de Kotlin"
FOUND=""
for d in /work/native /work/android-plugin /work/web/native /work/web/android-plugin; do
  if [ -x "$d/gradlew" ] || [ -f "$d/build.gradle.kts" ]; then
    FOUND="$d"; break
  fi
done
if [ -z "$FOUND" ]; then
  echo "Kotlin: PENDIENTE (no hay native/ ni android-plugin/ con gradlew o build.gradle.kts)"
else
  cd "$FOUND"
  if [ -x ./gradlew ]; then ./gradlew --no-daemon test; else gradle --no-daemon test; fi
  echo "Kotlin: tests ejecutados en $FOUND"
fi
