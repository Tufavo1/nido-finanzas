#!/usr/bin/env bash
# Copyright (c) 2026 Dinovance
# E2E de datos contra la base de STAGING local (contenedor nido-selfhost-db-1). Nada de produccion, sin secretos.
# Uso: bash docs/mobile/qa/e2e-datos.sh   (sale con 1 si hay algun FALLA)
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker ps --format '{{.Names}}' | grep -qx nido-selfhost-db-1 || { echo "Falta el contenedor local nido-selfhost-db-1 (staging)"; exit 2; }
SALIDA="$(docker exec -i nido-selfhost-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At < "$AQUI/e2e-datos.sql")"
echo "$SALIDA" | grep -E '^(PASA|FALLA|INFO|RESUMEN)'
echo "$SALIDA" | grep -q '^RESUMEN .* falla=0 ' || exit 1
