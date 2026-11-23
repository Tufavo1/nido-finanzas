-- Copyright (c) 2026 Dinovance
-- Modelo de dos cuentas: débito y tarjeta de crédito.
--
--  1. expenses.payment_method ('debito' | 'tarjeta', por defecto 'debito'). Un gasto con tarjeta no baja la débito:
--     sube el cupo utilizado de la tarjeta. Todo lo existente queda como 'debito' (nada cambia para lo ya guardado).
--  2. expenses.card_debt_id: la deuda tipo tarjeta (debts.kind = 'tarjeta') a la que se carga el gasto. Solo con
--     payment_method = 'tarjeta'. Si la deuda se borra, el gasto queda con tarjeta pero sin deuda asociada.
--     La tarjeta tiene que ser del mismo hogar y una que quien guarda pueda tocar (de los dos, o propia), con las
--     mismas reglas que ya tienen las deudas y sus pagos. Si es personal, el gasto tiene que estar pagado por su titular.
--  3. debts.reported_balance + debts.reported_at: saldo que informa el banco (cupo utilizado del estado de cuenta) y su
--     fecha. Cuando existe, es la verdad. Van juntos o ninguno. Los edita quien puede editar la deuda (política vigente).
--
-- Idempotente: se puede aplicar más de una vez.

-- =====================================================================
-- 1 y 2. Gastos: medio de pago y tarjeta
-- =====================================================================
alter table public.expenses add column if not exists payment_method text not null default 'debito';
alter table public.expenses add column if not exists card_debt_id uuid references public.debts (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_payment_method_valido' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_payment_method_valido check (payment_method in ('debito', 'tarjeta'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_tarjeta_coherente' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_tarjeta_coherente check (card_debt_id is null or payment_method = 'tarjeta');
  end if;
end;
$$;

-- Para el «on delete set null» y para sumar lo cargado a cada tarjeta
create index if not exists expenses_card_debt_idx on public.expenses (card_debt_id) where card_debt_id is not null;

-- El UPDATE de gastos es por columnas: se suman las nuevas (el INSERT es de tabla y ya las incluye)
grant update (payment_method, card_debt_id) on public.expenses to authenticated;

-- La tarjeta tiene que ser del hogar del gasto, de tipo tarjeta y una que quien guarda pueda tocar.
-- security definer para revisar la deuda sin depender de lo que la RLS deje ver; las reglas son las de debts_update
-- y debt_payments_insert. Una tarjeta ajena, privada o de otro hogar da el mismo error que una que no existe.
create or replace function public.check_gasto_tarjeta()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_debt record;
begin
  if new.card_debt_id is null then
    return new;
  end if;
  -- Al editar otra cosa (monto, nota...) de un gasto ya cargado a una tarjeta no se vuelve a revisar
  if tg_op = 'UPDATE'
     and new.card_debt_id is not distinct from old.card_debt_id
     and new.paid_by is not distinct from old.paid_by
     and new.household_id is not distinct from old.household_id then
    return new;
  end if;

  select d.household_id, d.owner_id, d.kind into v_debt
    from public.debts d
   where d.id = new.card_debt_id;

  if not found
     or v_debt.household_id is distinct from new.household_id
     or (v_uid is not null and v_debt.owner_id is not null and v_debt.owner_id <> v_uid) then
    raise exception 'Tarjeta no válida para este gasto' using errcode = '42501';
  end if;
  if v_debt.kind <> 'tarjeta' then
    raise exception 'La deuda elegida no es una tarjeta de crédito' using errcode = 'check_violation';
  end if;
  if v_debt.owner_id is not null and v_debt.owner_id <> new.paid_by then
    raise exception 'Una tarjeta personal solo la usa su titular' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.check_gasto_tarjeta() from public, anon, authenticated;

drop trigger if exists expenses_tarjeta_valida on public.expenses;
create trigger expenses_tarjeta_valida before insert or update of card_debt_id, paid_by, household_id on public.expenses
  for each row execute function public.check_gasto_tarjeta();

-- =====================================================================
-- 3. Deudas: saldo informado por el banco
-- =====================================================================
alter table public.debts add column if not exists reported_balance bigint;
alter table public.debts add column if not exists reported_at date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'debts_reported_balance_rango' and conrelid = 'public.debts'::regclass) then
    alter table public.debts add constraint debts_reported_balance_rango
      check (reported_balance is null or (reported_balance >= 0 and reported_balance < 10000000000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'debts_reported_juntos' and conrelid = 'public.debts'::regclass) then
    alter table public.debts add constraint debts_reported_juntos check ((reported_balance is null) = (reported_at is null));
  end if;
end;
$$;

grant update (reported_balance, reported_at) on public.debts to authenticated;

-- Misma regla de fechas que el resto (ni futura ni anterior a 2000)
drop trigger if exists debts_reported_fecha_valida on public.debts;
create trigger debts_reported_fecha_valida before insert or update of reported_at on public.debts
  for each row execute function public.check_fecha_valida('reported_at');
