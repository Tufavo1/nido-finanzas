-- Endurecimiento de seguridad (auditoría del 2026-11-02).
--
--  1. apply_recurring() ya no deja los gastos fijos personales ocultos a la vista de la pareja:
--     los gastos generados quedan a nombre de quien creó la regla, no de quien abrió la app.
--  2. Aportes y pagos de deuda: solo se crean, corrigen y borran a nombre propio.
--  3. Gastos y gastos fijos personales (no compartidos): solo los toca su dueño; lo compartido lo toca cualquiera del hogar.
--  4. Notificaciones push: el endpoint tiene que ser https y de un servicio de push conocido (evita SSRF desde la función notify).
--  5. notify: cada gasto o aporte avisa una sola vez (notified_at), así no se puede repetir el aviso.

-- =====================================================================
-- 1. Gastos fijos: quién queda como autor del gasto generado
-- =====================================================================
create or replace function public.apply_recurring()
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_h      uuid := public.my_household();
  v_today  date := (now() at time zone 'America/Santiago')::date;
  v_month  date := date_trunc('month', v_today)::date;
  r        record;
  m        date;
  target   date;
  n        int := 0;
begin
  if v_h is null then
    return 0;
  end if;
  for r in
    select * from public.recurring_expenses
     where household_id = v_h and active
       and (last_applied is null or last_applied < v_month)
     for update
  loop
    m := coalesce((r.last_applied + interval '1 month')::date, date_trunc('month', r.starts_on)::date);
    while m <= v_month loop
      target := least(m + (r.day_of_month - 1), (m + interval '1 month' - interval '1 day')::date);
      exit when target > v_today;
      if target >= r.starts_on then
        -- created_by = quien creó la regla. Si fuera quien abre la app, esa persona vería (por ser «autora»)
        -- un gasto personal que la otra decidió esconderle.
        insert into public.expenses (household_id, category_id, amount, paid_by, shared, note, spent_on, created_by, recurring_id)
        values (v_h, r.category_id, r.amount, r.paid_by, r.shared, r.note, target, r.created_by, r.id);
        n := n + 1;
      end if;
      update public.recurring_expenses set last_applied = m where id = r.id;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
  return n;
end;
$$;

-- Lo ya generado con el autor equivocado se corrige
update public.expenses e
   set created_by = r.created_by
  from public.recurring_expenses r
 where e.recurring_id = r.id
   and e.created_by is distinct from r.created_by;

-- =====================================================================
-- 2 y 3. Políticas: cada persona toca lo suyo; lo compartido, cualquiera del hogar
-- =====================================================================

-- Gastos
drop policy expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (
    public.is_member(household_id)
    and created_by = (select auth.uid())
    and (shared or paid_by = (select auth.uid()))
  );

drop policy expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (public.is_member(household_id) and (shared or paid_by = (select auth.uid())))
  with check (public.is_member(household_id) and (shared or paid_by = (select auth.uid())));

drop policy expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.is_member(household_id) and (shared or paid_by = (select auth.uid())));

-- Gastos fijos
drop policy recurring_insert on public.recurring_expenses;
create policy recurring_insert on public.recurring_expenses for insert to authenticated
  with check (
    public.is_member(household_id)
    and created_by = (select auth.uid())
    and (shared or paid_by = (select auth.uid()))
  );

drop policy recurring_update on public.recurring_expenses;
create policy recurring_update on public.recurring_expenses for update to authenticated
  using (public.is_member(household_id) and (shared or paid_by = (select auth.uid())))
  with check (public.is_member(household_id) and (shared or paid_by = (select auth.uid())));

drop policy recurring_delete on public.recurring_expenses;
create policy recurring_delete on public.recurring_expenses for delete to authenticated
  using (public.is_member(household_id) and (shared or paid_by = (select auth.uid())));

-- Aportes a metas: a nombre propio
drop policy contributions_insert on public.contributions;
create policy contributions_insert on public.contributions for insert to authenticated
  with check (public.is_member(household_id) and user_id = (select auth.uid()));

drop policy contributions_update on public.contributions;
create policy contributions_update on public.contributions for update to authenticated
  using (public.is_member(household_id) and user_id = (select auth.uid()))
  with check (public.is_member(household_id) and user_id = (select auth.uid()));

drop policy contributions_delete on public.contributions;
create policy contributions_delete on public.contributions for delete to authenticated
  using (public.is_member(household_id) and user_id = (select auth.uid()));

-- Pagos de deuda: a nombre propio (el insert ya lo exigía)
drop policy debt_payments_update on public.debt_payments;
create policy debt_payments_update on public.debt_payments for update to authenticated
  using (public.is_member(household_id) and paid_by = (select auth.uid()))
  with check (public.is_member(household_id) and paid_by = (select auth.uid()));

drop policy debt_payments_delete on public.debt_payments;
create policy debt_payments_delete on public.debt_payments for delete to authenticated
  using (public.is_member(household_id) and paid_by = (select auth.uid()));

-- =====================================================================
-- 4. Push: solo servicios de push conocidos, siempre por https
-- =====================================================================
-- Lo que ya estaba guardado y no cumple se borra: la persona lo vuelve a crear al reactivar los avisos.
delete from public.push_subscriptions
 where not (
   char_length(endpoint) <= 600
   and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9._~:/?#\[\]@!$&''()*+,;=%-]*$'
 );

alter table public.push_subscriptions
  add constraint push_endpoint_conocido check (
    char_length(endpoint) <= 600
    and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9._~:/?#\[\]@!$&''()*+,;=%-]*$'
  ),
  add constraint push_llaves_largo check (char_length(p256dh) between 1 and 200 and char_length(auth_key) between 1 and 100);

-- =====================================================================
-- 5. Cada gasto/aporte avisa una sola vez
-- =====================================================================
alter table public.expenses add column notified_at timestamptz;
alter table public.contributions add column notified_at timestamptz;
-- Solo la función notify (service_role) lo marca; las personas no pueden editarlo (el update ya es por columnas)
grant update (notified_at) on public.expenses, public.contributions to service_role;
