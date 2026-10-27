-- Reparto de los gastos compartidos: por defecto mitad y mitad, pero una pareja puede acordar
-- otro porcentaje (por ejemplo 60/40 si una persona gana más). Solo agrega: no toca datos existentes.
--
-- share_pct es la parte que le toca a esa persona (1 a 99). Las dos personas activas del hogar
-- suman 100; si alguna está en null se reparte por igual. Solo se cambia con set_expense_split,
-- que escribe las dos filas a la vez para que nunca queden desalineadas.

alter table public.members add column share_pct smallint check (share_pct between 1 and 99);

-- pct = la parte de quien llama; la otra persona recibe el resto. null vuelve a mitad y mitad.
create function public.set_expense_split(pct integer)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_h   uuid := public.my_household();
begin
  if v_h is null then
    raise exception 'No perteneces a ningún hogar';
  end if;
  perform 1 from public.households where id = v_h for update;

  if pct is null then
    update public.members set share_pct = null where household_id = v_h and left_at is null;
    return;
  end if;
  if pct < 1 or pct > 99 then
    raise exception 'El porcentaje debe estar entre 1 y 99' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.members where household_id = v_h and left_at is null) <> 2 then
    raise exception 'El reparto solo aplica a hogares de 2 personas';
  end if;
  update public.members
     set share_pct = case when user_id = v_uid then pct else 100 - pct end
   where household_id = v_h and left_at is null;
end;
$$;

-- Si alguien sale, el reparto acordado deja de tener sentido: vuelve a mitad y mitad
create or replace function public.reset_split_on_leave()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.left_at is not null and old.left_at is null then
    update public.members set share_pct = null where household_id = new.household_id;
  end if;
  return new;
end;
$$;

create trigger members_reset_split after update of left_at on public.members
  for each row execute function public.reset_split_on_leave();

revoke all on function public.set_expense_split(integer), public.reset_split_on_leave() from public, anon;
grant execute on function public.set_expense_split(integer) to authenticated;
