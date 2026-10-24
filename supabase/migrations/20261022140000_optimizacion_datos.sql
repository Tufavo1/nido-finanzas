-- ---------------------------------------------------------------------------------------------
-- Optimización de datos para el plan gratuito (500 MB):
--   1. Índices para las consultas que la app hace en cada carga (evitan recorrer tablas enteras).
--   2. Limpieza diaria de lo que solo sirve unos días (intentos de invitación).
--   3. Panel admin: espacio por tabla y proyección de cuándo se llenaría la base.
-- Nunca se borran datos de las personas: gastos, metas, deudas, etc. se conservan siempre.
-- ---------------------------------------------------------------------------------------------

create index if not exists contributions_household_idx on public.contributions (household_id, created_at desc);
create index if not exists incomes_household_date_idx on public.incomes (household_id, received_on desc);
create index if not exists goals_household_idx on public.goals (household_id) where not archived;
create index if not exists invite_attempts_at_idx on public.invite_attempts (at);

-- Los intentos de invitación solo cuentan por hora: pasado un día no sirven para nada
create or replace function public.housekeeping()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from public.invite_attempts where at < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.housekeeping() from public, anon, authenticated;

-- Programarla cada madrugada si el proyecto tiene pg_cron (Supabase lo trae; en local puede no estar)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('contigo-housekeeping', '15 7 * * *', 'select public.housekeeping()');
exception when others then
  raise notice 'pg_cron no disponible (%): ejecuta public.housekeeping() a mano cuando quieras', sqlerrm;
end;
$$;

-- Panel de administración: dónde está el espacio y cuánto tardaría en llenarse
create or replace function public.admin_storage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
  v_db bigint := pg_database_size(current_database());
  v_tables jsonb;
  v_public bigint;
  v_per_day numeric := 0;
  v_t text;
  v_rows bigint;
  v_new bigint;
  v_bytes bigint;
begin
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and lower(u.email) = 'joseromeroesteban353@gmail.com' and u.email_confirmed_at is not null
  ) into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'bytes', t.bytes) order by t.bytes desc), '[]'::jsonb),
         coalesce(sum(t.bytes), 0)
    into v_tables, v_public
  from (
    select c.relname::text as name, pg_total_relation_size(c.oid) as bytes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ) t;

  -- Crecimiento: filas nuevas de los últimos 30 días x tamaño medio de una fila de cada tabla
  foreach v_t in array array['expenses', 'contributions', 'debt_payments', 'incomes']
  loop
    execute format('select count(*), count(*) filter (where created_at > now() - interval ''30 days'') from public.%I', v_t)
      into v_rows, v_new;
    execute format('select pg_total_relation_size(%L::regclass)', 'public.' || v_t) into v_bytes;
    if v_rows > 0 then
      v_per_day := v_per_day + (v_new::numeric / 30) * (v_bytes::numeric / v_rows);
    end if;
  end loop;

  return jsonb_build_object(
    'db_bytes', v_db,
    'public_bytes', v_public,
    'tables', v_tables,
    'bytes_per_day', round(v_per_day)
  );
end;
$$;

revoke all on function public.admin_storage() from public, anon;
grant execute on function public.admin_storage() to authenticated;
