-- Copyright (c) 2026 Dinovance
-- R2-15 (QA ronda 2): la ingesta del gateway validaba las claves del detalle pero no el tipo ni el rango de count/status/window_s.

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
  -- count, status y window_s: solo enteros en rango (el panel los castea; nada de texto ni numeros enormes) (R2-15)
  if (p_detail ? 'count' and (jsonb_typeof(p_detail -> 'count') <> 'number' or (p_detail ->> 'count')::numeric <> trunc((p_detail ->> 'count')::numeric) or (p_detail ->> 'count')::numeric not between 0 and 1000000))
     or (p_detail ? 'status' and (jsonb_typeof(p_detail -> 'status') <> 'number' or (p_detail ->> 'status')::numeric <> trunc((p_detail ->> 'status')::numeric) or (p_detail ->> 'status')::numeric not between 100 and 599))
     or (p_detail ? 'window_s' and (jsonb_typeof(p_detail -> 'window_s') <> 'number' or (p_detail ->> 'window_s')::numeric <> trunc((p_detail ->> 'window_s')::numeric) or (p_detail ->> 'window_s')::numeric not between 1 and 86400))
  then
    raise exception 'detalle numerico invalido' using errcode = '22023';
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
