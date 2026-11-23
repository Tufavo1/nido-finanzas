-- Copyright (c) 2026 Dinovance
-- Ingesta de eventos de seguridad desde el gateway (Kong) -> security_events.
-- Un rol dedicado de minimo privilegio (sec_ingest) solo puede EJECUTAR ingest_security_event():
-- no lee, no actualiza ni borra nada. La funcion valida todo y solo inserta.
-- Sin contrasenas ni correos: el actor es un resumen de la red (no de la cuenta; Kong no ve el cuerpo).

-- Un tipo nuevo: pico de 401/403 en el gateway
alter table public.security_events drop constraint security_events_kind_check;
alter table public.security_events add constraint security_events_kind_check
  check (kind in ('login_failed', 'login_blocked', 'mfa_failed', 'role_change', 'listener_revoked', 'push_queue_stuck', 'auth_spike'));

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sec_ingest') then
    -- nologin: el entorno que lo use le pone contrasena y LOGIN (en staging: scripts/obs-db-role.sh)
    create role sec_ingest nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 3;
  end if;
end $$;
alter role sec_ingest set statement_timeout = '5s';

create or replace function public.ingest_security_event(p_kind text, p_severity text, p_actor_hint text, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind is null or p_kind not in ('login_failed', 'login_blocked', 'mfa_failed', 'auth_spike') then
    raise exception 'tipo de evento no permitido' using errcode = '22023';
  end if;
  if p_severity is null or p_severity not in ('info', 'low', 'medium', 'high') then
    raise exception 'severidad no permitida' using errcode = '22023';
  end if;
  if p_actor_hint is not null and p_actor_hint !~ '^[A-Za-z0-9_]{1,24}$' then
    raise exception 'actor invalido' using errcode = '22023';
  end if;
  if p_detail is null or jsonb_typeof(p_detail) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_detail) k where k not in ('path_kind', 'status', 'ip', 'req_id', 'count', 'window_s')) then
    raise exception 'detalle invalido' using errcode = '22023';
  end if;
  if (p_detail ->> 'ip') is not null and (p_detail ->> 'ip') !~ '^[0-9a-fA-F:.x]{1,40}$' then
    raise exception 'ip invalida' using errcode = '22023';
  end if;
  if (p_detail ->> 'req_id') is not null and (p_detail ->> 'req_id') !~ '^[A-Za-z0-9._-]{1,64}$' then
    raise exception 'req_id invalido' using errcode = '22023';
  end if;
  -- tope contra inundacion: 600 eventos por minuto desde el gateway
  if (select count(*) from public.security_events where at >= now() - interval '1 minute' and detail ? 'path_kind') >= 600 then
    return;
  end if;
  insert into public.security_events (kind, severity, actor_hint, detail)
  values (p_kind, p_severity, p_actor_hint, p_detail);
end
$$;
revoke all on function public.ingest_security_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_security_event(text, text, text, jsonb) to sec_ingest;
grant usage on schema public to sec_ingest;
