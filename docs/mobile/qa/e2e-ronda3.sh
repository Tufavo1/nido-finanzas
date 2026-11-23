#!/usr/bin/env bash
# Copyright (c) 2026 Dinovance
# QA ronda 3 contra la base de STAGING local (rol supabase_admin, necesario para SET ROLE sec_ingest). ROLLBACK al final.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker exec -i nido-selfhost-db-1 psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 < "$AQUI/e2e-ronda3.sql" | grep -E '^(PASA|FALLA|INFO|RESUMEN)'
