#!/usr/bin/env bash
# Copyright (c) 2026 Dinovance
# QA ronda 6: gasto con debito o tarjeta (expenses.payment_method/card_debt_id) y saldo informado por el banco
# (debts.reported_balance/reported_at), en un Postgres NUEVO y DESECHABLE (no toca staging, ni produccion, ni la red).
#   bash docs/mobile/qa/e2e-ronda6.sh            # crea el contenedor, aplica TODA la cadena, prueba y lo borra
#   KEEP=1 bash docs/mobile/qa/e2e-ronda6.sh     # deja el contenedor vivo para inspeccionar (borralo despues)
# Orden: cadena hasta la migracion anterior a 20261123120000 -> siembra datos «viejos» -> aplica la migracion nueva
# (y las posteriores) -> la vuelve a aplicar (idempotencia) -> ronda 5 completa (regresion) -> ronda 6.
# Requisitos: docker y la imagen local public.ecr.aws/supabase/postgres (la misma familia que usa Supabase; trae
# el esquema auth basico, los roles anon/authenticated/service_role y auth.uid()).
# Shims minimos (no son parte de la app; los crea el servicio real en Supabase): esquema realtime (realtime.send y
# realtime.messages, que en Supabase crea el servicio Realtime), auth.jwt() y columnas de auth.users/
# auth.audit_log_entries que agrega GoTrue (email_confirmed_at, ip_address...). Todo lo demas sale de las migraciones.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
IMAGEN="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.011}"
NOMBRE="nido-qa-r6-$$"
NUEVA="20261123120000_gasto_con_tarjeta.sql"

command -v docker >/dev/null || { echo "INFO docker no disponible: no se ejecuto (el script queda listo)"; exit 3; }
docker image inspect "$IMAGEN" >/dev/null 2>&1 || { echo "INFO falta la imagen $IMAGEN (no se descarga sola): no se ejecuto"; exit 3; }

limpiar() { if [ -z "${KEEP:-}" ]; then docker rm -f "$NOMBRE" >/dev/null 2>&1 || true; else echo "INFO contenedor $NOMBRE conservado (KEEP=1)"; fi; }
trap limpiar EXIT

# Contrasena aleatoria y desechable (no se imprime). Sin red: el contenedor no publica puertos ni sale a internet.
CLAVE="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
docker run -d --name "$NOMBRE" --network none -e POSTGRES_PASSWORD="$CLAVE" "$IMAGEN" >/dev/null
for _ in $(seq 1 90); do
  docker exec "$NOMBRE" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break
  sleep 1
done
# La imagen reinicia Postgres al terminar sus scripts de inicio: esperar a que el esquema auth exista y responda.
for _ in $(seq 1 60); do
  docker exec "$NOMBRE" psql -U supabase_admin -d postgres -Atc "select 1 from pg_proc where proname='uid' and pronamespace='auth'::regnamespace" 2>/dev/null | grep -q 1 && break
  sleep 1
done

psqlq() { docker exec -i "$NOMBRE" psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 "$@"; }

psqlq <<'SQL'
-- Shims de servicios de Supabase que no son migraciones de la app
create schema if not exists realtime;
create table if not exists realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb, event text, private boolean, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ select $$;
create or replace function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
grant usage on schema realtime to authenticated, anon;
grant select on realtime.messages to authenticated;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant execute on function auth.jwt() to authenticated, anon, service_role;
-- auth.uid()/auth.role() como los deja GoTrue (leen request.jwt.claims); la imagen trae la version antigua (claim.sub)
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists deleted_at timestamptz;
alter table auth.users add column if not exists is_anonymous boolean not null default false;
alter table auth.audit_log_entries add column if not exists ip_address varchar(64) not null default '';
SQL

aplicar() {
  if ! salida=$(psqlq < "$1" 2>&1); then
    echo "FALLA migracion $(basename "$1") no aplica sobre la cadena anterior:"; echo "$salida" | tail -5
    exit 1
  fi
}
n=0
for f in "$RAIZ"/supabase/migrations/*.sql; do
  [[ "$(basename "$f")" < "$NUEVA" ]] || continue
  aplicar "$f"; n=$((n + 1))
done

# Datos «viejos»: se guardan (commit) ANTES de la migracion nueva, con las columnas de siempre.
psqlq <<'SQL'
insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000060e1', 'authenticated', 'authenticated', 'qa6-legado@example.invalid', now());
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000060e1'; h uuid; cat uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('QA6 Casa legada', 'Lea');
  reset role;
  select id into cat from public.categories where household_id = h limit 1;
  insert into public.debts (id, household_id, name, kind, original_amount)
    values ('aaaaaaaa-6060-4060-8060-0000000000d1', h, 'CMR legada', 'tarjeta', 400000);
  insert into public.expenses (id, household_id, category_id, amount, paid_by, created_by, note) values
    ('aaaaaaaa-6060-4060-8060-0000000000e1', h, cat, 1234, u, u, 'legado 1'),
    ('aaaaaaaa-6060-4060-8060-0000000000e2', h, cat, 5678, u, u, 'legado 2'),
    ('aaaaaaaa-6060-4060-8060-0000000000e3', h, cat, 9012, u, u, 'legado 3');
end $$;
SQL

for f in "$RAIZ"/supabase/migrations/*.sql; do
  [[ "$(basename "$f")" < "$NUEVA" ]] && continue
  aplicar "$f"; n=$((n + 1))
done
echo "INFO cadena aplicada: $n migraciones en un Postgres nuevo ($IMAGEN)"
aplicar "$RAIZ/supabase/migrations/$NUEVA"
echo "PASA M1 la migracion $NUEVA se aplica dos veces sin error (idempotente)"

echo "INFO --- regresion: ronda 5 ---"
docker exec -i "$NOMBRE" psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 < "$AQUI/e2e-ronda5.sql" | grep -E '^(FALLA|RESUMEN)' | sed 's/^RESUMEN/RESUMEN ronda5/'
echo "INFO --- ronda 6 ---"
docker exec -i "$NOMBRE" psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 < "$AQUI/e2e-ronda6.sql" | grep -E '^(PASA|FALLA|INFO|RESUMEN)' | sed 's/^RESUMEN/RESUMEN ronda6/'
