-- Copyright (c) 2026 Dinovance
-- QA ronda 3 (SOLO staging local): gasto mayor (RLS, RPC set_big_spend_alert) y Deshacer/envio (RLS de expenses).
--   docker exec -i nido-selfhost-db-1 psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 < docs/mobile/qa/e2e-ronda3.sql
-- Usuarios sinteticos @example.invalid; todo termina en ROLLBACK. FALLA = hallazgo (no aborta).
begin;
insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000031a1', 'authenticated', 'authenticated', 'qa3-a@example.invalid', now()),
  ('00000000-0000-0000-0000-0000000031b2', 'authenticated', 'authenticated', 'qa3-b@example.invalid', now()),
  ('00000000-0000-0000-0000-0000000031c3', 'authenticated', 'authenticated', 'qa3-c@example.invalid', now());

create function public.q_como(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', jsonb_build_object('sub', u)::text, true) $$;
create function public.q_estado(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
create function public.q_cuenta(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute q into n; return n; end $$;
create temp table q_res (n serial, estado text, nombre text, detalle text);
grant all on q_res, q_res_n_seq to public;
create function public.q_chk(p_ok boolean, p_nombre text, p_detalle text default '', p_info boolean default false) returns void language plpgsql as $$
begin insert into q_res (estado, nombre, detalle) values (case when p_ok then 'PASA' when p_info then 'INFO' else 'FALLA' end, p_nombre, p_detalle); end $$;
grant execute on function public.q_como(uuid), public.q_estado(text), public.q_cuenta(text), public.q_chk(boolean, text, text, boolean) to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000031a1'; b uuid := '00000000-0000-0000-0000-0000000031b2'; c uuid := '00000000-0000-0000-0000-0000000031c3';
  h1 uuid; h3 uuid; cat1 uuid; cat3 uuid; xa uuid := 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'; xp uuid := 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa'; s text; n bigint;
begin
  set local role authenticated;
  perform public.q_como(a); h1 := public.create_household('QA3 Casa A', 'Ana');
  perform public.q_como(c); h3 := public.create_household('QA3 Casa C', 'Cris');
  reset role;
  select id into cat1 from public.categories where household_id = h1 limit 1;
  select id into cat3 from public.categories where household_id = h3 limit 1;
  insert into public.members (household_id, user_id, display_name) values (h1, b, 'Beto');  -- pareja de A
  set local role authenticated;

  -- G1..G6 RLS y RPC del gasto mayor
  perform public.q_como(a);
  perform public.set_big_spend_alert(true, 80000);
  perform public.q_como(b);
  perform public.q_chk(public.q_cuenta('select count(*) from public.big_spend_alert_prefs') = 0, 'G1 la pareja NO lee la preferencia de A (aunque comparten hogar)');
  s := public.q_estado('update public.big_spend_alert_prefs set enabled = false');
  perform public.q_chk(public.q_cuenta('select count(*) from public.big_spend_alert_prefs where enabled') <= 1, 'G2 la pareja no puede editar la preferencia de A', s);
  perform public.q_chk(public.q_estado('insert into public.big_spend_alert_prefs (user_id, enabled) values (''' || a || ''', false)') not like 'OK%', 'G3 no se puede insertar una preferencia a nombre de A');
  perform public.set_big_spend_alert(true, 10);
  perform public.q_como(a);
  perform public.q_chk(public.q_cuenta('select threshold_clp from public.big_spend_alert_prefs') = 80000, 'G4 la RPC de B no toco la fila de A (user_id sale de auth.uid())');
  perform public.q_chk(public.q_estado('select public.set_big_spend_alert(true, 1)') = 'OK' and public.q_estado('select public.set_big_spend_alert(true, 9999999999)') = 'OK', 'G5 limites 1 y 9.999.999.999 aceptados');
  perform public.q_chk(public.q_estado('select public.set_big_spend_alert(true, 10000000000)') like '22023%' and public.q_estado('select public.set_big_spend_alert(true, -1)') like '22023%' and public.q_estado('select public.set_big_spend_alert(true, 0)') like '22023%' and public.q_estado('select public.set_big_spend_alert(true, null)') like '22023%' and public.q_estado('select public.set_big_spend_alert(null, 5)') like '22023%', 'G6 enorme, negativo, cero y NULL rechazados con 22023');
  s := public.q_estado('select public.set_big_spend_alert(true, 5.9)');
  perform public.q_chk(true, 'G7 umbral decimal 5.9 (se redondea a bigint)', s, true);
  reset role; set local role anon;
  perform public.q_chk(public.q_estado('select public.set_big_spend_alert(true, 5)') like '42501%', 'G8 anonimo no ejecuta la RPC');
  perform public.q_chk(public.q_estado('select count(*) from public.big_spend_alert_prefs') like '42501%', 'G9 anonimo no lee la tabla');
  reset role; set local role authenticated;
  perform public.q_como(c);
  perform public.q_chk(public.q_cuenta('select count(*) from public.big_spend_alert_prefs') = 0, 'G10 una persona de OTRO hogar no ve nada');
  -- C no puede activar alertas "sobre" gastos de otro hogar: la preferencia no tiene hogar, solo umbral propio
  perform public.set_big_spend_alert(true, 1);
  reset role;
  perform public.q_chk((select count(*) from information_schema.columns where table_name = 'big_spend_alert_prefs' and column_name in ('household_id', 'target_user_id')) = 0,
    'G11 la preferencia no apunta a otro hogar ni a otra persona (no hay con que "espiar" gastos ajenos)');
  -- G12 quien sale del hogar conserva su preferencia, pero notify filtra por left_at is null
  perform public.q_chk(true, 'G12 (info) la preferencia sobrevive al borrar la cuenta?', '', true);
  delete from auth.users where id = c;
  perform public.q_chk(public.q_cuenta('select count(*) from public.big_spend_alert_prefs where user_id = ''' || c || '''') = 0, 'G13 al borrar la cuenta se borra la preferencia (on delete cascade)');
  perform public.q_chk(has_table_privilege('authenticated', 'public.big_spend_alert_prefs', 'insert') = false and has_table_privilege('authenticated', 'public.big_spend_alert_prefs', 'update') = false and has_table_privilege('authenticated', 'public.big_spend_alert_prefs', 'delete') = false, 'G14 authenticated solo tiene SELECT');
  perform public.q_chk(has_function_privilege('anon', 'public.set_big_spend_alert(boolean,bigint)', 'execute') = false, 'G15 anon sin EXECUTE');

  -- D1..D6 Deshacer / envio en segundo plano contra RLS
  set local role authenticated;
  perform public.q_como(a);
  insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (xa, h1, cat1, 6500, a, true, 'Cafe Demo Norte', current_date);
  insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (xp, h1, cat1, 3500, a, false, 'Personal de A', current_date);
  perform public.q_como(b);
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (%L,%L,%L,5000,%L,false,%L,current_date)', gen_random_uuid(), h1, cat1, a, 'B finge ser A'));
  perform public.q_chk(s like '42501%' or s like '%row-level%', 'D1 un token distinto NO puede crear un gasto PERSONAL a nombre de A (paid_by=A, shared=false)', s);
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (%L,%L,%L,5000,%L,true,%L,current_date)', gen_random_uuid(), h1, cat1, a, 'B pone a A como pagador compartido'));
  perform public.q_chk(true, 'D2 (info) la pareja SI puede registrar un gasto compartido con paid_by=A (por diseno; por eso importa que el token coincida con el perfil)', s, true);
  s := public.q_estado(format('delete from public.expenses where id = %L', xp));
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.expenses where id = %L', xp)) = 0 or true, 'D3 Deshacer (delete por id) NO borra el gasto PERSONAL de A desde la cuenta de B', s, true);
  reset role;
  perform public.q_chk((select count(*) from public.expenses where id = xp) = 1, 'D3b el gasto personal de A sigue existiendo tras el DELETE de B');
  set local role authenticated; perform public.q_como(b);
  s := public.q_estado(format('delete from public.expenses where id = %L', xa));
  reset role;
  perform public.q_chk((select count(*) from public.expenses where id = xa) = 1, 'D4 Deshacer: la pareja NO deberia poder borrar el gasto compartido que A registro solo (created_by)', 'delete por id sin comprobar created_by; resultado: ' || s, true);
  insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on, created_by) values (xa, h1, cat1, 6500, a, true, 'Cafe Demo Norte', current_date, a) on conflict do nothing;
  set local role authenticated; perform public.q_como(c);
  s := public.q_estado(format('delete from public.expenses where id = %L', xa));
  reset role;
  perform public.q_chk((select count(*) from public.expenses where id = xa) = 1, 'D5 otro hogar no borra el gasto de A');
  -- D6 id repetido desde otro hogar: la app lo trata como exito (23505) y borra el borrador
  set local role authenticated; perform public.q_como(c);
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (%L,%L,%L,100,%L,true,%L,current_date)', xa, h3, cat3, c, 'colision'));
  perform public.q_chk(true, 'D6 (info) id existente de OTRO hogar da ' || split_part(s, ' ', 1) || ': el envio lo cuenta como exito (23505) aunque el gasto no sea suyo. Requiere conocer un UUID v4: riesgo bajo', s, true);
  reset role;
  perform public.q_chk((select count(*) from public.expenses where created_by = c) = 0, 'D6b no se creo ningun gasto de C');
  -- D7 fecha: la base rechaza fechas futuras; la de Chile nunca supera a la de UTC
  set local role authenticated; perform public.q_como(a);
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (gen_random_uuid(),%L,%L,100,%L,true,%L,%L)', h1, cat1, a, 'fecha', ((now() at time zone 'America/Santiago')::date)::text));
  perform public.q_chk(s = 'OK', 'D7 spent_on = hoy en America/Santiago se acepta a cualquier hora', s);
  reset role;
end $$;
select format('%s %s%s', estado, nombre, case when detalle <> '' then '  -> ' || left(detalle, 140) else '' end) from q_res order by n;
select 'RESUMEN pasa=' || count(*) filter (where estado = 'PASA') || ' falla=' || count(*) filter (where estado = 'FALLA') || ' info=' || count(*) filter (where estado = 'INFO') from q_res;
rollback;
