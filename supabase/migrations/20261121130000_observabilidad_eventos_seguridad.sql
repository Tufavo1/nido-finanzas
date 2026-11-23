-- Copyright (c) 2026 Dinovance
-- ---------------------------------------------------------------------------------------------
-- Observabilidad (2/2): eventos de seguridad propios y security_overview() para el panel.
--   · security_events: eventos que GoTrue no deja en su registro (cambio de rol, permiso del servicio de
--     notificaciones revocado, cola de push atascada y, cuando exista la ingesta de Kong, fallos y bloqueos de login).
--   · security_overview(p_hours): JSON solo para administradores con aal2. Combina auth.audit_log_entries,
--     security_events y client_errors. Entrega indicios y alertas; NO garantiza detectar todo ataque.
-- Requiere 20261121120000_observabilidad_errores_cliente.sql.
-- ---------------------------------------------------------------------------------------------

create table public.security_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('login_failed', 'login_blocked', 'mfa_failed', 'role_change', 'listener_revoked', 'push_queue_stuck')),
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  -- Resumen irreversible de la cuenta; nunca correo ni IP completa
  actor_hint text check (actor_hint ~ '^[A-Za-z0-9_]{1,24}$'),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 1024)
);
create index security_events_at_idx on public.security_events (at desc);

alter table public.security_events enable row level security;
alter table public.security_events force row level security;
revoke all on table public.security_events from public, anon, authenticated;
grant select on table public.security_events to authenticated;
create policy security_events_admin_read on public.security_events
  for select to authenticated using (public.obs_can_read());

create trigger security_events_append_only
  before update or delete on public.security_events
  for each row execute function public.obs_append_only();
create trigger security_events_no_truncate
  before truncate on public.security_events
  for each statement execute function public.obs_append_only();

-- Uso interno (disparadores y funciones del servidor): no se expone a la API
create function public.record_security_event(p_kind text, p_severity text, p_actor_hint text, p_detail jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.security_events (kind, severity, actor_hint, detail) values (p_kind, p_severity, p_actor_hint, p_detail)
$$;
revoke all on function public.record_security_event(text, text, text, jsonb) from public, anon, authenticated;

create function public.actor_hint(p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$ select case when p_id is null then null else 'u_' || substr(encode(sha256(convert_to(p_id::text, 'UTF8')), 'hex'), 1, 8) end $$;
revoke all on function public.actor_hint(uuid) from public, anon, authenticated;

-- Cambios en la lista de administradores = cambio de rol
create function public.admins_audit_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_security_event('role_change', 'high', public.actor_hint(new.user_id), '{"to":"admin"}'::jsonb);
    return new;
  end if;
  perform public.record_security_event('role_change', 'medium', public.actor_hint(old.user_id), '{"to":"user"}'::jsonb);
  return old;
end;
$$;
create trigger admins_role_change
  after insert or delete on public.admins
  for each row execute function public.admins_audit_role();

-- Los reportes de la app que son eventos de seguridad quedan también en security_events
create or replace function public.report_client_error(
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
  v_before bigint;
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

  if (select count(*) from public.client_errors where reporter_key = v_key and at > now() - interval '10 minutes') >= 30 then
    return;
  end if;

  insert into public.client_errors (source, app_version, screen, error_code, correlation_id, stack_top, reporter_key)
  values (p_source, p_app_version, p_screen, p_error_code, p_correlation_id, p_stack_top, v_key);

  if p_error_code = 'LISTENER_REVOKED' then
    perform public.record_security_event('listener_revoked', 'low', public.actor_hint(auth.uid()), jsonb_build_object('source', p_source));
  elsif p_error_code = 'PUSH_QUEUE_STUCK' then
    perform public.record_security_event('push_queue_stuck', 'medium', null, jsonb_build_object('source', p_source));
  end if;
end;
$$;
revoke all on function public.report_client_error(text, text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated;

-- Registro de GoTrue en la ventana, con la IP enmascarada y la cuenta como resumen irreversible. Uso interno.
create function public.so_audit_window(p_since timestamptz)
returns table (at timestamptz, action text, actor text, hint text, ip text, new_device boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.created_at,
         a.payload ->> 'action',
         a.payload ->> 'actor_id',
         public.actor_hint(nullif(a.payload ->> 'actor_id', '')::uuid),
         case when position(':' in a.ip_address) > 0 then split_part(a.ip_address, ':', 1) || ':****'
              else regexp_replace(a.ip_address, '\d+$', '0') end,
         -- Dispositivo nuevo: la persona ya había entrado antes, pero nunca desde esta IP en 30 días
         (a.payload ->> 'action') = 'login'
           and exists (select 1 from auth.audit_log_entries b
                       where b.payload ->> 'actor_id' = a.payload ->> 'actor_id' and b.payload ->> 'action' = 'login'
                         and b.created_at < a.created_at and b.created_at > a.created_at - interval '30 days')
           and not exists (select 1 from auth.audit_log_entries b
                       where b.payload ->> 'actor_id' = a.payload ->> 'actor_id' and b.payload ->> 'action' = 'login'
                         and b.ip_address = a.ip_address
                         and b.created_at < a.created_at and b.created_at > a.created_at - interval '30 days')
  from auth.audit_log_entries a
  where a.created_at >= p_since
$$;
revoke all on function public.so_audit_window(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- security_overview: {generated_at, counters, alerts[], events[], health, limits}
-- ---------------------------------------------------------------------------------------------
create function public.security_overview(p_hours int default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hours int := least(greatest(coalesce(p_hours, 24), 1), 168);
  v_since timestamptz := now() - make_interval(hours => v_hours);
  v_burst timestamptz := now() - interval '10 minutes';
  v_counters jsonb;
  v_alerts jsonb;
  v_events jsonb;
  v_health jsonb;
  v_last_audit timestamptz;
  v_5xx bigint;
  v_stuck bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores con segundo factor' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'login_ok', (select count(*) from public.so_audit_window(v_since) where action = 'login'),
    'login_failed_blocked', (select count(*) from public.security_events where at >= v_since and kind in ('login_failed', 'login_blocked')),
    'mfa_challenges', (select count(*) from public.so_audit_window(v_since) where action = 'challenge_created'),
    'mfa_failed', (select count(*) from public.security_events where at >= v_since and kind = 'mfa_failed'),
    'new_device', (select count(*) from public.so_audit_window(v_since) where new_device),
    'recoveries', (select count(*) from public.so_audit_window(v_since) where action = 'user_recovery_requested'),
    'password_changes', (select count(*) from public.so_audit_window(v_since) where action = 'user_updated_password'),
    'signups', (select count(*) from public.so_audit_window(v_since) where action = 'user_signedup'),
    'repeated_signups', (select count(*) from public.so_audit_window(v_since) where action = 'user_repeated_signup'),
    'role_changes', (select count(*) from public.security_events where at >= v_since and kind = 'role_change'),
    'listener_revoked', (select count(*) from public.security_events where at >= v_since and kind = 'listener_revoked'),
    'client_errors', (select count(*) from public.client_errors where at >= v_since)
  ) into v_counters;

  with raw (severity, kind, title, detail, at) as (
    -- Fuerza bruta: fallos de login del mismo usuario (requiere la ingesta de fallos; ver «limits»)
    select case when count(*) >= 20 then 'critical' else 'high' end, 'brute_force', 'Posible fuerza bruta',
           count(*) || ' intentos fallidos de la misma cuenta en 10 minutos', max(at)
      from public.security_events where at >= v_burst and kind in ('login_failed', 'login_blocked') group by actor_hint having count(*) >= 5
    union all
    select 'high', 'mfa_repeated_failure', 'Fallos repetidos del segundo factor',
           count(*) || ' códigos incorrectos de la misma cuenta en 10 minutos', max(at)
      from public.security_events where at >= v_burst and kind = 'mfa_failed' group by actor_hint having count(*) >= 3
    union all
    select 'medium', 'account_enumeration', 'Registros repetidos de correos existentes',
           count(*) || ' intentos en 10 minutos (posible sondeo de cuentas)', max(at)
      from public.so_audit_window(v_since) where action = 'user_repeated_signup' and at >= v_burst having count(*) >= 10
    union all
    select 'medium', 'recovery_burst', 'Muchas recuperaciones de contraseña',
           count(*) || ' solicitudes en 10 minutos', max(at)
      from public.so_audit_window(v_since) where action = 'user_recovery_requested' and at >= v_burst having count(*) >= 5
    union all
    select 'high', 'multiple_locations', 'Acceso desde varios lugares a la vez',
           count(distinct ip) || ' redes distintas en 10 minutos (' || hint || ')', max(at)
      from public.so_audit_window(v_since) where action = 'login' and at >= v_burst group by hint having count(distinct ip) >= 3
    union all
    select 'medium', 'new_device', 'Inicio de sesión desde un lugar nuevo',
           hint || ' entró desde una red que no se veía en 30 días (' || ip || ')', at
      from public.so_audit_window(v_since) where new_device
    union all
    select case when detail ->> 'to' = 'admin' then 'high' else 'medium' end, 'privilege_escalation', 'Cambio en la lista de administradores',
           coalesce(actor_hint, 'cuenta') || ' pasó a ' || coalesce(detail ->> 'to', '?'), at
      from public.security_events where at >= v_since and kind = 'role_change'
    union all
    select 'low', 'listener_revoked', 'Permiso de lectura de notificaciones revocado',
           'Una app dejó de capturar avisos (' || coalesce(detail ->> 'source', '?') || ')', at
      from public.security_events where at >= v_since and kind = 'listener_revoked'
    union all
    select 'medium', 'client_error_spike', 'Pico de errores en la app',
           count(*) || ' reportes ' || error_code || ' en 15 minutos', max(at)
      from public.client_errors where at >= now() - interval '15 minutes' group by error_code having count(*) >= 20
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', md5(kind || at::text || detail), 'severity', severity, 'kind', kind, 'title', title, 'detail', detail, 'at', at)
         order by case severity when 'critical' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end desc, at desc), '[]'::jsonb)
    into v_alerts from raw;

  select coalesce(jsonb_agg(e order by (e ->> 'at') desc), '[]'::jsonb) into v_events from (
    select * from (
      select jsonb_build_object('id', 'a-' || md5(s.at::text || s.action || coalesce(s.actor, '')), 'at', s.at,
               'kind', m.kind, 'severity', m.severity, 'actor_hint', s.hint, 'detail', m.detail || ' (' || s.ip || ')') as e
        from public.so_audit_window(v_since) s
        join (values
          ('login', 'login_ok', 'info', 'Inicio de sesión'),
          ('logout', 'logout', 'info', 'Cierre de sesión'),
          ('challenge_created', 'mfa_challenge', 'info', 'Desafío de segundo factor'),
          ('factor_in_progress', 'mfa_enroll', 'low', 'Alta de segundo factor en curso'),
          ('user_updated_password', 'password_change', 'medium', 'Cambio de contraseña'),
          ('user_modified', 'account_modified', 'low', 'Datos de la cuenta modificados'),
          ('user_recovery_requested', 'recovery', 'low', 'Recuperación de contraseña solicitada'),
          ('user_repeated_signup', 'repeated_signup', 'low', 'Registro repetido de un correo existente'),
          ('user_signedup', 'signup', 'info', 'Cuenta nueva'),
          ('token_revoked', 'token_revoked', 'low', 'Sesión revocada')
        ) as m (action, kind, severity, detail) on m.action = s.action
      union all
      select jsonb_build_object('id', 's-' || id, 'at', at, 'kind', kind, 'severity', severity, 'actor_hint', actor_hint,
               'detail', coalesce(detail ->> 'to', detail ->> 'source', kind))
        from public.security_events where at >= v_since
      union all
      select jsonb_build_object('id', 'c-' || id, 'at', at, 'kind', 'client_error', 'severity', 'info', 'actor_hint', null,
               'detail', error_code || ' en ' || source || ' ' || app_version)
        from public.client_errors where at >= v_since
    ) u order by (e ->> 'at') desc limit 100
  ) x;

  select max(at) into v_last_audit from public.so_audit_window(v_since);
  select count(*) into v_5xx from public.client_errors
    where at >= now() - interval '15 minutes' and error_code in ('SERVER', 'TIMEOUT', 'OFFLINE', 'MAINTENANCE');
  select count(*) into v_stuck from public.security_events where at >= now() - interval '1 hour' and kind = 'push_queue_stuck';

  v_health := jsonb_build_object(
    'db', 'ok',
    'auth', case when v_last_audit is not null then 'ok' else 'degraded' end,
    'gateway', case when v_5xx >= 20 then 'down' when v_5xx >= 5 then 'degraded' else 'ok' end,
    'push_queue', case when v_stuck >= 10 then 'down' when v_stuck >= 1 then 'degraded' else 'ok' end
  );

  return jsonb_build_object(
    'generated_at', now(),
    'window_hours', v_hours,
    'counters', v_counters,
    'alerts', v_alerts,
    'events', v_events,
    'health', v_health,
    'limits', jsonb_build_object(
      'sources', jsonb_build_array('auth.audit_log_entries', 'security_events', 'client_errors'),
      'not_covered', jsonb_build_array(
        'Intentos de login fallidos: GoTrue no los registra; hacen falta los registros de Kong',
        'Códigos de segundo factor incorrectos: dependen de la ingesta',
        'Picos de peticiones 401/403 y estado real del gateway: solo se infiere de errores que reporta la app'),
      'note', 'Muestra indicios y alertas; no garantiza detectar todo ataque.')
  );
end;
$$;
revoke all on function public.security_overview(int) from public, anon;
grant execute on function public.security_overview(int) to authenticated;
