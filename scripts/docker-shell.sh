#!/usr/bin/env bash
# Copyright (c) 2026 Dinovance
# Shell interactivo en el contenedor de compilacion Android.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
docker compose -f docker-compose.mobile.yml --profile shell run --rm shell
