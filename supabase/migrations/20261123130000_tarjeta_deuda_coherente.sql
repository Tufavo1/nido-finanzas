-- Copyright (c) 2026 Dinovance
-- Una tarjeta con gastos cargados no puede dejar de ser coherente con esos gastos (hallazgo B5).
--
-- El trigger expenses_tarjeta_valida (20261123120000) revisa la tarjeta solo al escribir el GASTO. Después se podía
-- editar la DEUDA y dejar gastos colgando de algo que ya no cumple las reglas:
--   - cambiar debts.kind a algo que no es 'tarjeta' (un crédito con gastos con tarjeta encima), o
--   - cambiar debts.owner_id a una persona que no pagó esos gastos (p. ej. la pareja se adueña de la tarjeta de los
--     dos y se lleva los gastos de la otra persona a su tarjeta personal), o
--   - cambiar debts.household_id (no lo puede hacer la app; sí un rol de servicio).
--
-- Se RECHAZA el cambio con un error claro en vez de limpiar expenses.card_debt_id: limpiar en silencio cambiaría el
-- saldo de la tarjeta y tocaría gastos de la otra persona sin que lo sepa. Para cambiar la tarjeta primero se mueven o
-- se borran sus gastos. Sigue permitido: renombrar, archivar, montos, saldo informado, pasarla a «de los dos»
-- (owner_id = null) y asignarla a quien pagó todos sus gastos.
--
-- Idempotente y aditiva: solo crea o reemplaza una función y su trigger.

create or replace function public.check_deuda_tarjeta_con_gastos()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- security definer: tiene que ver TODOS los gastos cargados a la tarjeta, también los que la RLS le oculta a quien
  -- edita (p. ej. gastos personales de la pareja). El mensaje no dice cuáles ni de quién.
  if exists (
    select 1
      from public.expenses e
     where e.card_debt_id = new.id
       and (new.kind <> 'tarjeta'
            or e.household_id is distinct from new.household_id
            or (new.owner_id is not null and e.paid_by is distinct from new.owner_id))
  ) then
    raise exception 'Esta tarjeta tiene gastos cargados: muévelos o bórralos antes de cambiar el tipo o el titular'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.check_deuda_tarjeta_con_gastos() from public, anon, authenticated;

drop trigger if exists debts_tarjeta_con_gastos on public.debts;
create trigger debts_tarjeta_con_gastos before update of kind, owner_id, household_id on public.debts
  for each row execute function public.check_deuda_tarjeta_con_gastos();
