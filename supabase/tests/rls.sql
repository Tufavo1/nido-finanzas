begin;

insert into
    auth.users (id, aud, role, email)
values (
        '00000000-0000-0000-0000-0000000000a1',
        'authenticated',
        'authenticated',
        'a@test.cl'
    ),
    (
        '00000000-0000-0000-0000-0000000000b2',
        'authenticated',
        'authenticated',
        'b@test.cl'
    ),
    (
        '00000000-0000-0000-0000-0000000000c3',
        'authenticated',
        'authenticated',
        'c@test.cl'
    );

create function public.debe_fallar(q text) returns void
language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    return;
  end;
  raise exception 'DEBIA FALLAR: %', q;
end $$;

grant execute on function public.debe_fallar (text) to authenticated;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  c uuid := '00000000-0000-0000-0000-0000000000c3';
  h1 uuid; h3 uuid; code text; cat1 uuid; n int;
begin
  set local role authenticated;

  -- A crea el hogar
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  h1 := public.create_household('Casa', 'Cote');
  select invite_code into code from public.households;
  assert length(code) = 12, 'A debe ver un código de 12 caracteres';
  select count(*) into n from public.categories;
  assert n = 6, 'Deben sembrarse 6 categorías';
  select id into cat1 from public.categories where name = 'Supermercado';
  perform public.debe_fallar($q$select public.create_household('Otra','Cote')$q$);

  -- B entra con el código (en minúsculas también sirve)
  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true);
  perform public.debe_fallar($q$select public.join_household('CODIGOMALO','Pareja')$q$);
  perform public.join_household(lower(code), 'Pareja');
  select count(*) into n from public.members;
  assert n = 2, 'B debe ver 2 miembros';

  -- C es ajeno: no entra con el código usado y no ve nada
  perform set_config('request.jwt.claims', json_build_object('sub', c)::text, true);
  perform public.debe_fallar(format($q$select public.join_household(%L,'Intruso')$q$, code));
  select count(*) into n from public.households;
  assert n = 0, 'C no debe ver hogares ajenos';
  h3 := public.create_household('Ajena', 'Extraña');
  perform public.debe_fallar(format(
    $q$insert into public.expenses (household_id, category_id, amount, paid_by)
       values (%L, %L, 1000, %L)$q$, h1, cat1, c));

  -- A registra gastos y se prueban las reglas
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  insert into public.expenses (household_id, category_id, amount, paid_by)
    values (h1, cat1, 48900, a);
  perform public.debe_fallar(format(
    $q$insert into public.expenses (household_id, category_id, amount, paid_by)
       values (%L, %L, 0, %L)$q$, h1, cat1, a));
  perform public.debe_fallar(format(
    $q$insert into public.expenses (household_id, category_id, amount, paid_by)
       values (%L, %L, 1000, %L)$q$, h1, cat1, c));
  perform public.debe_fallar(format(
    $q$update public.households set invite_code = 'HACK' where id = %L$q$, h1));
  perform public.debe_fallar($q$select public.rotate_invite_code()$q$);

  -- B ve el gasto de A; C no
  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true);
  select count(*) into n from public.expenses;
  assert n = 1, 'B debe ver el gasto de A';
  perform set_config('request.jwt.claims', json_build_object('sub', c)::text, true);
  select count(*) into n from public.expenses;
  assert n = 0, 'C no debe ver gastos ajenos';

  -- Sueldo: privado. B no ve el de A ni puede escribir uno a nombre de A. C tampoco.
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  insert into public.salaries (user_id, household_id, amount, pay_day) values (a, h1, 1500000, 28);
  select count(*) into n from public.salaries;
  assert n = 1, 'A debe ver su sueldo';
  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true);
  select count(*) into n from public.salaries;
  assert n = 0, 'B NO debe ver el sueldo de A';
  perform public.debe_fallar(format(
    $q$insert into public.salaries (user_id, household_id, amount) values (%L, %L, 1)$q$, a, h1));
  perform public.debe_fallar(format($q$update public.salaries set amount = 1 where user_id = %L$q$, a));
  insert into public.salaries (user_id, household_id, amount) values (b, h1, 900000);
  perform set_config('request.jwt.claims', json_build_object('sub', c)::text, true);
  select count(*) into n from public.salaries;
  assert n = 0, 'C no debe ver sueldos ajenos';

  -- Deudas: las ven los dos del hogar, no los ajenos
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  insert into public.debts (household_id, name, kind, original_amount, monthly_payment, monthly_rate)
    values (h1, 'Tarjeta', 'tarjeta', 500000, 50000, 2.5);
  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true);
  select count(*) into n from public.debts;
  assert n = 1, 'B debe ver las deudas del hogar';
  insert into public.debt_payments (household_id, debt_id, amount, paid_by)
    select h1, id, 50000, b from public.debts limit 1;
  perform public.debe_fallar(format(
    $q$insert into public.debt_payments (household_id, debt_id, amount, paid_by)
       select %L, id, 1000, %L from public.debts limit 1$q$, h1, a));
  perform set_config('request.jwt.claims', json_build_object('sub', c)::text, true);
  select count(*) into n from public.debts;
  assert n = 0, 'C no debe ver deudas ajenas';

  -- Perfil: lo ven los dos del hogar, solo el dueño lo edita, el ajeno no lo ve
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  insert into public.profiles (user_id, household_id, profession) values (a, h1, 'Enfermera');
  perform set_config('request.jwt.claims', json_build_object('sub', b)::text, true);
  select count(*) into n from public.profiles;
  assert n = 1, 'B debe ver el perfil de A';
  perform public.debe_fallar(format($q$update public.profiles set profession = 'x' where user_id = %L$q$, a));
  perform set_config('request.jwt.claims', json_build_object('sub', c)::text, true);
  select count(*) into n from public.profiles;
  assert n = 0, 'C no debe ver perfiles ajenos';

  raise notice 'TODAS LAS PRUEBAS PASARON';
end $$;

rollback;