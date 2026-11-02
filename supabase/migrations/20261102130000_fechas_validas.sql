-- Integridad: la interfaz ya impide fechas futuras, pero la API las aceptaba (y también fechas absurdas como 1900).
-- Se valida en la base para que ningún cliente pueda saltarse la regla. Es un trigger (no un CHECK) porque
-- depende de «hoy», y un CHECK con now() rompería al restaurar respaldos.
create function public.check_fecha_valida()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d     date := (to_jsonb(new) ->> tg_argv[0])::date;
  -- un día de margen por diferencias de zona horaria
  tope  date := (now() at time zone 'America/Santiago')::date + 1;
begin
  if d > tope then
    raise exception 'La fecha no puede ser futura' using errcode = 'check_violation';
  end if;
  if d < date '2000-01-01' then
    raise exception 'La fecha es demasiado antigua' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger expenses_fecha_valida before insert or update of spent_on on public.expenses
  for each row execute function public.check_fecha_valida('spent_on');
create trigger contributions_fecha_valida before insert or update of contributed_on on public.contributions
  for each row execute function public.check_fecha_valida('contributed_on');
create trigger debt_payments_fecha_valida before insert or update of paid_on on public.debt_payments
  for each row execute function public.check_fecha_valida('paid_on');
create trigger incomes_fecha_valida before insert or update of received_on on public.incomes
  for each row execute function public.check_fecha_valida('received_on');
