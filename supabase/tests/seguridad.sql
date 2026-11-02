-- Seguridad: lo que la auditoría del 2026-11-02 encontró no debe poder repetirse.
-- Ejecutar: docker exec -i supabase_db_nido psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/seguridad.sql
begin;

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@test.cl'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@test.cl');

create function public.como(u uuid) returns void
language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u)::text, true) $$;
grant execute on function public.como(uuid) to authenticated;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  h uuid; code text; cat uuid; g uuid; d uuid; pay uuid; e_sh uuid; e_pe uuid; n int;
begin
  set local role authenticated;

  perform public.como(a);
  h := public.create_household('Casa', 'Ana');
  select invite_code into code from public.households;
  select id into cat from public.categories where name = 'Supermercado';
  perform public.como(b);
  perform public.join_household(code, 'Beto');

  -- ---- 1. Un fijo personal escondido no se filtra cuando la pareja abre la app primero
  perform public.como(a);
  insert into public.recurring_expenses (household_id, category_id, amount, note, paid_by, shared, day_of_month, starts_on)
    values (h, cat, 9000, 'SECRETO-gym', a, false, 1, (current_date - interval '40 days')::date);
  update public.members set share_fixed = false, share_personal = false where user_id = a;
  perform public.como(b);
  perform public.apply_recurring();
  assert (select count(*) from public.expenses where note = 'SECRETO-gym') = 0, 'B no ve el gasto fijo personal oculto de A';
  perform public.como(a);
  assert (select count(*) from public.expenses where note = 'SECRETO-gym') > 0, 'A sí ve el suyo';
  assert (select count(*) from public.expenses where note = 'SECRETO-gym' and created_by = a) > 0, 'el autor es quien creó la regla';

  -- ---- 2. Aportes a nombre propio
  insert into public.goals (household_id, name, target_amount) values (h, 'Viaje', 900000) returning id into g;
  perform public.como(b);
  begin
    insert into public.contributions (household_id, goal_id, user_id, amount) values (h, g, a, 50000);
    assert false, 'B no debe poder aportar a nombre de A';
  exception when insufficient_privilege then null; end;
  insert into public.contributions (household_id, goal_id, user_id, amount) values (h, g, b, 1000);
  assert (select count(*) from public.contributions where user_id = b) = 1, 'B aporta a su nombre';

  perform public.como(a);
  insert into public.contributions (household_id, goal_id, user_id, amount) values (h, g, a, 20000);
  perform public.como(b);
  update public.contributions set amount = 1 where user_id = a;
  get diagnostics n = row_count;
  assert n = 0, 'B no corrige aportes de A';
  delete from public.contributions where user_id = a;
  get diagnostics n = row_count;
  assert n = 0, 'B no borra aportes de A';
  update public.contributions set amount = 2000 where user_id = b;
  get diagnostics n = row_count;
  assert n = 1, 'B sí corrige el suyo';

  -- ---- 3. Pagos de deuda a nombre propio
  perform public.como(a);
  insert into public.debts (household_id, name, original_amount) values (h, 'Auto', 500000) returning id into d;
  insert into public.debt_payments (household_id, debt_id, amount, paid_by) values (h, d, 10000, a) returning id into pay;
  perform public.como(b);
  update public.debt_payments set amount = 1 where id = pay;
  get diagnostics n = row_count;
  assert n = 0, 'B no corrige un pago de A';
  delete from public.debt_payments where id = pay;
  get diagnostics n = row_count;
  assert n = 0, 'B no borra un pago de A';
  perform public.como(a);
  update public.debt_payments set amount = 12000 where id = pay;
  get diagnostics n = row_count;
  assert n = 1, 'A sí corrige el suyo';

  -- ---- 3b. Gastos personales: solo su dueño; compartidos: cualquiera del hogar
  perform public.como(a);
  update public.members set share_personal = true, share_fixed = true where user_id = a;
  insert into public.expenses (household_id, category_id, amount, paid_by, shared, note) values (h, cat, 1000, a, true, 'compartido') returning id into e_sh;
  insert into public.expenses (household_id, category_id, amount, paid_by, shared, note) values (h, cat, 2000, a, false, 'personal') returning id into e_pe;
  perform public.como(b);
  assert (select count(*) from public.expenses where id = e_pe) = 1, 'B ve el personal porque A lo comparte';
  update public.expenses set amount = 1 where id = e_pe;
  get diagnostics n = row_count;
  assert n = 0, 'B no edita un gasto personal de A';
  delete from public.expenses where id = e_pe;
  get diagnostics n = row_count;
  assert n = 0, 'B no borra un gasto personal de A';
  update public.expenses set amount = 1100 where id = e_sh;
  get diagnostics n = row_count;
  assert n = 1, 'B sí edita un gasto compartido';
  begin
    update public.expenses set shared = false where id = e_sh;   -- lo volvería personal de A
    get diagnostics n = row_count;
    assert false, 'B no debe poder volver personal (de A) un gasto compartido';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.expenses (household_id, category_id, amount, paid_by, shared, note) values (h, cat, 500, a, false, 'colado');
    assert false, 'B no debe crear un gasto personal a nombre de A';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.recurring_expenses (household_id, category_id, amount, note, paid_by, shared, day_of_month) values (h, cat, 500, 'colado', a, false, 1);
    assert false, 'B no debe crear un fijo personal a nombre de A';
  exception when insufficient_privilege then null; end;

  -- ---- 4. Push: solo https y servicios conocidos
  begin
    insert into public.push_subscriptions (endpoint, p256dh, auth_key) values ('http://169.254.169.254/latest/meta-data/', 'x', 'y');
    assert false, 'no se acepta una URL interna';
  exception when check_violation then null; end;
  begin
    insert into public.push_subscriptions (endpoint, p256dh, auth_key) values ('https://fcm.googleapis.com.evil.com/x', 'x', 'y');
    assert false, 'no se acepta un dominio parecido';
  exception when check_violation then null; end;
  begin
    insert into public.push_subscriptions (endpoint, p256dh, auth_key) values ('https://fcm.googleapis.com@evil.com/x', 'x', 'y');
    assert false, 'no se acepta usuario@dominio';
  exception when check_violation then null; end;
  begin
    insert into public.push_subscriptions (endpoint, p256dh, auth_key) values ('https://fcm.googleapis.com:8443/x', 'x', 'y');
    assert false, 'no se acepta un puerto';
  exception when check_violation then null; end;
  insert into public.push_subscriptions (endpoint, p256dh, auth_key) values ('https://fcm.googleapis.com/fcm/send/abc123', 'x', 'y');
  insert into public.push_subscriptions (endpoint, p256dh, auth_key) values ('https://updates.push.services.mozilla.com/wpush/v2/abc', 'x', 'y');
  insert into public.push_subscriptions (endpoint, p256dh, auth_key) values ('https://web.push.apple.com/QAbc', 'x', 'y');
  insert into public.push_subscriptions (endpoint, p256dh, auth_key) values ('https://wns2-par02p.notify.windows.com/w/?token=abc', 'x', 'y');

  -- ---- 5. notified_at no se edita desde la app
  perform public.como(a);
  begin
    update public.expenses set notified_at = now() where id = e_sh;
    assert false, 'las personas no marcan notified_at';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
select 'seguridad: OK' as resultado;
