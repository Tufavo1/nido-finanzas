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

  raise notice 'TODAS LAS PRUEBAS PASARON';
end $$;

rollback;