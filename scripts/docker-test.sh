#!/usr/bin/env bash
# Copyright (c) 2026 Dinovance
# Corre vitest (web) y tests JVM de Kotlin (si existe el modulo) en el contenedor.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
docker compose -f docker-compose.mobile.yml --profile test run --rm test
