-- Copyright (c) 2026 Dinovance
-- QA ronda 5: RLS e integridad contra el ESQUEMA REAL (cadena completa de supabase/migrations aplicada en un
-- Postgres NUEVO y desechable por e2e-ronda5.sh). Usuarios sinteticos @example.invalid; todo en una transaccion
-- que termina en ROLLBACK. FALLA = hallazgo (no aborta). INFO = comportamiento a conocer, no es un fallo.
-- Filas con las columnas EXACTAS que manda la app (web/src/lib/movements.ts incomeRow/debtPaymentRow/newDebtRow,
-- web/src/lib/expenseToDebt.ts paymentFromExpense, web/src/lib/saveExpense.ts deleteExpense).
begin;
insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000051a1', 'authenticated', 'authenticated', 'qa5-a@example.invalid', now()),
  ('00000000-0000-0000-0000-0000000051b2', 'authenticated', 'authenticated', 'qa5-b@example.invalid', now()),
  ('00000000-0000-0000-0000-0000000051c3', 'authenticated', 'authenticated', 'qa5-c@example.invalid', now());

create function public.q_como(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function public.q_estado(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
-- Ejecuta una sentencia que devuelve filas (insert/update/delete ... returning 1) y cuenta cuantas afecto (o el error)
create function public.q_filas(q text) returns text language plpgsql as $$
declare n bigint; begin execute format('with t as (%s) select count(*) from t', q) into n; return n::text;
exception when others then return sqlstate || ' ' || sqlerrm; end $$;
create function public.q_cuenta(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute q into n; return n; end $$;
-- Cuenta como superusuario (sin RLS): para comprobar que la fila sigue ahi aunque el actor no la vea
create function public.q_total(q text) returns bigint language plpgsql security definer set search_path = '' as $$ declare n bigint; begin execute q into n; return n; end $$;
create temp table q_res (n serial, estado text, nombre text, detalle text);
grant all on q_res, q_res_n_seq to public;
create function public.q_chk(p_ok boolean, p_nombre text, p_detalle text default '', p_info boolean default false) returns void language plpgsql as $$
begin insert into q_res (estado, nombre, detalle) values (case when p_ok then 'PASA' when p_info then 'INFO' else 'FALLA' end, p_nombre, coalesce(p_detalle, '')); end $$;
grant execute on function public.q_como(uuid), public.q_estado(text), public.q_filas(text), public.q_cuenta(text), public.q_total(text), public.q_chk(boolean, text, text, boolean) to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000051a1'; b uuid := '00000000-0000-0000-0000-0000000051b2'; c uuid := '00000000-0000-0000-0000-0000000051c3';
  h1 uuid; h3 uuid; cat1 uuid; d1 uuid; d3 uuid; dper uuid; s text; hoy date := (now() at time zone 'America/Santiago')::date;
  inc uuid := 'aaaaaaaa-5555-4555-8555-000000000001';
  inc2 uuid := 'aaaaaaaa-5555-4555-8555-000000000002';
  ea uuid := 'aaaaaaaa-5555-4555-8555-0000000000e1';
  eb uuid := 'aaaaaaaa-5555-4555-8555-0000000000e2';
  es uuid := 'aaaaaaaa-5555-4555-8555-0000000000e3';
  pay uuid := 'aaaaaaaa-5555-4555-8555-0000000000f1';
  nd uuid := 'aaaaaaaa-5555-4555-8555-0000000000d1';
  tok text := 'fcm-token-qa5-AAAAAAAAAAAAAAAAAAAAAAAAAAAA';
begin
  -- Hogar 1: A y B (pareja). Hogar 3: C. Como en produccion: create_household con el rol authenticated.
  set local role authenticated;
  perform public.q_como(a); h1 := public.create_household('QA5 Casa A', 'Ana');
  perform public.q_como(c); h3 := public.create_household('QA5 Casa C', 'Cris');
  reset role;
  insert into public.members (household_id, user_id, display_name) values (h1, b, 'Beto');
  select id into cat1 from public.categories where household_id = h1 limit 1;
  insert into public.debts (household_id, name, original_amount) values (h1, 'CMR compartida', 500000) returning id into d1;
  insert into public.debts (household_id, name, original_amount) values (h3, 'Deuda de C', 90000) returning id into d3;
  insert into public.debts (household_id, name, original_amount, owner_id) values (h1, 'Personal de B', 90000, b) returning id into dper;
  perform public.q_chk(cat1 is not null, 'S0 create_household deja categorias para el hogar', coalesce(cat1::text, 'sin categoria'));

  ---------------------------------------------------------------- (a)(b)(c) incomes
  set local role authenticated; perform public.q_como(a);
  s := public.q_estado(format('insert into public.incomes (id, household_id, amount, source, received_on) values (%L,%L,10000,%L,%L)', inc, h1, 'Ingreso extra', hoy));
  perform public.q_chk(s = 'OK', 'I1 A inserta un ingreso con las columnas exactas de incomeRow {id,household_id,amount,source,received_on}', s);
  perform public.q_chk(public.q_total(format('select count(*) from public.incomes where id = %L and user_id = %L', inc, a)) = 1, 'I2 user_id lo pone auth.uid() (default), no el cliente');
  s := public.q_estado(format('insert into public.incomes (id, household_id, amount, source, received_on) values (%L,%L,10000,%L,%L)', inc, h1, 'Ingreso extra', hoy));
  perform public.q_chk(s like '23505%', 'I3 idempotencia: el mismo id otra vez da 23505', s);
  perform public.q_chk(public.q_total(format('select count(*) from public.incomes where id = %L', inc)) = 1, 'I4 idempotencia: sigue habiendo UNA fila');
  perform public.q_como(b);
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.incomes where id = %L', inc)) = 0, 'I5 la pareja (B, mismo hogar) NO lee el ingreso de A');
  perform public.q_chk(public.q_cuenta('select count(*) from public.incomes') = 0, 'I6 la pareja no ve ningun ingreso de A (tabla completa)');
  s := public.q_filas(format('update public.incomes set amount = 1 where id = %L returning 1', inc));
  perform public.q_chk(s = '0', 'I7 la pareja no modifica el ingreso de A (0 filas)', s);
  s := public.q_filas(format('delete from public.incomes where id = %L returning 1', inc));
  perform public.q_chk(s = '0' and public.q_total(format('select count(*) from public.incomes where id = %L', inc)) = 1, 'I8 la pareja NO borra el ingreso de A (0 filas, la fila sigue)', s);
  s := public.q_estado(format('insert into public.incomes (household_id, amount, source, user_id) values (%L,100,%L,%L)', h1, 'suplanta', a));
  perform public.q_chk(s like '42501%', 'I9 la pareja no inserta un ingreso a nombre de A (user_id=A)', s);
  perform public.q_como(c);
  s := public.q_estado(format('insert into public.incomes (household_id, amount, source) values (%L,100,%L)', h1, 'otro hogar'));
  perform public.q_chk(s like '42501%', 'I10 otro hogar no inserta ingresos en el hogar de A', s);
  perform public.q_como(a);
  s := public.q_filas(format('update public.incomes set household_id = %L where id = %L returning 1', h3, inc));
  perform public.q_chk(s not similar to '[0-9]+' or s = '0', 'I11 A no mueve su ingreso a OTRO hogar (household_id ajeno)', s);
  insert into public.incomes (id, household_id, amount, source, received_on) values (inc2, h1, 5000, 'Ingreso extra', hoy);
  s := public.q_filas(format('delete from public.incomes where id = %L returning 1', inc2));
  perform public.q_chk(s = '1', 'I12 A borra SU propio ingreso (1 fila)', s);
  reset role;
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  s := public.q_estado('select count(*) from public.incomes');
  perform public.q_chk(s like '42501%' or public.q_cuenta('select count(*) from public.incomes') = 0, 'I13 anon no lee incomes', s);
  reset role;

  ---------------------------------------------------------------- (d) gasto -> pago de deuda
  set local role authenticated; perform public.q_como(a);
  insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (ea, h1, cat1, 34400, a, false, 'Pago CMR', hoy);
  perform public.q_como(b);
  insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (eb, h1, cat1, 20000, b, false, 'Personal B', hoy);
  insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (es, h1, cat1, 15000, b, true, 'Compartido pagado por B', hoy);
  perform public.q_como(a);
  -- paymentFromExpense: {id, household_id, debt_id, amount, paid_by=me, paid_on=spent_on}
  s := public.q_estado(format('insert into public.debt_payments (id, household_id, debt_id, amount, paid_by, paid_on) values (%L,%L,%L,34400,%L,%L)', pay, h1, d1, a, hoy));
  perform public.q_chk(s = 'OK', 'D1 A inserta el pago con las columnas de paymentFromExpense', s);
  s := public.q_filas(format('delete from public.expenses where id = %L returning 1', ea));
  perform public.q_chk(s = '1', 'D2 A borra SU gasto personal convertido (1 fila)', s);
  s := public.q_estado(format('insert into public.debt_payments (id, household_id, debt_id, amount, paid_by, paid_on) values (%L,%L,%L,34400,%L,%L)', pay, h1, d1, a, hoy));
  perform public.q_chk(s like '23505%', 'D3 repetir la conversion (mismo id de pago) da 23505 y no duplica', s);
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (%L,%L,%L,34400,%L,false,%L,%L)', ea, h1, cat1, a, 'Pago CMR', hoy));
  perform public.q_chk(s = 'OK', 'D4 deshacer: reinsertExpense devuelve el gasto con el MISMO id', s);
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.expenses where id = %L', eb)) = 1, 'D5 (contexto) A VE el gasto personal de B (share_personal=true por defecto)');
  s := public.q_filas(format('delete from public.expenses where id = %L returning 1', eb));
  perform public.q_chk(s = '0' and public.q_total(format('select count(*) from public.expenses where id = %L', eb)) = 1,
    'D6 A NO borra el gasto personal de B: RLS deja 0 filas SIN error (deleteExpense no lo detecta, ver R5-DB-02)', s);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,100,%L)', h1, d3, a));
  perform public.q_chk(s like '23503%' or s like '42501%', 'D7 pago contra una deuda de OTRO hogar (con household_id propio) falla', s);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,100,%L)', h3, d3, a));
  perform public.q_chk(s like '42501%', 'D8 pago con household_id de OTRO hogar falla por RLS', s);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,100,%L)', h1, dper, a));
  perform public.q_chk(s like '42501%', 'D9 A no abona a la deuda PERSONAL de B (insert)', s);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L,%L,100,%L)', h1, d1, b));
  perform public.q_chk(s like '42501%', 'D10 A no registra un pago a nombre de B (paid_by=B)', s);
  -- Hueco candidato: UPDATE del propio pago hacia la deuda personal de la pareja (la politica de UPDATE no mira la deuda)
  s := public.q_filas(format('update public.debt_payments set debt_id = %L where id = %L returning 1', dper, pay));
  perform public.q_chk(s <> '1', 'D11 A NO puede mover SU pago a la deuda PERSONAL de B con UPDATE (R5-DB-01)', s);
  s := public.q_filas(format('update public.debt_payments set debt_id = %L where id = %L returning 1', d3, pay));
  perform public.q_chk(s <> '1', 'D12 A no mueve su pago a una deuda de otro hogar con UPDATE', s);
  s := public.q_filas(format('update public.debt_payments set paid_by = %L where id = %L returning 1', b, pay));
  perform public.q_chk(s <> '1', 'D13 A no reasigna su pago a B (paid_by) con UPDATE', s);
  s := public.q_filas(format('delete from public.expenses where id = %L returning 1', es));
  perform public.q_chk(false, 'D14 (info) A puede borrar un gasto COMPARTIDO pagado por B (diseno: lo compartido es de ambos; la UI solo convierte gastos propios personales)', 'filas=' || s, true);
  perform public.q_como(b);
  insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values ('aaaaaaaa-5555-4555-8555-0000000000e4', h1, cat1, 80000, b, true, 'Compartido 2', hoy);
  perform public.q_como(a);
  s := public.q_filas(format('update public.expenses set shared = false, paid_by = %L where id = %L returning 1', a, 'aaaaaaaa-5555-4555-8555-0000000000e4'));
  perform public.q_chk(false, 'D18 (info) A puede pasar un gasto COMPARTIDO de B a gasto PERSONAL suyo (UPDATE shared/paid_by permitido por columnas y politica)', 'filas=' || s, true);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, shared, spent_on, notified_at) values (%L,%L,90000,%L,true,%L,now())', h1, cat1, a, hoy));
  perform public.q_chk(false, 'D19 (info) quien crea el gasto puede insertarlo con notified_at ya puesto (el aviso a la pareja depende del cliente que lo crea)', s, true);
  perform public.q_como(c);
  perform public.q_chk(public.q_cuenta('select count(*) from public.debt_payments') = 0 and public.q_cuenta('select count(*) from public.expenses') = 0, 'D15 otro hogar no lee pagos ni gastos del hogar 1');
  s := public.q_filas(format('delete from public.debt_payments where id = %L returning 1', pay));
  perform public.q_chk(s = '0', 'D16 otro hogar no borra el pago (0 filas)', s);
  perform public.q_como(b);
  s := public.q_filas(format('delete from public.debt_payments where id = %L returning 1', pay));
  perform public.q_chk(s = '0', 'D17 la pareja no borra el pago de A (debt_payments_delete exige paid_by propio)', s);
  reset role;

  ---------------------------------------------------------------- (e) deuda nueva desde la app (newDebtRow)
  set local role authenticated; perform public.q_como(a);
  s := public.q_estado(format('insert into public.debts (id, household_id, name, kind, original_amount, monthly_payment, monthly_rate, owner_id, due_day) values (%L,%L,%L,%L,500000,0,0,null,null)', nd, h1, 'CMR Mastercard Premium', 'tarjeta'));
  perform public.q_chk(s = 'OK', 'N1 newDebtRow (kind tarjeta, cuota 0, tasa 0, owner null, due_day null) pasa los checks', s);
  s := public.q_estado(format('insert into public.debts (id, household_id, name, kind, original_amount, monthly_payment, monthly_rate, owner_id, due_day) values (%L,%L,%L,%L,500000,0,0,null,null)', nd, h1, 'CMR Mastercard Premium', 'tarjeta'));
  perform public.q_chk(s like '23505%', 'N2 el mismo id de deuda (id estable por borrador) da 23505', s);
  s := public.q_estado(format('insert into public.debts (household_id, name, kind, original_amount, monthly_payment, monthly_rate, owner_id, due_day) values (%L,%L,%L,1,0,0,null,null)', h1, repeat('n', 60), 'otro'));
  perform public.q_chk(s = 'OK', 'N3 kind otro y nombre de 60 caracteres (lo que deja el slice(0,60)) se aceptan', s);
  s := public.q_estado(format('insert into public.debts (household_id, name, kind, original_amount, monthly_payment, monthly_rate, owner_id, due_day) values (%L,%L,%L,1,0,0,null,null)', h1, repeat('n', 61), 'otro'));
  perform public.q_chk(s like '23514%', 'N4 nombre de 61 caracteres rechazado', s);
  s := public.q_estado(format('insert into public.debts (household_id, name, kind, original_amount, monthly_payment, monthly_rate, owner_id, due_day) values (%L,%L,%L,0,0,0,null,null)', h1, 'Saldo cero', 'tarjeta'));
  perform public.q_chk(s like '23514%', 'N5 saldo 0 rechazado por la base (el front debe exigir saldo > 0 antes de crear la deuda)', s);
  s := public.q_estado(format('insert into public.debts (household_id, name, kind, original_amount, monthly_payment, monthly_rate, owner_id, due_day) values (%L,%L,%L,100,0,0,null,null)', h1, '', 'tarjeta'));
  perform public.q_chk(s like '23514%', 'N6 nombre vacio (un nombre solo de espacios queda vacio tras trim) rechazado', s);
  s := public.q_estado(format('insert into public.debts (household_id, name, kind, original_amount) values (%L,%L,%L,100)', h1, 'x', 'tarjeta-falsa'));
  perform public.q_chk(s like '23514%', 'N7 kind fuera de la lista rechazado', s);
  perform public.q_como(b);
  s := public.q_estado(format('insert into public.debts (household_id, name, original_amount, owner_id) values (%L,%L,100,%L)', h1, 'a nombre de A', a));
  perform public.q_chk(s like '42501%', 'N8 la pareja no crea una deuda personal a nombre de A', s);
  perform public.q_como(c);
  s := public.q_estado(format('insert into public.debts (household_id, name, original_amount) values (%L,%L,100)', h1, 'intrusa'));
  perform public.q_chk(s like '42501%', 'N9 otro hogar no crea deudas en el hogar 1', s);
  perform public.q_como(a);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by, paid_on) values (%L,%L,34400,%L,%L)', h1, nd, a, hoy));
  perform public.q_chk(s = 'OK', 'N10 el pago contra la deuda recien creada (flujo «deuda nueva») funciona', s);
  reset role;

  ---------------------------------------------------------------- (f) fechas validas (trigger check_fecha_valida)
  set local role authenticated; perform public.q_como(a);
  s := public.q_estado(format('insert into public.incomes (household_id, amount, source, received_on) values (%L,100,%L,%L)', h1, 's', hoy + 1));
  perform public.q_chk(s = 'OK', 'F1 ingreso con fecha de MANANA se acepta (margen de 1 dia por zona horaria)', s);
  s := public.q_estado(format('insert into public.incomes (household_id, amount, source, received_on) values (%L,100,%L,%L)', h1, 's', hoy + 2));
  perform public.q_chk(s like '23514%', 'F2 ingreso con fecha de pasado manana rechazado', s);
  s := public.q_estado(format('insert into public.incomes (household_id, amount, source, received_on) values (%L,100,%L,%L)', h1, 's', '1999-12-31'));
  perform public.q_chk(s like '23514%', 'F3 ingreso anterior a 2000 rechazado', s);
  s := public.q_estado(format('insert into public.incomes (household_id, amount, source, received_on) values (%L,100,%L,%L)', h1, 's', '2000-01-01'));
  perform public.q_chk(s = 'OK', 'F4 ingreso del 2000-01-01 se acepta (borde)', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, shared, spent_on) values (%L,%L,100,%L,false,%L)', h1, cat1, a, hoy + 2));
  perform public.q_chk(s like '23514%', 'F5 gasto con fecha futura rechazado', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, shared, spent_on) values (%L,%L,100,%L,false,%L)', h1, cat1, a, '1999-01-01'));
  perform public.q_chk(s like '23514%', 'F6 gasto anterior a 2000 rechazado', s);
  s := public.q_estado(format('update public.expenses set spent_on = %L where id = %L', '2099-01-01', ea));
  perform public.q_chk(s like '23514%', 'F7 UPDATE de spent_on a 2099 rechazado (el trigger cubre update)', s);
  s := public.q_estado(format('update public.incomes set received_on = %L where id = %L', '2099-01-01', inc));
  perform public.q_chk(s like '23514%', 'F8 UPDATE de received_on a 2099 rechazado', s);
  s := public.q_estado(format('insert into public.debt_payments (household_id, debt_id, amount, paid_by, paid_on) values (%L,%L,100,%L,%L)', h1, d1, a, hoy + 5));
  perform public.q_chk(s like '23514%', 'F9 pago de deuda con fecha futura rechazado', s);
  s := public.q_estado(format('insert into public.incomes (household_id, amount, source) values (%L,100,%L)', h1, 's'));
  perform public.q_chk(s = 'OK', 'F10 sin received_on usa el default (hoy en Santiago) y pasa el trigger', s);
  reset role;

  ---------------------------------------------------------------- (g) native_push_tokens
  set local role authenticated; perform public.q_como(a);
  s := public.q_estado(format('insert into public.native_push_tokens (token, platform) values (%L,%L)', tok, 'android'));
  perform public.q_chk(s = 'OK' and public.q_total(format('select count(*) from public.native_push_tokens where token = %L and user_id = %L', tok, a)) = 1, 'T1 A registra su token (user_id = auth.uid() por defecto)', s);
  perform public.q_como(b);
  perform public.q_chk(public.q_cuenta('select count(*) from public.native_push_tokens') = 0, 'T2 la pareja no lee el token de A');
  s := public.q_filas(format('delete from public.native_push_tokens where token = %L returning 1', tok));
  perform public.q_chk(s = '0', 'T3 la pareja no borra el token de A', s);
  s := public.q_filas(format('update public.native_push_tokens set user_id = %L where token = %L returning 1', b, tok));
  perform public.q_chk(s <> '1', 'T4 la pareja no se apropia del token de A con UPDATE', s);
  s := public.q_estado(format('insert into public.native_push_tokens (token, platform, user_id) values (%L,%L,%L)', 'fcm-token-qa5-BBBBBBBBBBBBBBBBBBBBBBBBB', 'android', a));
  perform public.q_chk(s like '42501%', 'T5 la pareja no registra un token a nombre de A', s);
  s := public.q_estado(format('insert into public.native_push_tokens (token, platform) values (%L,%L)', tok, 'android'));
  perform public.q_chk(false, 'T6 (info, S-11) B no puede registrar el mismo token que A; el 23505 revela que existe', s, true);
  s := public.q_estado(format('insert into public.native_push_tokens (token, platform) values (%L,%L)', 'token con espacios <script>', 'android'));
  perform public.q_chk(s like '23514%', 'T7 token con caracteres fuera del patron rechazado', s);
  perform public.q_como(c);
  for i in 1..10 loop perform public.q_estado(format('insert into public.native_push_tokens (token, platform) values (%L,%L)', 'fcm-token-qa5-C' || lpad(i::text, 25, '0'), 'android')); end loop;
  s := public.q_estado(format('insert into public.native_push_tokens (token, platform) values (%L,%L)', 'fcm-token-qa5-C-once-xxxxxxxxxxxxxxxx', 'android'));
  perform public.q_chk(s like '54000%', 'T8 el token 11 de la misma persona se rechaza (tope 10)', s);
  perform public.q_como(a);
  s := public.q_filas(format('delete from public.native_push_tokens where token = %L returning 1', tok));
  perform public.q_chk(s = '1', 'T9 A borra su propio token (cierre de sesion)', s);
  reset role;
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  s := public.q_estado('select count(*) from public.native_push_tokens');
  perform public.q_chk(s like '42501%' or public.q_cuenta('select count(*) from public.native_push_tokens') = 0, 'T10 anon no lee tokens', s);
  reset role;
end $$;
select format('%s %s%s', estado, nombre, case when detalle <> '' then '  -> ' || left(detalle, 160) else '' end) from q_res order by n;
select 'RESUMEN pasa=' || count(*) filter (where estado = 'PASA') || ' falla=' || count(*) filter (where estado = 'FALLA') || ' info=' || count(*) filter (where estado = 'INFO') from q_res;
rollback;
