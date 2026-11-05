-- Seguridad: lo que la auditoría del 2026-11-04 encontró no debe poder repetirse.
--  · Deudas: nadie toca las deudas personales de la otra persona (ni crea una a su nombre ni le anota pagos).
--  · Perfil: solo su dueño lo lee.
--  · partner_can_see: no revela la privacidad de cuentas de otros hogares.
--  · Código de invitación: tope de intentos por hora y por día.
-- Ejecutar: docker exec -i supabase_db_nido psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/deudas_perfil_invitacion.sql
begin;

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@test.cl'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@test.cl'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c@test.cl'),
  ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'd@test.cl');

create function public.como(u uuid) returns void
language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u)::text, true) $$;
grant execute on function public.como(uuid) to authenticated;

create function public.filas(q text) returns int
language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.filas(text) to authenticated;

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
grant execute on function public.debe_fallar(text) to authenticated;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  c uuid := '00000000-0000-0000-0000-0000000000c3';
  d uuid := '00000000-0000-0000-0000-0000000000d4';
  h uuid; hc uuid; code text; d_a uuid; d_b uuid; d_dos uuid; n int; i int;
begin
  set local role authenticated;

  -- A y B forman un hogar; C vive en otro hogar
  perform public.como(a);
  h := public.create_household('Casa', 'Ana');
  select invite_code into code from public.households where id = h;
  perform public.como(b);
  perform public.join_household(code, 'Beto');
  perform public.como(c);
  hc := public.create_household('Otra casa', 'Carla');

  -- ---------- Deudas: cada quien toca solo las suyas ----------
  perform public.como(a);
  insert into public.debts (household_id, name, owner_id, original_amount, monthly_payment) values (h, 'Deuda de A', a, 100000, 10000) returning id into d_a;
  insert into public.debts (household_id, name, owner_id, original_amount, monthly_payment) values (h, 'Deuda de los dos', null, 200000, 20000) returning id into d_dos;
  perform public.como(b);
  insert into public.debts (household_id, name, owner_id, original_amount, monthly_payment) values (h, 'Deuda de B', b, 50000, 5000) returning id into d_b;
  assert (select count(*) from public.debts) = 3, 'por defecto B ve las tres deudas';

  assert public.filas(format($q$update public.debts set name = 'HACKEADA', monthly_payment = 1 where id = %L$q$, d_a)) = 0, 'B no edita la deuda personal de A';
  assert public.filas(format($q$delete from public.debts where id = %L$q$, d_a)) = 0, 'B no borra la deuda personal de A';
  assert public.filas(format($q$update public.debts set archived = true where id = %L$q$, d_a)) = 0, 'B no archiva la deuda personal de A';
  perform public.debe_fallar(format($q$insert into public.debts (household_id, name, owner_id, original_amount) values (%L, 'Falsa', %L, 999999)$q$, h, a));
  perform public.debe_fallar(format($q$update public.debts set owner_id = %L where id = %L$q$, a, d_b));  -- no se la puede pasar a A
  assert (select name from public.debts where id = d_a) = 'Deuda de A', 'la deuda de A quedó intacta';

  -- B sí toca las suyas y las de los dos
  assert public.filas(format($q$update public.debts set name = 'Mi deuda' where id = %L$q$, d_b)) = 1, 'B edita su deuda';
  assert public.filas(format($q$update public.debts set monthly_payment = 25000 where id = %L$q$, d_dos)) = 1, 'B edita una deuda de los dos';
  -- ... y puede pasar la suya a «los dos» o quedársela, pero no regalársela a A
  assert public.filas(format($q$update public.debts set owner_id = null where id = %L$q$, d_b)) = 1, 'B comparte su deuda con A';
  assert public.filas(format($q$update public.debts set owner_id = %L where id = %L$q$, b, d_b)) = 1, 'B vuelve a quedarse su deuda';

  -- ---------- Pagos de deuda ----------
  perform public.debe_fallar(format($q$insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L, %L, 1000, %L)$q$, h, d_a, b));
  insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (h, d_dos, 1000, b);
  insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (h, d_b, 1000, b);
  perform public.debe_fallar(format($q$insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L, %L, 1000, %L)$q$, h, d_dos, a));  -- a nombre de otra persona
  perform public.como(a);
  insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (h, d_a, 1000, a);
  perform public.debe_fallar(format($q$insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L, %L, 1000, %L)$q$, h, d_b, a));  -- deuda de B
  assert public.filas(format($q$delete from public.debts where id = %L$q$, d_b)) = 0, 'A no borra la deuda de B';

  -- Una persona de otro hogar no ve ni toca nada
  perform public.como(c);
  assert (select count(*) from public.debts) = 0, 'C no ve deudas ajenas';
  assert public.filas(format($q$delete from public.debts where id = %L$q$, d_dos)) = 0, 'C no borra deudas ajenas';
  perform public.debe_fallar(format($q$insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (%L, %L, 1000, %L)$q$, hc, d_dos, c));

  -- La dueña sí borra la suya
  perform public.como(a);
  assert public.filas(format($q$delete from public.debts where id = %L$q$, d_a)) = 1, 'A borra su propia deuda';

  -- ---------- Perfil: solo su dueño ----------
  insert into public.profiles (user_id, household_id, profession, employment, dependents) values (a, h, 'Enfermera', 'dependiente', 2);
  assert (select count(*) from public.profiles) = 1, 'A lee su perfil';
  perform public.como(b);
  assert (select count(*) from public.profiles) = 0, 'B (la pareja) no lee el perfil de A';
  assert public.filas(format($q$update public.profiles set profession = 'x' where user_id = %L$q$, a)) = 0, 'B no edita el perfil de A';
  assert public.filas(format($q$delete from public.profiles where user_id = %L$q$, a)) = 0, 'B no borra el perfil de A';

  -- ---------- partner_can_see: solo responde por mi hogar ----------
  perform public.como(c);
  update public.members set share_debts = false where user_id = c;
  perform public.como(b);
  assert public.partner_can_see(c, 'debts') = true, 'no revela que C esconde sus deudas (C es de otro hogar)';
  perform public.como(a);
  update public.members set share_debts = false where user_id = a;
  perform public.como(b);
  assert public.partner_can_see(a, 'debts') = false, 'dentro del hogar sí respeta lo que A decidió';
  assert public.partner_can_see(b, 'debts') = true, 'lo propio siempre se ve';
  assert public.partner_can_see(null, 'debts') = true, 'lo sin dueño siempre se ve';

  -- ---------- Código de invitación: tope de intentos ----------
  perform public.como(d);
  for i in 1..10 loop
    assert public.join_household('CODIGOMALO' || i, 'Dani') is null, 'un código malo no une a nadie';
  end loop;
  perform public.debe_fallar($q$select public.join_household('CODIGOMALO11', 'Dani')$q$);
  reset role;
  assert (select count(*) from public.invite_attempts where user_id = d) = 10, 'el intento bloqueado no se registra';

  -- Tope diario: 30 intentos en 24 horas aunque se repartan en horas distintas
  delete from public.invite_attempts where user_id = d;
  insert into public.invite_attempts (user_id, at) select d, now() - (g * interval '40 minutes') from generate_series(2, 31) g;
  set local role authenticated;
  perform public.como(d);
  perform public.debe_fallar($q$select public.join_household('OTROCODIGO', 'Dani')$q$);
end $$;

rollback;
select 'deudas_perfil_invitacion: OK' as resultado;
