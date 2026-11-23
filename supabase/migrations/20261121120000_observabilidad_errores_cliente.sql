-- Copyright (c) 2026 Dinovance
-- ---------------------------------------------------------------------------------------------
-- Observabilidad (1/2): errores de la app (web y Android) anonimizados.
--   · client_errors: solo códigos tipados, versión, pantalla y correlación. Sin mensajes, sin montos,
--     sin correos ni textos de avisos. El «quién» es un resumen irreversible (reporter_key), solo para limitar la tasa.
--   · La app NO inserta directo: usa report_client_error(), con validación estricta y límite de tasa.
--   · RLS: solo administradores con segundo factor (aal2) leen. Nadie edita ni borra (privilegios + disparador).
-- ---------------------------------------------------------------------------------------------

-- ¿Quien llama es administrador con aal2? Se usa en las políticas (is_admin() no es ejecutable por authenticated).
create function public.obs_can_read()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.admin_status() = 'ok' $$;
revoke all on function public.obs_can_read() from public, anon;
grant execute on function public.obs_can_read() to authenticated;

create table public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null check (source in ('web', 'android', 'ios')),
  app_version text not null check (app_version ~ '^[0-9A-Za-z._+-]{1,32}$'),
  screen text check (screen ~ '^[A-Za-z0-9_/.-]{1,64}$'),
  error_code text not null check (error_code ~ '^[A-Z0-9_]{2,48}$'),
  correlation_id text check (correlation_id ~ '^[0-9A-Fa-f-]{8,64}$'),
  -- Solo marcos de pila «clase.método(Archivo.kt:12)», uno por línea y sin espacios (nunca el mensaje de la excepción)
  stack_top text check (length(stack_top) <= 1500 and stack_top ~ '^([A-Za-z_][A-Za-z0-9_.$<>]*(\([A-Za-z0-9_.]*(:[0-9]+)?\))?(\n|$))+$'),
  reporter_key text not null
);
create index client_errors_at_idx on public.client_errors (at desc);
create index client_errors_rate_idx on public.client_errors (reporter_key, at desc);

alter table public.client_errors enable row level security;
alter table public.client_errors force row level security;
revoke all on table public.client_errors from public, anon, authenticated;
grant select on table public.client_errors to authenticated;
create policy client_errors_admin_read on public.client_errors
  for select to authenticated using (public.obs_can_read());

-- Registro de solo agregar: ni UPDATE ni DELETE, salvo la limpieza por antigüedad (purge_observability)
create function public.obs_append_only()
returns trigger
language plpgsql
as $$
begin
  if current_setting('nido.purge', true) = 'on' and tg_op = 'DELETE' then
    return old;
  end if;
  raise exception 'La tabla % es de solo agregar', tg_table_name using errcode = '42501';
end;
$$;
create trigger client_errors_append_only
  before update or delete on public.client_errors
  for each row execute function public.obs_append_only();
create trigger client_errors_no_truncate
  before truncate on public.client_errors
  for each statement execute function public.obs_append_only();

create function public.report_client_error(
  p_source text,
  p_app_version text,
  p_screen text,
  p_error_code text,
  p_correlation_id text default null,
  p_stack_top text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_source is null or p_source not in ('web', 'android', 'ios')
     or p_app_version is null or p_app_version !~ '^[0-9A-Za-z._+-]{1,32}$'
     or (p_screen is not null and p_screen !~ '^[A-Za-z0-9_/.-]{1,64}$')
     or p_error_code is null or p_error_code !~ '^[A-Z0-9_]{2,48}$'
     or (p_correlation_id is not null and p_correlation_id !~ '^[0-9A-Fa-f-]{8,64}$')
     or (p_stack_top is not null and (length(p_stack_top) > 1500 or p_stack_top !~ '^([A-Za-z_][A-Za-z0-9_.$<>]*(\([A-Za-z0-9_.]*(:[0-9]+)?\))?(\n|$))+$'))
  then
    raise exception 'Reporte inválido' using errcode = '22023';
  end if;

  v_key := case when auth.uid() is null then 'anon'
                else substr(encode(sha256(convert_to(auth.uid()::text, 'UTF8')), 'hex'), 1, 16) end;

  -- Límite de tasa: 30 reportes cada 10 minutos por persona (las sesiones anónimas comparten un cupo).
  -- Si se pasa, se descarta en silencio para que la app no entre en un ciclo de reintentos.
  if (select count(*) from public.client_errors where reporter_key = v_key and at > now() - interval '10 minutes') >= 30 then
    return;
  end if;

  insert into public.client_errors (source, app_version, screen, error_code, correlation_id, stack_top, reporter_key)
  values (p_source, p_app_version, p_screen, p_error_code, p_correlation_id, p_stack_top, v_key);
end;
$$;
revoke all on function public.report_client_error(text, text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated;

-- Limpieza por antigüedad (90 días). La invoca el administrador de la base o un trabajo programado; no se expone a la API.
create function public.purge_observability(p_days int default 90)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('nido.purge', 'on', true);
  delete from public.client_errors where at < now() - make_interval(days => greatest(p_days, 30));
  perform set_config('nido.purge', 'off', true);
end;
$$;
revoke all on function public.purge_observability(int) from public, anon, authenticated;
