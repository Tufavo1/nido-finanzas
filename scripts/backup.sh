#!/usr/bin/env bash
# Respaldo cifrado de la base de datos (schema `public`: hogares, gastos, deudas, metas…).
#
# Uso:
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<clave>@aws-0-<región>.pooler.supabase.com:5432/postgres' \
#   BACKUP_PASSPHRASE_FILE=~/.contigo-backup-key \
#   ./scripts/backup.sh [carpeta-destino]
#
# - La conexión viene de la variable de entorno (nunca se escribe en el repositorio).
# - El archivo queda cifrado con AES-256 (gpg, clave en un archivo aparte con permisos 600) y con permisos 600.
# - Guarda la clave en un lugar distinto al respaldo (gestor de contraseñas).
# - Retención: se borran los respaldos de más de RETENTION_DAYS días (por defecto 90).
set -euo pipefail

: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL (cadena de conexión de Supabase)}"
: "${BACKUP_PASSPHRASE_FILE:?Falta BACKUP_PASSPHRASE_FILE (archivo con la clave de cifrado)}"
[ -r "$BACKUP_PASSPHRASE_FILE" ] || { echo "No puedo leer $BACKUP_PASSPHRASE_FILE" >&2; exit 1; }
perm=$(stat -c '%a' "$BACKUP_PASSPHRASE_FILE")
[ "$perm" = "600" ] || [ "$perm" = "400" ] || { echo "El archivo de clave debe tener permisos 600 (hoy $perm)" >&2; exit 1; }

dest="${1:-$HOME/respaldos-contigo}"
days="${RETENTION_DAYS:-90}"
umask 077
mkdir -p "$dest"
stamp=$(date +%Y%m%d-%H%M%S)
out="$dest/contigo-$stamp.dump.gpg"

# pg_dump local si existe; si no, el de una imagen oficial de PostgreSQL
if command -v pg_dump >/dev/null 2>&1; then
  dump() { pg_dump "$SUPABASE_DB_URL" --schema=public --format=custom --no-owner --no-privileges; }
else
  dump() { docker run --rm --network host postgres:17 pg_dump "$SUPABASE_DB_URL" --schema=public --format=custom --no-owner --no-privileges; }
fi

dump | gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --passphrase-file "$BACKUP_PASSPHRASE_FILE" --pinentry-mode loopback -o "$out"
chmod 600 "$out"
size=$(stat -c '%s' "$out")
[ "$size" -gt 1024 ] || { echo "El respaldo salió demasiado pequeño ($size bytes): algo falló" >&2; rm -f "$out"; exit 1; }
sha256sum "$out" | tee "$out.sha256" >/dev/null

find "$dest" -name 'contigo-*.dump.gpg*' -mtime "+$days" -delete
echo "Respaldo listo: $out ($size bytes). Prueba restaurarlo con scripts/restore-test.sh"
