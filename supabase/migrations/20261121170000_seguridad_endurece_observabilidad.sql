-- Copyright (c) 2026 Dinovance
-- S-05 (docs/mobile/seguridad.md), aplicada tras la migracion 20261121160000:
--  (1) purge_observability() limpia tambien security_events con retencion (minimo 30 dias, por defecto 90): crecia sin limite.
--  (2) Cada persona cuenta como maximo 1 evento de seguridad por tipo y hora para los que fabrica la app
--      (listener_revoked, push_queue_stuck); el exceso se descarta en silencio. No toca los eventos de Kong ni los de roles.
--  (3) report_client_error registra push_queue_stuck con el actor de la persona (public.actor_hint(auth.uid())) para que el tope sea por persona.
--  Idempotente (create or replace, drop trigger if exists).

create or replace function public.purge_observability(p_days int default 90)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('nido.purge', 'on', true);
  delete from public.client_errors where at < now() - make_interval(days => greatest(p_days, 30));
  delete from public.security_events where at < now() - make_interval(days => greatest(p_days, 30));
  perform set_config('nido.purge', 'off', true);
end;
$$;
revoke all on function public.purge_observability(int) from public, anon, authenticated;

-- Disparador: un evento por (tipo, persona) por hora para los eventos que fabrica la app (no toca los de Kong ni los de roles)
create or replace function public.security_events_app_throttle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('listener_revoked', 'push_queue_stuck') and exists (
       select 1 from public.security_events e
        where e.kind = new.kind and e.actor_hint is not distinct from new.actor_hint and e.at > now() - interval '1 hour') then
    return null;  -- se descarta en silencio, igual que el límite de client_errors
  end if;
  return new;
end;
$$;
revoke all on function public.security_events_app_throttle() from public, anon, authenticated;
drop trigger if exists security_events_app_throttle on public.security_events;
create trigger security_events_app_throttle before insert on public.security_events
  for each row execute function public.security_events_app_throttle();
-- Nota: report_client_error registra push_queue_stuck SIN actor (null). Para que el tope sea por persona hay que pasar
-- public.actor_hint(auth.uid()) también en ese caso (cambio de una línea en report_client_error).

-- (3)
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

  -- Los eventos de seguridad (alertas del panel) solo los puede originar una sesión real: una llamada anónima
  -- queda como error de cliente, nunca como alerta (H-11).
  if auth.uid() is null then
    return;
  end if;

  if p_error_code = 'LISTENER_REVOKED' then
    perform public.record_security_event('listener_revoked', 'low', public.actor_hint(auth.uid()), jsonb_build_object('source', p_source));
  elsif p_error_code = 'PUSH_QUEUE_STUCK' then
    perform public.record_security_event('push_queue_stuck', 'medium', public.actor_hint(auth.uid()), jsonb_build_object('source', p_source));
  end if;
end;
$$;
revoke all on function public.report_client_error(text, text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated;
