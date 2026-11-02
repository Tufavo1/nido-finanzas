#!/usr/bin/env bash
# Prueba de restauración: descifra un respaldo, lo carga en una base TEMPORAL del Supabase local
# (contenedor supabase_db_nido; arráncalo con `supabase start`) y comprueba que hay datos. Luego borra la base temporal.
# Nunca toca producción ni la base local de trabajo.
#
# Uso: BACKUP_PASSPHRASE_FILE=~/.contigo-backup-key ./scripts/restore-test.sh ~/respaldos-contigo/contigo-XXXX.dump.gpg
set -euo pipefail

file="${1:?Indica el respaldo .dump.gpg}"
: "${BACKUP_PASSPHRASE_FILE:?Falta BACKUP_PASSPHRASE_FILE}"
c="${PG_CONTAINER:-supabase_db_nido}"
db="restore_test_$$"
tmp=$(mktemp)
trap 'rm -f "$tmp"; docker exec "$c" psql -U supabase_admin -d postgres -qc "drop database if exists $db" >/dev/null 2>&1 || true' EXIT

if [ -f "$file.sha256" ]; then
  (cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256") || { echo "La suma de verificación no coincide: el respaldo está dañado" >&2; exit 1; }
fi
gpg --batch --quiet --decrypt --passphrase-file "$BACKUP_PASSPHRASE_FILE" --pinentry-mode loopback "$file" > "$tmp"

docker exec "$c" psql -U supabase_admin -d postgres -qc "create database $db"
# El respaldo solo trae `public`; sus tablas apuntan a auth.users, así que se crea un esquema auth mínimo
docker exec -i "$c" psql -U supabase_admin -d "$db" -q -v ON_ERROR_STOP=1 <<'SQL'
drop schema public cascade;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
SQL
# Las llaves foráneas hacia auth.users no se pueden cumplir sin los usuarios reales (viven en el esquema auth, que no va en este
# respaldo): se toleran SOLO esas. Cualquier otro error hace fallar la prueba.
err=$(mktemp)
docker exec -i "$c" pg_restore -U supabase_admin -d "$db" --no-owner --no-privileges --disable-triggers < "$tmp" 2> "$err" || true
total=$(grep -c '^pg_restore: error:' "$err" || true)
fk=$(grep -c 'REFERENCES auth.users' "$err" || true)
rm -f "$err.ok"
if [ "$total" -gt "$fk" ]; then
  echo "La restauración tuvo errores distintos a las llaves hacia auth.users:" >&2
  grep -v 'auth.users' "$err" | head -20 >&2
  rm -f "$err"; exit 1
fi
rm -f "$err"
echo "Errores tolerados (llaves hacia auth.users): $fk"

echo "Tablas restauradas y filas:"
docker exec -i "$c" psql -U supabase_admin -d "$db" -tA <<'SQL'
select format('%-28s %s', relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', relname), false, true, '')))[1]::text)
  from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;
SQL
n=$(docker exec "$c" psql -U supabase_admin -d "$db" -tAc "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r'")
[ "$n" -ge 10 ] || { echo "Se restauraron solo $n tablas: el respaldo parece incompleto" >&2; exit 1; }
echo "OK: respaldo restaurado ($n tablas). Base temporal eliminada."
