-- Privacidad con la pareja: cada persona decide qué parte de lo suyo ve la otra.
-- Por defecto todo sigue visible (nada cambia hasta que alguien lo esconde). El sueldo, los ingresos
-- extra y el análisis personal ya eran privados y siguen siéndolo siempre.
--
-- Qué se puede esconder (solo lo que es de esa persona; lo compartido siempre se ve):
--   share_debts     deudas donde figura como titular y sus pagos
--   share_fixed     gastos fijos personales (no compartidos) que paga
--   share_personal  gastos personales (no compartidos) que pagó
--   share_savings   aportes a metas que hizo

alter table public.members
  add column share_debts    boolean not null default true,
  add column share_fixed    boolean not null default true,
  add column share_personal boolean not null default true,
  add column share_savings  boolean not null default true;

-- Cada persona cambia solo lo suyo: la política members_update_self limita la fila y este permiso las columnas
grant update (share_debts, share_fixed, share_personal, share_savings) on public.members to authenticated;

-- ¿Puede quien consulta ver lo que es de `owner` en este tema? Siempre ve lo suyo y lo que no tiene dueño.
-- Si el dueño ya salió del hogar (sin fila activa), el historial se mantiene como estaba.
create function public.partner_can_see(owner uuid, topic text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select owner is null
      or owner = (select auth.uid())
      or coalesce((
        select case topic
                 when 'debts'    then m.share_debts
                 when 'fixed'    then m.share_fixed
                 when 'personal' then m.share_personal
                 when 'savings'  then m.share_savings
                 else true
               end
          from public.members m
         where m.user_id = owner and m.left_at is null
         limit 1
      ), true)
$$;

revoke all on function public.partner_can_see(uuid, text) from public, anon;
grant execute on function public.partner_can_see(uuid, text) to authenticated;

-- Gastos: lo compartido siempre se ve; lo personal, si su dueño lo permite (o lo anotó quien consulta)
drop policy expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (
    public.is_member(household_id)
    and (shared
         or created_by = (select auth.uid())
         or public.partner_can_see(paid_by, 'personal'))
  );

-- Gastos fijos
drop policy recurring_select on public.recurring_expenses;
create policy recurring_select on public.recurring_expenses for select to authenticated
  using (
    public.is_member(household_id)
    and (shared
         or created_by = (select auth.uid())
         or public.partner_can_see(paid_by, 'fixed'))
  );

-- Deudas (owner_id null = de los dos) y, a través de ellas, sus pagos
drop policy debts_select on public.debts;
create policy debts_select on public.debts for select to authenticated
  using (public.is_member(household_id) and public.partner_can_see(owner_id, 'debts'));

drop policy debt_payments_select on public.debt_payments;
create policy debt_payments_select on public.debt_payments for select to authenticated
  using (
    public.is_member(household_id)
    and exists (select 1 from public.debts d where d.id = debt_id)
  );

-- Aportes a metas
drop policy contributions_select on public.contributions;
create policy contributions_select on public.contributions for select to authenticated
  using (public.is_member(household_id) and public.partner_can_see(user_id, 'savings'));
