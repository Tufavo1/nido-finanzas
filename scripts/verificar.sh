#!/usr/bin/env bash
# Verificación local única para humanos y agentes. NO toca producción ni la red.
# Corre lint, tsc, tests unitarios y (si el contenedor local está activo) las pruebas SQL.
# Imprime líneas "RESULTADO ..." que pueden copiarse tal cual en un reporte.
cd "$(dirname "$0")/.." || exit 1
fallos=0
paso() { # nombre, comando...
  local n="$1"; shift
  if salida=$("$@" 2>&1); then
    echo "RESULTADO $n: OK"
  else
    echo "RESULTADO $n: FALLÓ"; echo "$salida" | tail -25; fallos=$((fallos+1))
  fi
}
paso lint npm --prefix web run lint
paso tsc  npm --prefix web exec -- tsc -b web
if salida=$(npm --prefix web test 2>&1); then
  echo "RESULTADO tests: OK ($(echo "$salida" | grep -E '^\s+Tests ' | sed 's/^ *//'))"
else
  echo "RESULTADO tests: FALLÓ"; echo "$salida" | tail -30; fallos=$((fallos+1))
fi
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx supabase_db_nido; then
  paso test-sql npm --prefix web run test:db
else
  echo "RESULTADO test-sql: OMITIDO (contenedor local supabase_db_nido no está activo)"
fi
echo "--- git status ---"; git status --short
echo "--- git diff --stat ---"; git diff --stat
[ "$fallos" -eq 0 ] && echo "RESUMEN: sin fallos en lo ejecutado" || echo "RESUMEN: $fallos verificación(es) fallaron"
exit "$fallos"
