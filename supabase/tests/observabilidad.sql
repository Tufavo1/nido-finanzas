-- Copyright (c) 2026 Dinovance
-- Observabilidad: client_errors, security_events y security_overview (RLS, aal2, solo agregar, límite de tasa, sin datos personales).
-- Ejecutar (SOLO staging local): docker exec -i nido-selfhost-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/observabilidad.sql
begin;

insert into auth.users (id, aud, role, email, email_confirmed_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin-obs@test.cl', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'normal-obs@test.cl', now());
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000a1') on conflict do nothing;

create function public.t_debe_fallar(q text) returns void
language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    return;
  end;
  raise exception 'DEBIA FALLAR: %', q;
end $$;
grant execute on function public.t_debe_fallar(text) to anon, authenticated;

create function public.t_como(u uuid, aal text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    (jsonb_build_object('sub', u) || case when aal is null then '{}'::jsonb else jsonb_build_object('aal', aal) end)::text, true)
$$;
grant execute on function public.t_como(uuid, text) to anon, authenticated;

create function public.t_cuenta(q text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute q into n;
  return n;
end $$;
grant execute on function public.t_cuenta(text) to anon, authenticated;

-- Datos del registro de GoTrue (sintéticos, dentro de la transacción)
insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       json_build_object('action', 'user_repeated_signup', 'actor_id', gen_random_uuid(), 'actor_username', 'sondeo' || g || '@test.cl')::json,
       now() - (g || ' seconds')::interval, '203.0.113.5'
from generate_series(1, 12) g;
insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address)
values
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), json_build_object('action', 'login', 'actor_id', '00000000-0000-0000-0000-0000000000b2')::json, now() - interval '3 days', '198.51.100.20'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), json_build_object('action', 'login', 'actor_id', '00000000-0000-0000-0000-0000000000b2')::json, now() - interval '1 minute', '203.0.113.77'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), json_build_object('action', 'login', 'actor_id', '00000000-0000-0000-0000-0000000000b2')::json, now() - interval '2 minutes', '192.0.2.9'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), json_build_object('action', 'login', 'actor_id', '00000000-0000-0000-0000-0000000000b2')::json, now() - interval '3 minutes', '198.51.100.80');

do $$
declare
  adm uuid := '00000000-0000-0000-0000-0000000000a1';
  normal uuid := '00000000-0000-0000-0000-0000000000b2';
  r jsonb;
  n bigint;
begin
  -- 0) Cualquiera (incluso anónimo) puede REPORTAR por la RPC; el contenido se valida
  set local role anon;
  perform public.report_client_error('android', '1.2.0', 'inicio', 'TIMEOUT', 'abcd1234-ef56', 'cl.dinovance.Foo.bar(Foo.kt:10)');
  perform public.t_debe_fallar('select public.report_client_error(''android'', ''1.2.0'', ''inicio'', ''timeout minusculas'')');
  perform public.t_debe_fallar('select public.report_client_error(''ios2'', ''1.2.0'', ''inicio'', ''TIMEOUT'')');
  perform public.t_debe_fallar('select public.report_client_error(''android'', ''1.2.0'', ''persona@correo.cl'', ''TIMEOUT'')');
  perform public.t_debe_fallar('select public.report_client_error(''android'', ''1.2.0'', ''inicio'', ''TIMEOUT'', null, ''Compra de $12.990 en Almacen'')');

  -- 1) anon: no lee nada ni llama a las funciones de lectura
  perform public.t_como(adm, 'aal2');
  perform public.t_debe_fallar('select * from public.client_errors');
  perform public.t_debe_fallar('select * from public.security_events');
  perform public.t_debe_fallar('select public.security_overview(24)');
  perform public.t_debe_fallar('insert into public.client_errors (source, app_version, error_code, reporter_key) values (''web'', ''1'', ''X1'', ''k'')');
  reset role;

  -- 2) Usuario normal (aunque traiga aal2): RLS devuelve 0 filas, la función falla, no inserta directo
  set local role authenticated;
  perform public.t_como(normal, 'aal2');
  assert public.t_cuenta('select count(*) from public.client_errors') = 0, 'usuario normal no ve client_errors';
  assert public.t_cuenta('select count(*) from public.security_events') = 0, 'usuario normal no ve security_events';
  perform public.t_debe_fallar('select public.security_overview(24)');
  perform public.t_debe_fallar('insert into public.client_errors (source, app_version, error_code, reporter_key) values (''web'', ''1'', ''X1'', ''k'')');
  perform public.t_debe_fallar('insert into public.security_events (kind, severity) values (''role_change'', ''high'')');
  perform public.report_client_error('web', '1.2.0', 'inicio', 'OFFLINE');

  -- 3) Admin sin segundo factor: igual que un usuario normal
  perform public.t_como(adm, 'aal1');
  assert public.t_cuenta('select count(*) from public.client_errors') = 0, 'admin aal1 no ve client_errors';
  perform public.t_debe_fallar('select public.security_overview(24)');

  -- 4) Admin con aal2: lee y obtiene el resumen
  perform public.t_como(adm, 'aal2');
  assert public.t_cuenta('select count(*) from public.client_errors') >= 2, 'admin aal2 ve client_errors';
  assert public.t_cuenta('select count(*) from public.security_events where kind = ''role_change''') >= 1, 'el alta del admin dejó un evento role_change';
  r := public.security_overview(24);
  assert r ? 'generated_at' and r ? 'counters' and r ? 'alerts' and r ? 'events' and r ? 'health', 'forma del resumen';
  assert r -> 'health' ->> 'db' in ('ok', 'degraded', 'down') and r -> 'health' ->> 'push_queue' = 'ok', 'salud';
  assert (r -> 'counters' ->> 'repeated_signups')::int >= 12, 'cuenta los registros repetidos';
  assert (r -> 'counters' ->> 'new_device')::int >= 1, 'detecta dispositivo nuevo';
  assert exists (select 1 from jsonb_array_elements(r -> 'alerts') a where a ->> 'kind' = 'account_enumeration' and a ->> 'severity' = 'medium'), 'alerta de sondeo de cuentas';
  assert exists (select 1 from jsonb_array_elements(r -> 'alerts') a where a ->> 'kind' = 'multiple_locations' and a ->> 'severity' = 'high'), 'alerta de varios lugares';
  assert exists (select 1 from jsonb_array_elements(r -> 'alerts') a where a ->> 'kind' = 'privilege_escalation'), 'alerta de cambio de administradores';
  assert jsonb_array_length(r -> 'events') > 0 and jsonb_array_length(r -> 'events') <= 100, 'eventos acotados';
  assert (select bool_and(e ? 'id' and e ? 'at' and e ? 'kind' and e ? 'severity' and e ? 'actor_hint' and e ? 'detail') from jsonb_array_elements(r -> 'events') e), 'cada evento trae sus campos';
  assert (select bool_and(a ? 'id' and a ? 'severity' and a ? 'kind' and a ? 'title' and a ? 'detail' and a ? 'at') from jsonb_array_elements(r -> 'alerts') a), 'cada alerta trae sus campos';
  assert r::text not like '%@%', 'el resumen no trae correos';
  assert r::text not like '%203.0.113.77%' and r::text not like '%203.0.113.5%' and r::text not like '%' || normal::text || '%', 'el resumen no trae IP completas ni ids de cuenta';
  assert r::text like '%203.0.113.0%', 'las IP salen enmascaradas';

  -- 5) Nadie puede editar ni borrar (ni siquiera el administrador con aal2)
  perform public.t_debe_fallar('update public.client_errors set error_code = ''HECHO''');
  perform public.t_debe_fallar('delete from public.client_errors');
  perform public.t_debe_fallar('truncate public.client_errors');
  perform public.t_debe_fallar('update public.security_events set severity = ''info''');
  perform public.t_debe_fallar('delete from public.security_events');
  perform public.t_debe_fallar('truncate public.security_events');
  reset role;
  -- ... ni el dueño de la tabla (el disparador lo impide)
  perform public.t_debe_fallar('update public.client_errors set error_code = ''HECHO''');
  perform public.t_debe_fallar('delete from public.security_events');

  -- 6) Límite de tasa: 30 reportes por persona cada 10 minutos
  set local role authenticated;
  perform public.t_como(normal, null);
  for i in 1..40 loop
    perform public.report_client_error('android', '1.2.0', 'inicio', 'SERVER');
  end loop;
  reset role;
  select count(*) into n from public.client_errors where reporter_key = substr(encode(sha256(convert_to(normal::text, 'UTF8')), 'hex'), 1, 16);
  assert n = 30, 'el límite deja exactamente 30 (hubo ' || n || ')';

  -- 7) El permiso revocado queda como evento de seguridad
  set local role authenticated;
  perform public.t_como(adm, null);
  perform public.report_client_error('android', '1.2.0', 'ajustes', 'LISTENER_REVOKED');
  reset role;
  assert exists (select 1 from public.security_events where kind = 'listener_revoked'), 'listener_revoked registrado';

  raise notice 'TODAS LAS PRUEBAS DE OBSERVABILIDAD PASARON';
end $$;

rollback;
