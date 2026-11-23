-- Copyright (c) 2026 Dinovance
-- QA ronda 6: gasto con debito o tarjeta de credito (expenses.payment_method / card_debt_id) y saldo informado por el
-- banco (debts.reported_balance / reported_at), contra el ESQUEMA REAL (cadena completa aplicada por e2e-ronda6.sh en
-- un Postgres NUEVO y desechable). Usuarios sinteticos @example.invalid; todo en una transaccion que termina en
-- ROLLBACK. Los datos "legados" (L*) los siembra e2e-ronda6.sh ANTES de aplicar la migracion nueva.
-- FALLA = hallazgo (no aborta). INFO = comportamiento a conocer.
begin;
insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000061a1', 'authenticated', 'authenticated', 'qa6-a@example.invalid', now()),
  ('00000000-0000-0000-0000-0000000061b2', 'authenticated', 'authenticated', 'qa6-b@example.invalid', now()),
  ('00000000-0000-0000-0000-0000000061c3', 'authenticated', 'authenticated', 'qa6-c@example.invalid', now());

create function public.q_como(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function public.q_estado(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
create function public.q_filas(q text) returns text language plpgsql as $$
declare n bigint; begin execute format('with t as (%s) select count(*) from t', q) into n; return n::text;
exception when others then return sqlstate || ' ' || sqlerrm; end $$;
create function public.q_cuenta(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute q into n; return n; end $$;
create function public.q_valor(q text) returns text language plpgsql as $$ declare v text; begin execute q into v; return v; end $$;
create function public.q_total(q text) returns text language plpgsql security definer set search_path = '' as $$ declare v text; begin execute q into v; return v; end $$;
create temp table q_res (n serial, estado text, nombre text, detalle text);
grant all on q_res, q_res_n_seq to public;
create function public.q_chk(p_ok boolean, p_nombre text, p_detalle text default '', p_info boolean default false) returns void language plpgsql as $$
begin insert into q_res (estado, nombre, detalle) values (case when coalesce(p_ok, false) then 'PASA' when p_info then 'INFO' else 'FALLA' end, p_nombre, coalesce(p_detalle, '')); end $$;
grant execute on function public.q_como(uuid), public.q_estado(text), public.q_filas(text), public.q_cuenta(text), public.q_valor(text), public.q_total(text), public.q_chk(boolean, text, text, boolean) to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000061a1'; b uuid := '00000000-0000-0000-0000-0000000061b2'; c uuid := '00000000-0000-0000-0000-0000000061c3';
  lu uuid := '00000000-0000-0000-0000-0000000060e1';           -- usuario legado (sembrado antes de la migracion)
  le uuid := 'aaaaaaaa-6060-4060-8060-0000000000e1';           -- gasto legado
  ld uuid := 'aaaaaaaa-6060-4060-8060-0000000000d1';           -- deuda legada
  h1 uuid; h3 uuid; cat1 uuid; cat3 uuid;
  dcard uuid; dcardA uuid; dcardB uuid; dpriv uuid; dotro uuid; dcardC uuid; dborrar uuid;
  e1 uuid := 'aaaaaaaa-6666-4666-8666-000000000001';
  e2 uuid := 'aaaaaaaa-6666-4666-8666-000000000002';
  e3 uuid := 'aaaaaaaa-6666-4666-8666-000000000003';
  e4 uuid := 'aaaaaaaa-6666-4666-8666-000000000004';
  e5 uuid := 'aaaaaaaa-6666-4666-8666-000000000005';
  e6 uuid := 'aaaaaaaa-6666-4666-8666-000000000006';
  nd uuid := 'aaaaaaaa-6666-4666-8666-0000000000d9';
  s text; s2 text; hoy date := (now() at time zone 'America/Santiago')::date; n int;
begin
  ---------------------------------------------------------------- Escenario
  -- Hogar 1: A y B (pareja). Hogar 3: C.
  set local role authenticated;
  perform public.q_como(a); h1 := public.create_household('QA6 Casa A', 'Ana');
  perform public.q_como(c); h3 := public.create_household('QA6 Casa C', 'Cris');
  reset role;
  insert into public.members (household_id, user_id, display_name) values (h1, b, 'Beto');
  select id into cat1 from public.categories where household_id = h1 limit 1;
  select id into cat3 from public.categories where household_id = h3 limit 1;
  insert into public.debts (household_id, name, kind, original_amount) values (h1, 'CMR de los dos', 'tarjeta', 500000) returning id into dcard;
  insert into public.debts (household_id, name, kind, original_amount, owner_id) values (h1, 'Tarjeta de A', 'tarjeta', 300000, a) returning id into dcardA;
  insert into public.debts (household_id, name, kind, original_amount, owner_id) values (h1, 'Tarjeta de B', 'tarjeta', 300000, b) returning id into dcardB;
  insert into public.debts (household_id, name, kind, original_amount, owner_id) values (h1, 'Tarjeta privada de B', 'tarjeta', 300000, b) returning id into dpriv;
  insert into public.debts (household_id, name, kind, original_amount) values (h1, 'Credito consumo', 'credito', 900000) returning id into dotro;
  insert into public.debts (household_id, name, kind, original_amount) values (h3, 'Tarjeta de C', 'tarjeta', 200000) returning id into dcardC;
  insert into public.debts (household_id, name, kind, original_amount) values (h1, 'Tarjeta a borrar', 'tarjeta', 100000) returning id into dborrar;
  -- B esconde sus deudas a la pareja: la «Tarjeta privada de B» (y la otra personal de B) dejan de verse para A
  set local role authenticated; perform public.q_como(b);
  update public.members set share_debts = false where user_id = b and household_id = h1;
  reset role;

  ---------------------------------------------------------------- (L) Datos viejos
  perform public.q_chk(public.q_total(format('select payment_method || ''|'' || coalesce(card_debt_id::text, ''null'') from public.expenses where id = %L', le)) = 'debito|null',
    'L1 un gasto guardado ANTES de la migracion queda debito y sin tarjeta', public.q_total(format('select payment_method from public.expenses where id = %L', le)));
  perform public.q_chk(public.q_total(format('select coalesce(reported_balance::text, ''null'') || ''|'' || coalesce(reported_at::text, ''null'') from public.debts where id = %L', ld)) = 'null|null',
    'L2 una deuda guardada ANTES de la migracion queda sin saldo informado');
  set local role authenticated; perform public.q_como(lu);
  s := public.q_estado(format('select * from public.expenses where id = %L', le));
  perform public.q_chk(s = 'OK' and public.q_cuenta(format('select count(*) from public.expenses where id = %L', le)) = 1, 'L3 su dueno sigue leyendo el gasto viejo con select * (como la app)', s);
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.debts where id = %L', ld)) = 1, 'L4 su dueno sigue leyendo la deuda vieja');
  s := public.q_filas(format('update public.expenses set amount = 4321 where id = %L returning 1', le));
  perform public.q_chk(s = '1', 'L5 el gasto viejo se sigue editando sin tocar las columnas nuevas', s);
  reset role;
  perform public.q_chk(public.q_total(format($q$select count(*)::text from public.expenses where household_id in (select household_id from public.members where user_id = %L) and payment_method <> 'debito'$q$, lu)) = '0'
                       and public.q_total(format($q$select count(*)::text from public.expenses where household_id in (select household_id from public.members where user_id = %L)$q$, lu)) = '3',
    'L6 las 3 filas legadas quedaron todas como debito');

  ---------------------------------------------------------------- (D) Defaults y CHECKs
  set local role authenticated; perform public.q_como(a);
  -- Columnas EXACTAS que manda la app Android (ExpenseSyncer.rowOf): sin las nuevas
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on) values (%L,%L,%L,15990,%L,true,%L,%L)', e1, h1, cat1, a, 'Lider', hoy));
  perform public.q_chk(s = 'OK', 'D1 la fila exacta de ExpenseSyncer (sin columnas nuevas) se sigue guardando', s);
  perform public.q_chk(public.q_valor(format('select payment_method || ''|'' || coalesce(card_debt_id::text, ''null'') from public.expenses where id = %L', e1)) = 'debito|null',
    'D2 sin payment_method el gasto queda debito y sin tarjeta (default)');
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on, payment_method, card_debt_id) values (%L,%L,%L,25000,%L,true,%L,%L,%L,%L)', e2, h1, cat1, a, 'Falabella', hoy, 'tarjeta', dcard));
  perform public.q_chk(s = 'OK', 'D3 gasto con tarjeta compartida del hogar (payment_method=tarjeta + card_debt_id)', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, payment_method) values (%L,%L,1000,%L,%L)', h1, cat1, a, 'credito'));
  perform public.q_chk(s like '23514%', 'D4 payment_method fuera de debito|tarjeta se rechaza', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, payment_method) values (%L,%L,1000,%L,%L)', h1, cat1, a, 'Tarjeta'));
  perform public.q_chk(s like '23514%', 'D5 los valores distinguen mayusculas (Tarjeta se rechaza)', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, payment_method) values (%L,%L,1000,%L,null)', h1, cat1, a));
  perform public.q_chk(s like '23502%', 'D6 payment_method null explicito se rechaza (NOT NULL)', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, payment_method, card_debt_id) values (%L,%L,1000,%L,%L,%L)', h1, cat1, a, 'debito', dcard));
  perform public.q_chk(s like '23514%', 'D7 card_debt_id con payment_method=debito se rechaza (coherencia)', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, card_debt_id) values (%L,%L,1000,%L,%L)', h1, cat1, a, dcard));
  perform public.q_chk(s like '23514%', 'D8 card_debt_id sin payment_method (queda debito) se rechaza', s);
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, payment_method) values (%L,%L,%L,1000,%L,%L)', e3, h1, cat1, a, 'tarjeta'));
  perform public.q_chk(s = 'OK', 'D9 tarjeta sin card_debt_id se permite (tarjeta aun no registrada)', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, payment_method, card_debt_id) values (%L,%L,1000,%L,%L,%L)', h1, cat1, a, 'tarjeta', dotro));
  perform public.q_chk(s like '23514%', 'D10 card_debt_id debe ser una deuda de tipo tarjeta (credito se rechaza)', s);

  ---------------------------------------------------------------- (H) Aislamiento entre hogares y deudas ajenas
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, payment_method, card_debt_id) values (%L,%L,1000,%L,%L,%L)', h1, cat1, a, 'tarjeta', dcardC));
  perform public.q_chk(s like '42501%', 'H1 A no carga un gasto de su hogar a la tarjeta de OTRO hogar', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, shared, payment_method, card_debt_id) values (%L,%L,1000,%L,true,%L,%L)', h1, cat1, b, 'tarjeta', dcardB));
  perform public.q_chk(s like '42501%', 'H2 A no carga un gasto (pagado por B) a la tarjeta personal de B', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, shared, payment_method, card_debt_id) values (%L,%L,1000,%L,true,%L,%L)', h1, cat1, b, 'tarjeta', dpriv));
  s2 := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, shared, payment_method, card_debt_id) values (%L,%L,1000,%L,true,%L,%L)', h1, cat1, b, 'tarjeta', gen_random_uuid()));
  perform public.q_chk(s like '42501%', 'H3 A no carga un gasto a la tarjeta PRIVADA de B', s);
  perform public.q_chk(s = s2, 'H4 tarjeta privada ajena y tarjeta inexistente dan el mismo error (no revela que existe)', s || ' / ' || s2);
  perform public.q_como(c);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, payment_method, card_debt_id) values (%L,%L,1000,%L,%L,%L)', h3, cat3, c, 'tarjeta', dcard));
  perform public.q_chk(s like '42501%', 'H5 C no carga un gasto de su hogar a una tarjeta del hogar de A', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, payment_method, card_debt_id) values (%L,%L,1000,%L,%L,%L)', h1, cat1, c, 'tarjeta', dcard));
  perform public.q_chk(s like '42501%' or s like '23503%', 'H6 C no inserta gastos en el hogar de A (ni con tarjeta)', s);
  perform public.q_como(b);
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, payment_method, card_debt_id) values (%L,%L,%L,7000,%L,false,%L,%L)', e4, h1, cat1, b, 'tarjeta', dpriv));
  perform public.q_chk(s = 'OK', 'H7 B carga un gasto propio a su tarjeta privada', s);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, shared, payment_method, card_debt_id) values (%L,%L,1000,%L,true,%L,%L)', h1, cat1, a, 'tarjeta', dcardB));
  perform public.q_chk(s like '23514%', 'H8 una tarjeta personal solo la usa su titular (gasto pagado por A con la tarjeta de B)', s);
  perform public.q_como(c);
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.expenses where household_id = %L', h1)) = 0, 'H9 C no ve gastos del hogar de A');
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.expenses where card_debt_id = %L', dcard)) = 0, 'H10 C no encuentra gastos filtrando por la tarjeta del hogar de A');
  s := public.q_filas(format('update public.expenses set payment_method = %L, card_debt_id = %L where id = %L returning 1', 'tarjeta', dcardC, e1));
  perform public.q_chk(s = '0', 'H11 C no cambia el medio de pago de un gasto del hogar de A', s);
  perform public.q_como(a);
  -- B comparte sus gastos personales (share_personal por defecto) pero esconde sus deudas: A ve el gasto, no la tarjeta
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.expenses where id = %L and card_debt_id = %L', e4, dpriv)) = 1
                       and public.q_cuenta(format('select count(*) from public.debts where id = %L', dpriv)) = 0,
    'H12 (info) con share_personal y sin share_debts, A ve el gasto personal de B y el id de la tarjeta, pero no la tarjeta', '', true);
  perform public.q_como(b);
  update public.members set share_personal = false where user_id = b and household_id = h1;
  perform public.q_como(a);
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.expenses where id = %L', e4)) = 0, 'H13 si B esconde sus gastos personales, A no ve el gasto con su tarjeta (privacidad sin cambios)');
  perform public.q_como(b);
  update public.members set share_personal = true where user_id = b and household_id = h1;
  perform public.q_como(a);

  ---------------------------------------------------------------- (U) Editar (UPDATE por columnas)
  s := public.q_filas(format('update public.expenses set payment_method = %L, card_debt_id = %L where id = %L returning 1', 'tarjeta', dcardC, e1));
  perform public.q_chk(s like '42501%', 'U1 A no apunta su gasto a la tarjeta de otro hogar por UPDATE', s);
  s := public.q_filas(format('update public.expenses set payment_method = %L, card_debt_id = %L where id = %L returning 1', 'tarjeta', dpriv, e1));
  perform public.q_chk(s like '42501%', 'U2 A no apunta su gasto a la tarjeta privada de B por UPDATE', s);
  s := public.q_filas(format('update public.expenses set payment_method = %L, card_debt_id = %L where id = %L returning 1', 'tarjeta', dcardA, e1));
  perform public.q_chk(s = '1', 'U3 A cambia su gasto de debito a su tarjeta personal (permiso de columna)', s);
  perform public.q_como(b);
  s := public.q_filas(format('update public.expenses set amount = 16990, note = %L where id = %L returning 1', 'Lider corregido', e1));
  perform public.q_chk(s = '1', 'U4 B corrige monto y nota de un gasto compartido cargado a la tarjeta de A (no cambia la tarjeta)', s);
  s := public.q_filas(format('update public.expenses set paid_by = %L where id = %L returning 1', b, e1));
  perform public.q_chk(s like '42501%', 'U5 B no se pone como pagador de un gasto cargado a la tarjeta personal de A', s);
  s := public.q_filas(format('update public.expenses set card_debt_id = %L where id = %L returning 1', dcard, e1));
  perform public.q_chk(s = '1', 'U6 B pasa el gasto compartido a la tarjeta de los dos', s);
  perform public.q_como(a);
  s := public.q_filas(format('update public.expenses set payment_method = %L where id = %L returning 1', 'debito', e1));
  perform public.q_chk(s like '23514%', 'U7 volver a debito sin limpiar card_debt_id se rechaza', s);
  s := public.q_filas(format('update public.expenses set payment_method = %L, card_debt_id = null where id = %L returning 1', 'debito', e1));
  perform public.q_chk(s = '1', 'U8 volver a debito limpiando card_debt_id', s);
  s := public.q_filas(format('update public.expenses set notified_at = now() where id = %L returning 1', e1));
  perform public.q_chk(s like '42501%', 'U9 las personas siguen sin poder tocar notified_at', s);
  reset role;

  ---------------------------------------------------------------- (X) Borrar la tarjeta
  insert into public.expenses (id, household_id, category_id, amount, paid_by, created_by, payment_method, card_debt_id) values (e5, h1, cat1, 3000, a, a, 'tarjeta', dborrar);
  set local role authenticated; perform public.q_como(a);
  s := public.q_filas(format('delete from public.debts where id = %L returning 1', dborrar));
  perform public.q_chk(s = '1', 'X1 A borra una tarjeta que tiene gastos cargados', s);
  perform public.q_chk(public.q_valor(format('select payment_method || ''|'' || coalesce(card_debt_id::text, ''null'') from public.expenses where id = %L', e5)) = 'tarjeta|null',
    'X2 el gasto se conserva como tarjeta y sin deuda asociada (on delete set null)');
  -- Conversion gasto -> deuda (expenseToDebt): borrar el gasto con tarjeta sigue funcionando
  s := public.q_filas(format('delete from public.expenses where id = %L returning 1', e2));
  perform public.q_chk(s = '1', 'X3 borrar un gasto con tarjeta (conversion/borrado estricto) funciona igual', s);
  s := public.q_estado(format('insert into public.expenses (id, household_id, category_id, amount, paid_by, shared, note, spent_on, payment_method, card_debt_id) values (%L,%L,%L,25000,%L,true,%L,%L,%L,%L)', e2, h1, cat1, a, 'Falabella', hoy, 'tarjeta', dcard));
  perform public.q_chk(s = 'OK', 'X4 deshacer: reinsertar el mismo gasto con su tarjeta', s);
  reset role;

  ---------------------------------------------------------------- (R) Saldo informado por el banco
  set local role authenticated; perform public.q_como(a);
  s := public.q_filas(format('update public.debts set reported_balance = -1, reported_at = %L where id = %L returning 1', hoy, dcard));
  perform public.q_chk(s like '23514%', 'R1 reported_balance negativo se rechaza', s);
  s := public.q_filas(format('update public.debts set reported_balance = 10000000000, reported_at = %L where id = %L returning 1', hoy, dcard));
  perform public.q_chk(s like '23514%', 'R2 reported_balance sobre el tope de montos se rechaza', s);
  s := public.q_filas(format('update public.debts set reported_balance = 120000 where id = %L returning 1', dcard));
  perform public.q_chk(s like '23514%', 'R3 reported_balance sin reported_at se rechaza (van juntos)', s);
  s := public.q_filas(format('update public.debts set reported_at = %L where id = %L returning 1', hoy, dcard));
  perform public.q_chk(s like '23514%', 'R4 reported_at sin reported_balance se rechaza (van juntos)', s);
  s := public.q_filas(format('update public.debts set reported_balance = 120000, reported_at = %L where id = %L returning 1', hoy + 5, dcard));
  perform public.q_chk(s like '23514%', 'R5 reported_at futura se rechaza', s);
  s := public.q_filas(format('update public.debts set reported_balance = 120000, reported_at = %L where id = %L returning 1', '1999-12-31', dcard));
  perform public.q_chk(s like '23514%', 'R6 reported_at anterior a 2000 se rechaza', s);
  s := public.q_filas(format('update public.debts set reported_balance = 120000, reported_at = %L where id = %L returning 1', hoy, dcard));
  perform public.q_chk(s = '1', 'R7 A informa el saldo de la tarjeta de los dos', s);
  s := public.q_filas(format('update public.debts set reported_balance = 0, reported_at = %L where id = %L returning 1', hoy, dcardA));
  perform public.q_chk(s = '1', 'R8 saldo informado 0 (tarjeta pagada) es valido', s);
  s := public.q_filas(format('update public.debts set reported_balance = 5000, reported_at = %L where id = %L returning 1', hoy, dcardB));
  perform public.q_chk(s = '0', 'R9 A no informa el saldo de la tarjeta personal de B', s);
  s := public.q_filas(format('update public.debts set reported_balance = null, reported_at = null where id = %L returning 1', dcard));
  perform public.q_chk(s = '1', 'R10 se puede borrar el saldo informado (ambos a null)', s);
  s := public.q_filas(format('update public.debts set reported_balance = 98000, reported_at = %L where id = %L returning 1', hoy, dcard));
  -- Deuda nueva con saldo informado (columnas de newDebtRow + las nuevas)
  s := public.q_estado(format('insert into public.debts (id, household_id, name, kind, original_amount, monthly_payment, monthly_rate, owner_id, due_day, reported_balance, reported_at) values (%L,%L,%L,%L,250000,0,0,null,null,240000,%L)', nd, h1, 'CMR nueva', 'tarjeta', hoy));
  perform public.q_chk(s = 'OK', 'R11 crear una deuda con saldo informado', s);
  s := public.q_estado(format('insert into public.debts (household_id, name, kind, original_amount, reported_balance, reported_at) values (%L,%L,%L,1000,-5,%L)', h1, 'Mala', 'tarjeta', hoy));
  perform public.q_chk(s like '23514%', 'R12 crear una deuda con saldo informado negativo se rechaza', s);
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.debts where id = %L', dpriv)) = 0, 'R13 A no ve la tarjeta privada de B ni su saldo informado');
  perform public.q_como(b);
  s := public.q_filas(format('update public.debts set reported_balance = 7000, reported_at = %L where id = %L returning 1', hoy, dpriv));
  perform public.q_chk(s = '1', 'R14 B informa el saldo de su tarjeta privada', s);
  perform public.q_como(c);
  perform public.q_chk(public.q_cuenta(format('select count(*) from public.debts where household_id = %L', h1)) = 0, 'R15 C no lee deudas (ni saldos informados) del hogar de A');
  s := public.q_filas(format('update public.debts set reported_balance = 1, reported_at = %L where id = %L returning 1', hoy, dcard));
  perform public.q_chk(s = '0', 'R16 C no informa saldos en deudas del hogar de A', s);
  perform public.q_como(a);
  perform public.q_chk(public.q_valor(format('select reported_balance::text from public.debts where id = %L', dcard)) = '98000', 'R17 la pareja lee el saldo informado de la tarjeta de los dos');
  reset role;

  ---------------------------------------------------------------- (F) Funciones que crean gastos y anon
  set local role authenticated; perform public.q_como(a);
  insert into public.recurring_expenses (household_id, category_id, amount, note, paid_by, day_of_month, starts_on, created_by)
    values (h1, cat1, 9990, 'Streaming', a, 1, date_trunc('month', hoy)::date, a);
  n := public.apply_recurring();
  perform public.q_chk(n >= 1 and public.q_cuenta(format($q$select count(*) from public.expenses where household_id = %L and note = 'Streaming' and payment_method = 'debito' and card_debt_id is null$q$, h1)) = n,
    'F1 apply_recurring sigue generando gastos (quedan debito)', n::text);
  reset role;
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  s := public.q_estado(format('insert into public.expenses (household_id, category_id, amount, paid_by, payment_method, card_debt_id) values (%L,%L,1000,%L,%L,%L)', h1, cat1, a, 'tarjeta', dcard));
  perform public.q_chk(s like '42501%', 'F2 anon no inserta gastos', s);
  s := public.q_estado(format('update public.debts set reported_balance = 1, reported_at = %L where id = %L', hoy, dcard));
  perform public.q_chk(s like '42501%', 'F3 anon no toca saldos informados', s);
  reset role;
  perform public.q_chk(not has_function_privilege('authenticated', 'public.check_gasto_tarjeta()', 'execute'), 'F4 la funcion del trigger no se expone como RPC');
end $$;
select format('%s %s%s', estado, nombre, case when detalle <> '' then '  -> ' || left(detalle, 160) else '' end) from q_res order by n;
select 'RESUMEN pasa=' || count(*) filter (where estado = 'PASA') || ' falla=' || count(*) filter (where estado = 'FALLA') || ' info=' || count(*) filter (where estado = 'INFO') from q_res;
rollback;
