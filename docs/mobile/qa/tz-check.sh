#!/usr/bin/env bash
# Copyright (c) 2026 Dinovance
# Corre la prueba de zona horaria con zonas distintas de Chile (local, sin red). Esperado hoy: falla en UTC y Asia/Tokyo.
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
for tz in America/Santiago UTC Asia/Tokyo Pacific/Auckland; do
  printf '%-18s ' "$tz"
  TZ=$tz npm --prefix web test -- src/lib/spentOnTz.test.ts 2>&1 | grep -E "Tests " | sed 's/^ *//'
done
