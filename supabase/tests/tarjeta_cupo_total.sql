-- Copyright (c) 2026 Dinovance
-- Cupo total de una tarjeta (debts.credit_limit, migración 20261123140000). Nullable, >= 0, sin relación con el cupo
-- utilizado (reported_balance): una tarjeta puede estar sobregirada. Sigue la RLS de debts.
-- Ejecutar SOLO en un Postgres desechable o en la base local (nunca producción). Todo termina en ROLLBACK.
-- Cualquier FALLA aborta con excepción; si todo pasa imprime «OK: ...» y «RESUMEN tarjeta_cupo_total pasa=N».
begin;
insert into auth.users (id, aud, role, email, email_confirmed_at)
values ('00000000-0000-0000-0000-0000000c0a01', 'authenticated', 'authenticated', 'cupo-a@example.invalid', now()),
       ('00000000-0000-0000-0000-0000000c0b02', 'authenticated', 'authenticated', 'cupo-b@example.invalid', now()),
       ('00000000-0000-0000-0000-0000000c0c03', 'authenticated', 'authenticated', 'cupo-x@example.invalid', now());

create function public.t_cupo(q text) returns text language plpgsql as $$
begin execute q; return 'OK'; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
grant execute on function public.t_cupo(text) to authenticated;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000c0a01';
  b uuid := '00000000-0000-0000-0000-0000000c0b02';
  x uuid := '00000000-0000-0000-0000-0000000c0c03';
  h uuid; hx uuid; cat uuid; d uuid; dnull uuid; s text; v bigint; k int; n int := 0;
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  -- 0. La columna existe, es nullable y del mismo tipo que original_amount
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'debts' and column_name = 'credit_limit'
                    and is_nullable = 'YES'
                    and data_type = (select data_type from information_schema.columns
                                      where table_schema = 'public' and table_name = 'debts' and column_name = 'original_amount')) then
    raise exception 'FALLA 0: falta debts.credit_limit nullable del mismo tipo que original_amount';
  end if;
  if col_description('public.debts'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.debts'::regclass and attname = 'credit_limit')) is null then
    raise exception 'FALLA 0b: debts.credit_limit no tiene comentario';
  end if;
  n := n + 1; raise notice 'OK 0: columna credit_limit nullable, mismo tipo que original_amount y con comentario';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  h := public.create_household('Cupo Casa', 'Ana');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', x, 'role', 'authenticated')::text, true);
  hx := public.create_household('Otra Casa', 'Xime');
  reset role;
  insert into public.members (household_id, user_id, display_name) values (h, b, 'Beto');
  select id into cat from public.categories where household_id = h limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- 1. Tarjeta sobregirada: cupo 960.000 y cupo utilizado 1.056.339 (no hay check entre ambos)
  insert into public.debts (household_id, name, kind, original_amount, owner_id, credit_limit, reported_balance, reported_at)
    values (h, 'Visa de A', 'tarjeta', 1056339, a, 960000, 1056339, hoy) returning id into d;
  select credit_limit into v from public.debts where id = d;
  if v is distinct from 960000 then raise exception 'FALLA 1: credit_limit guardado = %', v; end if;
  n := n + 1; raise notice 'OK 1: tarjeta con cupo 960000 y cupo utilizado 1056339 se guarda';

  -- 2. Cupo negativo: rechazado al insertar y al editar
  s := public.t_cupo(format('insert into public.debts (household_id, name, kind, original_amount, owner_id, credit_limit) values (%L, %L, %L, 1000, %L, -1)', h, 'Mala', 'tarjeta', a));
  if s not like '23514 %' then raise exception 'FALLA 2a: aceptó un cupo negativo al insertar (%)', s; end if;
  s := public.t_cupo(format('update public.debts set credit_limit = -5 where id = %L', d));
  if s not like '23514 %' then raise exception 'FALLA 2b: aceptó un cupo negativo al editar (%)', s; end if;
  n := n + 1; raise notice 'OK 2: cupo negativo rechazado';

  -- 3. NULL funciona (tarjeta sin cupo y cualquier otra deuda); el cupo 0 también
  insert into public.debts (household_id, name, kind, original_amount) values (h, 'CMR sin cupo', 'tarjeta', 1000) returning id into dnull;
  s := public.t_cupo(format('insert into public.debts (household_id, name, kind, original_amount, credit_limit) values (%L, %L, %L, 5000, null)', h, 'Crédito', 'credito'));
  if s <> 'OK' then raise exception 'FALLA 3a: un crédito sin cupo no se guarda (%)', s; end if;
  s := public.t_cupo(format('update public.debts set credit_limit = 0 where id = %L', dnull));
  if s <> 'OK' then raise exception 'FALLA 3b: cupo 0 rechazado (%)', s; end if;
  n := n + 1; raise notice 'OK 3: cupo NULL o 0 se acepta, en tarjetas y en otras deudas';

  -- 4. El titular edita el cupo (y lo puede borrar)
  s := public.t_cupo(format('update public.debts set credit_limit = 1200000 where id = %L', d));
  if s <> 'OK' then raise exception 'FALLA 4a: el titular no pudo editar el cupo (%)', s; end if;
  select credit_limit into v from public.debts where id = d;
  if v is distinct from 1200000 then raise exception 'FALLA 4b: el cupo editado quedó en %', v; end if;
  s := public.t_cupo(format('update public.debts set credit_limit = null where id = %L', dnull));
  if s <> 'OK' then raise exception 'FALLA 4c: el titular no pudo borrar el cupo (%)', s; end if;
  n := n + 1; raise notice 'OK 4: el titular edita y borra el cupo';

  -- 5. Otra persona de OTRO hogar no lo ve ni lo edita
  perform set_config('request.jwt.claims', jsonb_build_object('sub', x, 'role', 'authenticated')::text, true);
  select count(*) into k from public.debts where id = d;
  if k <> 0 then raise exception 'FALLA 5a: otro hogar ve la tarjeta'; end if;
  update public.debts set credit_limit = 1 where id in (d, dnull);
  get diagnostics k = row_count;
  if k <> 0 then raise exception 'FALLA 5b: otro hogar editó el cupo (% filas)', k; end if;
  n := n + 1; raise notice 'OK 5: otro hogar no lee ni edita el cupo';

  -- 6. La pareja no edita el cupo de una tarjeta personal de A (RLS de debts_update)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  update public.debts set credit_limit = 1 where id = d;
  get diagnostics k = row_count;
  if k <> 0 then raise exception 'FALLA 6: la pareja editó el cupo de la tarjeta personal de A'; end if;
  n := n + 1; raise notice 'OK 6: la pareja no edita el cupo de una tarjeta personal';
  reset role;

  select credit_limit into v from public.debts where id = d;
  if v is distinct from 1200000 then raise exception 'FALLA 5c: el cupo cambió a % por otra persona', v; end if;

  -- 7. El trigger debts_tarjeta_con_gastos sigue vigente: con un gasto cargado, editar el cupo pasa y cambiar el tipo no
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.expenses (household_id, category_id, amount, paid_by, created_by, note, payment_method, card_debt_id)
    values (h, cat, 1000, a, a, 'cupo gasto', 'tarjeta', d);
  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  s := public.t_cupo(format('update public.debts set credit_limit = 960000 where id = %L', d));
  if s <> 'OK' then raise exception 'FALLA 7a: con gastos cargados no deja editar el cupo (%)', s; end if;
  s := public.t_cupo(format('update public.debts set kind = %L where id = %L', 'credito', d));
  if s not like '23514 %tarjeta tiene gastos%' then raise exception 'FALLA 7b: el trigger de tarjeta con gastos dejó de actuar (%)', s; end if;
  reset role;
  n := n + 1; raise notice 'OK 7: trigger debts_tarjeta_con_gastos intacto';

  raise notice 'RESUMEN tarjeta_cupo_total pasa=% falla=0', n;
end $$;
rollback;
