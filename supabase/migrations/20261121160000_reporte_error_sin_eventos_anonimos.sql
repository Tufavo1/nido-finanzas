-- Copyright (c) 2026 Dinovance
-- H-11 (QA): report_client_error está abierto a anon. Con código PUSH_QUEUE_STUCK una llamada SIN sesión creaba un
-- evento de seguridad `medium` (alerta falsificable en el panel). Ahora los eventos de seguridad exigen auth.uid().
-- Sin sesión el error se sigue guardando en client_errors (cupo propio 'anon', independiente del de cada persona).

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
    perform public.record_security_event('push_queue_stuck', 'medium', null, jsonb_build_object('source', p_source));
  end if;
end;
$$;
revoke all on function public.report_client_error(text, text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text, text) to anon, authenticated;
