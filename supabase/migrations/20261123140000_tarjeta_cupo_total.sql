-- Copyright (c) 2026 Dinovance
-- Cupo total de una tarjeta de crédito (debts.credit_limit).
--
-- El estado de cuenta trae dos números: el cupo total (p. ej. $960.000) y el cupo utilizado, que ya se guarda en
-- debts.reported_balance (20261123120000). Esta migración agrega el primero.
--   - Nullable en cualquier deuda: no se exige para tarjetas ni se prohíbe en otras (la app solo lo usa con
--     kind = 'tarjeta').
--   - Mismo tipo y rango que original_amount/reported_balance (bigint, pesos enteros), nunca negativo.
--   - SIN check contra reported_balance: una tarjeta puede estar sobregirada (cupo utilizado mayor que el cupo).
-- La RLS de debts no cambia: la columna se lee y edita con las mismas políticas que el resto de la fila. Como el
-- update de debts va por columnas (20261018050000), se agrega el grant de update de esta columna.
--
-- Idempotente y aditiva.

alter table public.debts add column if not exists credit_limit bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'debts_credit_limit_rango' and conrelid = 'public.debts'::regclass) then
    alter table public.debts add constraint debts_credit_limit_rango
      check (credit_limit is null or (credit_limit >= 0 and credit_limit < 10000000000));
  end if;
end;
$$;

comment on column public.debts.credit_limit is
  'Cupo total de la tarjeta según el banco, en pesos. Opcional; solo lo usa la app con kind = ''tarjeta''. Puede ser menor que reported_balance (tarjeta sobregirada).';

grant update (credit_limit) on public.debts to authenticated;
