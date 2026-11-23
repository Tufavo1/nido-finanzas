-- Copyright (c) 2026 Dinovance
-- S-05: tope de 1 evento de seguridad por persona, tipo y hora; purga de security_events con retencion.
-- Ejecutar (SOLO staging local): docker exec -i nido-selfhost-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/seguridad_observabilidad.sql
begin;
insert into auth.users (id, aud, role, email, email_confirmed_at)
values ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'seg-c1@test.cl', now()),
       ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'seg-c2@test.cl', now());

do $$
declare n bigint; viejos bigint; antes bigint;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);
  set local role authenticated;
  for i in 1..5 loop perform public.report_client_error('android', '1.0.0', 'Home', 'PUSH_QUEUE_STUCK'); end loop;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2"}', true);
  perform public.report_client_error('android', '1.0.0', 'Home', 'PUSH_QUEUE_STUCK');
  reset role;
  select count(*) into n from public.security_events where kind = 'push_queue_stuck' and at > now() - interval '1 minute';
  if n <> 2 then raise exception 'FALLA: 5 reportes de una persona y 1 de otra debian dejar 2 eventos, hay %', n; end if;
  raise notice 'OK: un evento por persona y tipo por hora (%)', n;

  -- Purga: un evento de 100 dias se borra, uno reciente no; el minimo es 30 dias aunque se pida 1
  perform set_config('nido.purge', 'on', true);
  perform set_config('nido.purge', 'off', true);
  select count(*) into antes from public.security_events;
  perform public.purge_observability(1);
  select count(*) into n from public.security_events;
  if n <> antes then raise exception 'FALLA: purge_observability(1) borro eventos recientes (minimo 30 dias): % -> %', antes, n; end if;
  raise notice 'OK: la purga respeta el minimo de 30 dias';
end $$;

-- Un evento de 100 dias se borra con la purga y uno de 10 dias no
do $$
declare n bigint;
begin
  insert into public.security_events (kind, severity, actor_hint, detail, at) values
    ('login_failed', 'low', 'viejo_t', '{}', now() - interval '100 days'),
    ('login_failed', 'low', 'medio_t', '{}', now() - interval '10 days');
  perform public.purge_observability(90);
  select count(*) into n from public.security_events where actor_hint = 'viejo_t';
  if n <> 0 then raise exception 'FALLA: el evento de 100 dias sigue tras purge_observability(90)'; end if;
  select count(*) into n from public.security_events where actor_hint = 'medio_t';
  if n <> 1 then raise exception 'FALLA: la purga borro un evento de 10 dias'; end if;
  raise notice 'OK: la purga borra lo de mas de la retencion y conserva lo reciente';
end $$;
rollback;
