-- Copyright (c) 2026 Dinovance
-- QA ronda 4 (SOLO staging local): ingresos (incomes) y pagos de deuda (debt_payments) que guarda la bandeja.
--   docker exec -i nido-selfhost-db-1 psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 < docs/mobile/qa/e2e-ronda4.sql
-- Usuarios sinteticos @example.invalid; todo termina en ROLLBACK. FALLA = hallazgo (no aborta).
begin;
insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000041a1', 'authenticated', 'authenticated', 'qa3-a@example.invalid', now()),
  ('00000000-0000-0000-0000-0000000041b2', 'authenticated', 'authenticated', 'qa3-b@example.invalid', now()),
  ('00000000-0000-0000-0000-0000000041c3', 'authenticated', 'authenticated', 'qa3-c@example.invalid', now());

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
  a uuid := '00000000-0000-0000-0000-0000000041a1'; b uuid := '00000000-0000-0000-0000-0000000041b2'; c uuid := '00000000-0000-0000-0000-0000000041c3';
  h1 uuid; h3 uuid; d1 uuid; d3 uuid; dper uuid; darch uuid; s text; x uuid := 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb';
begin
  set local role authenticated;
  perform public.q_como(a); h1 := public.create_household('QA4 Casa A', 'Ana');
  perform public.q_como(c); h3 := public.create_household('QA4 Casa C', 'Cris');
  reset role;
  insert into public.members (household_id, user_id, display_name) values (h1, b, 'Beto');
  insert into public.debts (household_id, name, original_amount) values (h1, 'CMR Mastercard Premium', 500000) returning id into d1;
  insert into public.debts (household_id, name, original_amount) values (h3, 'Deuda de C', 90000) returning id into d3;
  insert into public.debts (household_id, name, original_amount, owner_id) values (h1, 'Personal de B', 90000, b) returning id into dper;
  insert into public.debts (household_id, name, original_amount, archived) values (h1, 'Archivada', 90000, true) returning id into darch;
  set local role authenticated; perform public.q_como(a);

  -- I: ingresos
  insert into public.incomes (id, household_id, amount, source, received_on) values (x, h1, 10000, 'Transferencia recibida', current_date);
  s := public.q_estado(format('insert into public.incomes (id, household_id, amount, source, received_on) values (%L,%L,10000,%L,current_date)', x, h1, 'Transferencia recibida'));
  perform public.q_chk(s like '23505%' and s like '%_pkey%', 'I1 reenviar el mismo id de ingreso da 23505 sobre _pkey (saveOnce lo cuenta como guardado)', s);
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.incomes where id = %L', x)) = 1, 'I2 una sola fila tras dos envios');
  perform public.q_chk(public.q_estado(format('insert into public.incomes (household_id, amount, source) values (%L,0,%L)', h1, 's')) like '23514%', 'I3 ingreso de monto 0 rechazado');
  perform public.q_chk(public.q_estado(format('insert into public.incomes (household_id, amount, source) values (%L,-5,%L)', h1, 's')) like '23514%', 'I4 ingreso negativo rechazado');
  perform public.q_chk(public.q_estado(format('insert into public.incomes (household_id, amount, source) values (%L,10000000000,%L)', h1, 's')) like '23514%', 'I5 ingreso de 10.000.000.000 rechazado');
  perform public.q_chk(public.q_estado(format('insert into public.incomes (household_id, amount, source, received_on) values (%L,100,%L,%L)', h1, 's', '2099-01-01')) like '23514%' or public.q_estado(format('insert into public.incomes (household_id, amount, source, received_on) values (%L,100,%L,%L)', h1, 's', '2099-01-01')) like 'P0001%', 'I6 ingreso con fecha futura rechazado');
  s := public.q_estado(format('insert into public.incomes (household_id, amount, source) values (%L,100,%L)', h1, repeat('x', 5000)));
  perform public.q_chk(s like '23514%', 'I7 fuente de 5000 caracteres rechazada', s);
  perform public.q_como(b);
  s := public.q_estado(format('insert into public.incomes (household_id, amount, source, user_id) values (%L,100,%L,%L)', h1, 'suplanta', a));
  perform public.q_chk(s like '42501%', 'I8 la pareja no crea un ingreso a nombre de A (user_id=A)', s);
  perform public.q_como(c);
  s := public.q_estado(format('insert into public.incomes (household_id, amount, source) values (%L,100,%L)', h1, 'otro hogar'));
  perform public.q_chk(s like '42501%', 'I9 otro hogar no inserta ingresos en el hogar de A', s);
  perform public.q_chk(public.q_cuenta('select count(*) from public.incomes') = 0, 'I10 otro hogar no lee ingresos ajenos');

  -- P: pagos de deuda
  perform public.q_como(a);
  insert into public.debt_payments (id, household_id, debt_id, amount, paid_by, paid_on) values (x, h1, d1, 34400, a, current_date);
  s := public.q_estado(format('insert into public.debt_payments (id, household_id, debt_id, amount, paid_by) values (%L,%L,%L,34400,%L)', x, h1, d1, a));
  perform public.q_chk(s like '23505%' and s like '%_pkey%', 'P1 reenviar el mismo id de pago da 23505 sobre _pkey', s);
  perform public.q_chk(public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,0,%L)', h1, d1, a)) like '23514%', 'P2 pago de monto 0 rechazado');
  perform public.q_chk(public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,-1,%L)', h1, d1, a)) like '23514%', 'P3 pago negativo rechazado');
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,100,%L)', h1, d3, a));
  perform public.q_chk(s not like 'OK%', 'P4 no se abona a una deuda de OTRO hogar con household_id propio', s);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,100,%L)', h1, dper, a));
  perform public.q_chk(s not like 'OK%', 'P5 A no abona a la deuda PERSONAL de B', s, false);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,100,%L)', h1, darch, a));
  perform public.q_chk(s not like 'OK%', 'P6 no se abona a una deuda archivada', s, true);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,9999999,%L)', h1, d1, a));
  perform public.q_chk(false, 'P7 (info) un pago MAYOR que lo adeudado se acepta (original 500.000, pago 9.999.999)', s, true);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,100,%L)', h1, d1, b));
  perform public.q_chk(s like '42501%' or s like '23503%' or s like 'OK%', 'P8 (info) paid_by = la pareja lo decide la politica', s, true);
  perform public.q_como(c);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,100,%L)', h1, d1, c));
  perform public.q_chk(s not like 'OK%', 'P9 otro hogar no abona a la deuda de A', s);
  perform public.q_chk(public.q_cuenta('select count(*) from public.debt_payments') = 0, 'P10 otro hogar no lee pagos ajenos');
  reset role;
end $$;
select format('%s %s%s', estado, nombre, case when detalle <> '' then '  -> ' || left(detalle, 140) else '' end) from q_res order by n;
select 'RESUMEN pasa=' || count(*) filter (where estado = 'PASA') || ' falla=' || count(*) filter (where estado = 'FALLA') || ' info=' || count(*) filter (where estado = 'INFO') from q_res;
rollback;
