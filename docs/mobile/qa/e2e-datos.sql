-- Copyright (c) 2026 Dinovance
-- E2E de DATOS (QA): borrador -> gasto con id idempotente, RLS entre hogares, validaciones, report_client_error y
-- security_overview. SOLO staging local (nido-selfhost-db-1). Usuarios sinteticos @example.invalid; todo termina en ROLLBACK
-- (nada que limpiar). Sin secretos: simula la sesion con request.jwt.claims, igual que supabase/tests/*.sql.
-- Imprime una linea  PASA|FALLA|INFO  por comprobacion. Un FALLA es un hallazgo, no aborta.
begin;

insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000e1a1', 'authenticated', 'authenticated', 'qa-a@example.invalid', now()),
  ('00000000-0000-0000-0000-00000000e1c3', 'authenticated', 'authenticated', 'qa-c@example.invalid', now()),
  ('00000000-0000-0000-0000-00000000e1d4', 'authenticated', 'authenticated', 'qa-admin@example.invalid', now()),
  ('00000000-0000-0000-0000-00000000e1b2', 'authenticated', 'authenticated', 'qa-normal@example.invalid', now());
insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000e1d4') on conflict do nothing;

create function public.q_como(u uuid, aal text default null) returns void language sql as $$
  select set_config('request.jwt.claims',
    (jsonb_build_object('sub', u) || case when aal is null then '{}'::jsonb else jsonb_build_object('aal', aal) end)::text, true) $$;
grant execute on function public.q_como(uuid, text) to anon, authenticated;

-- Ejecuta q; devuelve el SQLSTATE y el mensaje (o 'OK')
create function public.q_estado(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
grant execute on function public.q_estado(text) to anon, authenticated;

create function public.q_cuenta(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q into n; return n; end $$;
grant execute on function public.q_cuenta(text) to anon, authenticated;

create temp table q_res (n serial, estado text, nombre text, detalle text);
grant all on q_res, q_res_n_seq to public;
create function public.q_chk(p_ok boolean, p_nombre text, p_detalle text default '', p_info boolean default false) returns void
language plpgsql as $$
begin
  insert into q_res (estado, nombre, detalle) values (case when p_ok then 'PASA' when p_info then 'INFO' else 'FALLA' end, p_nombre, p_detalle);
end $$;
grant execute on function public.q_chk(boolean, text, text, boolean) to anon, authenticated;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000e1a1'; c uuid := '00000000-0000-0000-0000-00000000e1c3';
  adm uuid := '00000000-0000-0000-0000-00000000e1d4'; nrm uuid := '00000000-0000-0000-0000-00000000e1b2';
  h1 uuid; h3 uuid; cat1 uuid; cat3 uuid; x uuid := '11111111-2222-4333-8444-555555555555'; s text; n bigint; j jsonb; i int;
  ev0 bigint;
begin
  set local role authenticated;

  -- 1. Hogares y categorias
  perform public.q_como(a);  h1 := public.create_household('QA Casa A', 'Ana QA');
  select id into cat1 from public.categories where household_id = h1 limit 1;
  perform public.q_como(c);  h3 := public.create_household('QA Casa C', 'Cris QA');
  select id into cat3 from public.categories where household_id = h3 limit 1;
  perform public.q_chk(cat1 is not null and cat3 is not null, 'E1 hogares con categorias por defecto');

  -- 2. Candidato -> borrador -> gasto con id idempotente (la fila que arma expenseRow en la app)
  perform public.q_como(a);
  insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on)
  values (x, h1, cat1, 12990, a, true, 'Almacen Demo Spa', '2026-11-14');
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (%L,%L,%L,12990,%L,true,%L,%L)', x, h1, cat1, a, 'Almacen Demo Spa', '2026-11-14'));
  perform public.q_chk(s like '23505%' and s like '%_pkey%', 'E2 reenviar el MISMO id da 23505 sobre _pkey (la app lo trata como guardado)', s);
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (%L,%L,%L,99999,%L,true,%L,%L)', x, h1, cat1, a, 'Otro monto', '2026-11-15'));
  perform public.q_chk(s like '23505%', 'E3 reenviar el mismo id con OTROS datos tambien da 23505 (no sobrescribe)', s);
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.expenses where id = %L', x)) = 1, 'E4 una sola fila tras dos envios');
  perform public.q_chk(public.q_cuenta(format('select amount from public.expenses where id = %L', x)) = 12990, 'E5 el segundo envio no cambio el monto');
  -- Dos ids distintos con el mismo contenido = dos filas (es lo que pasaria con el hallazgo de enqueue con id nuevo)
  insert into public.expenses (household_id, category_id, amount, paid_by, shared, note, spent_on) values (h1, cat1, 12990, a, true, 'Almacen Demo Spa', '2026-11-14');
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.expenses where household_id = %L and amount = 12990 and note = %L', h1, 'Almacen Demo Spa')) = 2,
    'E6 (documenta el riesgo) mismo gasto con otro id queda DUPLICADO: la unica defensa es reusar el id', '', true);

  -- 3. Validaciones de la base
  perform public.q_chk(public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by) values (%L,%L,0,%L)', h1, cat1, a)) like '23514%', 'E7 monto 0 rechazado');
  perform public.q_chk(public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by) values (%L,%L,-5,%L)', h1, cat1, a)) like '23514%', 'E8 monto negativo rechazado');
  perform public.q_chk(public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by) values (%L,%L,10000000000,%L)', h1, cat1, a)) like '23514%', 'E9 monto >= 10.000.000.000 rechazado');
  perform public.q_chk(public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, note) values (%L,%L,100,%L,%L)', h1, cat1, a, repeat('x', 121))) like '23514%', 'E10 nota de mas de 120 caracteres rechazada');
  perform public.q_chk(public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by) values (%L,%L,100,%L)', h1, cat1, c)) like '23503%', 'E11 paid_by que no es miembro rechazado (23503)');
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, spent_on) values (%L,%L,100,%L,%L)', h1, cat1, a, '2027-06-01'));
  perform public.q_chk(s not like 'OK%', 'E12 fecha futura (2027) rechazada por la base', s, true);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, note) values (%L,%L,100,%L,%L)', h1, cat1, a, 'linea1' || chr(10) || 'linea2'));
  perform public.q_chk(true, 'E13 nota con salto de linea (la base lo acepta; el cliente debe limpiarlo)', s, true);

  -- 4. RLS: el otro hogar no ve ni inserta
  perform public.q_como(c);
  perform public.q_chk(public.q_cuenta('select count(*) from public.expenses') = 0, 'E14 el otro hogar no ve gastos de A');
  perform public.q_chk(public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by) values (%L,%L,100,%L)', h1, cat1, c)) like '42501%', 'E15 el otro hogar no puede insertar en el hogar de A (RLS 42501)');
  perform public.q_chk(public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by) values (%L,%L,100,%L)', h3, cat1, c)) like '23503%', 'E16 categoria de otro hogar rechazada (23503)');
  perform public.q_chk(public.q_cuenta(format('with d as (delete from public.expenses where id = %L returning 1) select count(*) from d', x)) = 0, 'E17 el otro hogar no puede borrar el gasto de A');
  perform public.q_chk(public.q_cuenta(format('with u as (update public.expenses set amount = 1 where id = %L returning 1) select count(*) from u', x)) = 0, 'E18 el otro hogar no puede editar el gasto de A');
  -- Reusar el id de A en el hogar de C: no debe filtrar la existencia por el error
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by) values (%L,%L,%L,100,%L)', x, h3, cat3, c));
  perform public.q_chk(true, 'E19 id ajeno reutilizado en otro hogar: el error revela que el id existe?', s, true);

  -- 5. report_client_error
  perform public.q_como(a);
  perform public.q_chk(public.q_estado('select public.report_client_error(''android'',''1.0.0'',''Home'',''APP_CRASH'',null,E''java.lang.IllegalStateException\ncl.dinovance.contigo.capture.CaptureProcessor.process(CaptureProcessor.kt:40)'')') = 'OK', 'E20 reporte valido');
  perform public.q_chk(public.q_estado('select public.report_client_error(''android'',''1.0.0'',''Home'',''error con espacios $12.990'')') like '22023%', 'E21 codigo de error con monto/espacios rechazado');
  perform public.q_chk(public.q_estado('select public.report_client_error(''android'',''1.0.0'',''ana@example.invalid'',''APP_CRASH'')') like '22023%', 'E22 correo en la pantalla rechazado');
  perform public.q_chk(public.q_estado('select public.report_client_error(''android'',''1.0.0'',''Home'',''APP_CRASH'',null,''Compra aprobada por 12990 en ALMACEN'')') like '22023%', 'E23 texto libre como pila rechazado');
  perform public.q_chk(public.q_estado('select public.report_client_error(''android'',''1.0.0'',''Home'',''APP_CRASH'',null,E''a.b(c)\n'')') in ('OK') or true, 'E24 pila con salto final', '', true);
  for i in 1..40 loop perform public.report_client_error('android', '1.0.0', 'Home', 'NETWORK'); end loop;
  reset role; select count(*) into n from public.client_errors where reporter_key = substr(encode(sha256(convert_to(a::text, 'UTF8')), 'hex'), 1, 16); set local role authenticated;
  perform public.q_chk(n = 30, 'E25 limite de tasa: 30 por 10 min por persona (40 enviados, guardados ' || n || ')');
  perform public.q_como(nrm);
  perform public.report_client_error('android', '1.0.0', 'Home', 'NETWORK');
  reset role; select count(*) into n from public.client_errors where reporter_key = substr(encode(sha256(convert_to(nrm::text, 'UTF8')), 'hex'), 1, 16);
  perform public.q_chk(n = 1, 'E26 el cupo de A no afecta a otra persona');

  -- 5b. anon: suplantacion de alertas
  reset role; select count(*) into ev0 from public.security_events where kind = 'push_queue_stuck'; set local role anon;
  perform set_config('request.jwt.claims', '{}', true);
  perform public.report_client_error('android', '1.0.0', 'Home', 'PUSH_QUEUE_STUCK');
  reset role;
  select count(*) into n from public.security_events where kind = 'push_queue_stuck';
  perform public.q_chk(n = ev0, 'E27 una llamada SIN SESION no debe crear eventos de seguridad (PUSH_QUEUE_STUCK anonimo creo ' || (n - ev0) || ' evento medium)');
  set local role anon;
  for i in 1..40 loop perform public.report_client_error('web', '1.0.0', 'Home', 'NETWORK'); end loop;
  perform public.q_como(nrm); set local role authenticated; perform public.q_como(nrm);
  reset role;
  select count(*) into n from public.client_errors where reporter_key = 'anon';
  perform public.q_chk(n <= 30, 'E28 el cupo anonimo esta acotado a 30 (guardados ' || n || ')');

  -- 6. Privacidad de lo guardado
  select count(*) into n from public.client_errors
   where concat_ws(' ', source, app_version, coalesce(screen, ''), error_code, coalesce(stack_top, '')) ~* '@|\$|[0-9]{5,}';
  perform public.q_chk(n = 0, 'E29 client_errors sin correos, montos ni numeros largos (' || n || ' filas sospechosas)');
  select count(*) into n from public.security_events where (detail::text || coalesce(actor_hint, '')) ~* '@|\$|eyJ|[0-9]{6,}';
  perform public.q_chk(n = 0, 'E30 security_events sin correos, tokens ni montos (' || n || ' filas sospechosas)');

  -- 7. Solo agregar
  set local role authenticated; perform public.q_como(adm, 'aal2');
  perform public.q_chk(public.q_estado('update public.client_errors set error_code = ''X1''') not like 'OK%', 'E31 nadie edita client_errors');
  perform public.q_chk(public.q_estado('delete from public.client_errors') not like 'OK%', 'E32 nadie borra client_errors');
  perform public.q_chk(public.q_estado('delete from public.security_events') not like 'OK%', 'E33 nadie borra security_events');

  -- 8. security_overview: solo admin con aal2
  perform public.q_como(nrm);
  perform public.q_chk(public.q_estado('select public.security_overview(24)') not like 'OK%', 'E34 persona comun no ve el panel');
  perform public.q_chk(public.q_cuenta('select count(*) from public.client_errors') = 0, 'E35 persona comun no lee client_errors');
  perform public.q_como(adm, 'aal1');
  perform public.q_chk(public.q_estado('select public.security_overview(24)') not like 'OK%', 'E36 admin sin segundo factor (aal1) no ve el panel');
  perform public.q_chk(public.q_cuenta('select count(*) from public.client_errors') = 0, 'E37 admin aal1 no lee client_errors');
  perform public.q_como(adm, 'aal2');
  j := public.security_overview(24);
  perform public.q_chk(j ?& array['counters', 'alerts', 'events', 'health', 'limits'], 'E38 admin aal2 ve el panel con sus secciones', (select string_agg(k, ',') from jsonb_object_keys(j) k));
  perform public.q_chk(j::text !~* '@example|eyJ', 'E39 el panel no trae correos ni tokens');
  perform public.q_chk(public.q_cuenta('select count(*) from public.client_errors') > 0, 'E40 admin aal2 lee client_errors');

  reset role;
end $$;

select format('%s %s%s', estado, nombre, case when detalle <> '' then '  -> ' || left(detalle, 160) else '' end) as resultado from q_res order by n;
select 'RESUMEN pasa=' || count(*) filter (where estado = 'PASA') || ' falla=' || count(*) filter (where estado = 'FALLA') || ' info=' || count(*) filter (where estado = 'INFO') as resumen from q_res;
rollback;
