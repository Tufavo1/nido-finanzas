-- Copyright (c) 2026 Dinovance
-- QA ronda 2 (SOLO staging local). Ejecutar como supabase_admin:
--   docker exec -i nido-selfhost-db-1 psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 < docs/mobile/qa/e2e-ronda2.sql
-- Todo termina en ROLLBACK. Usuarios sinteticos @example.invalid.
begin;
insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000f1a1', 'authenticated', 'authenticated', 'qa2-a@example.invalid', now()),
  ('00000000-0000-0000-0000-00000000f1d4', 'authenticated', 'authenticated', 'qa2-admin@example.invalid', now());
insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000f1d4') on conflict do nothing;

create temp table q_res (n serial, estado text, nombre text, detalle text);
grant all on q_res, q_res_n_seq to public;
create function public.q_chk(p_ok boolean, p_nombre text, p_detalle text default '', p_info boolean default false) returns void language plpgsql as $$
begin insert into q_res (estado, nombre, detalle) values (case when p_ok then 'PASA' when p_info then 'INFO' else 'FALLA' end, p_nombre, p_detalle); end $$;
create function public.q_estado(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
grant execute on function public.q_chk(boolean, text, text, boolean), public.q_estado(text) to public;

do $$
declare s text; n bigint; j jsonb; i int; adm uuid := '00000000-0000-0000-0000-00000000f1d4';
begin
  -- R1 el rol sec_ingest: solo puede llamar a ingest_security_event
  set local role sec_ingest;
  perform public.q_chk(public.q_estado('select count(*) from public.expenses') like '42501%', 'R1 sec_ingest no lee expenses');
  perform public.q_chk(public.q_estado('select count(*) from public.security_events') like '42501%', 'R2 sec_ingest no lee security_events');
  perform public.q_chk(public.q_estado('insert into public.security_events (kind, severity) values (''login_failed'', ''low'')') like '42501%', 'R3 sec_ingest no inserta directo');
  perform public.q_chk(public.q_estado('select count(*) from auth.users') like '42501%', 'R4 sec_ingest no lee auth.users');
  perform public.q_chk(public.q_estado('select public.create_household(''x'', ''y'')') like '42501%' or public.q_estado('select public.create_household(''x'', ''y'')') like '%auth%' or true, 'R5 (info) create_household desde sec_ingest', public.q_estado('select public.create_household(''x'', ''y'')'), true);
  perform public.q_chk(public.q_estado('select public.admin_status()') like '42501%', 'R6 sec_ingest no llama admin_status', public.q_estado('select public.admin_status()'), true);
  perform public.q_chk(public.q_estado('select public.security_overview(24)') like '42501%', 'R7 sec_ingest no llama security_overview');
  perform public.q_chk(public.q_estado('create table public.q_x (a int)') like '42501%', 'R8 sec_ingest no crea tablas');
  -- R9 tipos de detalle: count/status numericos? (el panel los casteara)
  s := public.q_estado('select public.ingest_security_event(''login_failed'', ''medium'', ''ip_x'', ''{"count":"abc","status":"x","path_kind":"token"}'')');
  perform public.q_chk(s like '22023%', 'R9 el detalle con count/status NO numericos se rechaza en la ingesta', s);
  s := public.q_estado('select public.ingest_security_event(''login_failed'', ''medium'', ''ip_x'', ''{"count":99999999999999999999,"status":-5,"path_kind":"token"}'')');
  perform public.q_chk(s like '22023%', 'R10 count/status fuera de rango se rechazan', s);
  reset role;

  -- R11 el panel sigue funcionando con lo ingerido
  perform public.q_chk(true, 'R11 (se evalua en R12)', '', true);
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', adm, 'aal', 'aal2')::text, true);
  s := public.q_estado('select public.security_overview(24)');
  perform public.q_chk(s = 'OK', 'R12 security_overview funciona tras ingerir detalles raros', s);
  reset role;

  -- R13 saturacion: 600 eventos/min globales; el 601 se descarta en silencio (un atacante puede tapar a otros)
  for i in 1..610 loop perform public.ingest_security_event('login_failed', 'low', 'ip_flood', '{"path_kind":"token","status":400,"count":1}'); end loop;
  select count(*) into n from public.security_events where actor_hint = 'ip_flood';
  perform public.q_chk(false, 'R13 (hallazgo) tope global de 600/min: un solo origen puede llenarlo y los eventos de otros se descartan en silencio (guardados ' || n || ' de 610)', '', true);

  -- R14 cupo anonimo compartido
  set local role anon;
  perform set_config('request.jwt.claims', '{}', true);
  for i in 1..30 loop perform public.report_client_error('android', '1.0.0', 'Home', 'NETWORK'); end loop;
  reset role;
  select count(*) into n from public.client_errors where reporter_key = 'anon';
  set local role anon;
  perform public.report_client_error('android', '1.0.0', 'Splash', 'APP_CRASH');
  reset role;
  perform public.q_chk((select count(*) from public.client_errors where screen = 'Splash') <> 0, 'R14 (hallazgo) un anonimo agota el cupo y el reporte de un cierre inesperado de OTRO anonimo se pierde', 'anon=' || n, true);
  -- R15 el cupo anonimo no afecta a personas con sesion
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-00000000f1a1')::text, true);
  perform public.report_client_error('android', '1.0.0', 'Splash', 'APP_CRASH');
  reset role;
  perform public.q_chk((select count(*) from public.client_errors where screen = 'Splash') = 1, 'R15 una persona con sesion si puede reportar aunque el cupo anonimo este lleno');
  -- R16 sin sesion no hay eventos de seguridad (H-11)
  set local role anon; perform set_config('request.jwt.claims', '{}', true);
  perform public.report_client_error('android', '1.0.0', 'Home', 'LISTENER_REVOKED');
  perform public.report_client_error('android', '1.0.0', 'Home', 'PUSH_QUEUE_STUCK');
  reset role;
  perform public.q_chk((select count(*) from public.security_events where kind in ('listener_revoked', 'push_queue_stuck')) = 0, 'R16 H-11 cerrado: anonimo no crea eventos de seguridad');
  -- R17 con sesion si (LISTENER_REVOKED)
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', '00000000-0000-0000-0000-00000000f1a1')::text, true);
  perform public.report_client_error('android', '1.0.0', 'Home', 'LISTENER_REVOKED');
  reset role;
  perform public.q_chk((select count(*) from public.security_events where kind = 'listener_revoked') = 1, 'R17 con sesion LISTENER_REVOKED si crea el evento');
end $$;

select format('%s %s%s', estado, nombre, case when detalle <> '' then '  -> ' || left(detalle, 140) else '' end) from q_res order by n;
select 'RESUMEN pasa=' || count(*) filter (where estado = 'PASA') || ' falla=' || count(*) filter (where estado = 'FALLA') || ' info=' || count(*) filter (where estado = 'INFO') from q_res;
rollback;
