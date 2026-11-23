-- Copyright (c) 2026 Dinovance
-- big_spend_alert_prefs y set_big_spend_alert: RLS por persona, validacion, valores por defecto.
-- Ejecutar (SOLO staging local): docker exec -i nido-selfhost-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/alerta_gasto_mayor.sql
begin;
insert into auth.users (id, aud, role, email, email_confirmed_at)
values ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'big-d1@test.cl', now()),
       ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'big-d2@test.cl', now());

create function public.t_falla(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlstate; end $$;
grant execute on function public.t_falla(text) to authenticated, anon;

do $$
declare n bigint; r record; s text;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true);
  set local role authenticated;
  select count(*) into n from public.big_spend_alert_prefs;
  if n <> 0 then raise exception 'FALLA: sin preferencia no debe haber filas (%)', n; end if;
  perform public.set_big_spend_alert(true, 80000);
  perform public.set_big_spend_alert(true, 90000); -- upsert: sigue siendo una fila
  select * into r from public.big_spend_alert_prefs;
  if not r.enabled or r.threshold_clp <> 90000 then raise exception 'FALLA: upsert (% %)', r.enabled, r.threshold_clp; end if;
  raise notice 'OK: la persona guarda y actualiza su preferencia (una fila)';

  s := public.t_falla('insert into public.big_spend_alert_prefs (enabled) values (true)');
  if s = 'OK' then raise exception 'FALLA: INSERT directo permitido'; end if;
  s := public.t_falla('update public.big_spend_alert_prefs set threshold_clp = 1');
  if s = 'OK' then raise exception 'FALLA: UPDATE directo permitido'; end if;
  s := public.t_falla('delete from public.big_spend_alert_prefs');
  if s = 'OK' then raise exception 'FALLA: DELETE directo permitido'; end if;
  foreach s in array array['select public.set_big_spend_alert(true, 0)', 'select public.set_big_spend_alert(true, -5)', 'select public.set_big_spend_alert(true, 10000000000)', 'select public.set_big_spend_alert(null, 5000)', 'select public.set_big_spend_alert(true, null)'] loop
    if public.t_falla(s) <> '22023' then raise exception 'FALLA: valor invalido aceptado: %', s; end if;
  end loop;
  raise notice 'OK: sin escritura directa y con validacion de rango (22023)';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2"}', true);
  select count(*) into n from public.big_spend_alert_prefs;
  if n <> 0 then raise exception 'FALLA: la otra persona ve la preferencia ajena (%)', n; end if;
  perform public.set_big_spend_alert(false, 50000);
  reset role;
  select count(*) into n from public.big_spend_alert_prefs where user_id = '00000000-0000-0000-0000-0000000000d1' and enabled and threshold_clp = 90000;
  if n <> 1 then raise exception 'FALLA: la preferencia de la primera persona cambio'; end if;
  raise notice 'OK: cada quien ve y cambia solo la suya';

  set local role anon;
  if public.t_falla('select public.set_big_spend_alert(true, 5000)') = 'OK' then raise exception 'FALLA: anon ejecuto la RPC'; end if;
  reset role;
  select threshold_clp into n from public.big_spend_alert_prefs where user_id = '00000000-0000-0000-0000-0000000000d2';
  if n <> 50000 then raise exception 'FALLA: el umbral por defecto/guardado es %', n; end if;
  raise notice 'OK: anon no puede; umbral guardado 50000';
end $$;
rollback;
