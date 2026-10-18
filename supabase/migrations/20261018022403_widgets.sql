-- Widgets: tokens de solo lectura y resumen de totales

create table public.widget_tokens (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 40),
  token_hash   text not null unique,
  created_by   uuid not null default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (household_id, created_by) references public.members (household_id, user_id)
);

create index widget_tokens_household_idx on public.widget_tokens (household_id);

revoke all on public.widget_tokens from anon, authenticated;
-- Nunca se concede lectura de token_hash al navegador
grant select (id, household_id, label, created_at) on public.widget_tokens to authenticated;
grant delete on public.widget_tokens to authenticated;

alter table public.widget_tokens enable row level security;
create policy widget_tokens_select on public.widget_tokens
  for select to authenticated using (public.is_member(household_id));
create policy widget_tokens_delete on public.widget_tokens
  for delete to authenticated using (public.is_member(household_id));

-- Crea un token y lo devuelve UNA sola vez (en la base solo queda su hash)
create or replace function public.create_widget_token(p_label text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_h     uuid;
  v_token text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  select household_id into v_h from public.members where user_id = v_uid;
  if v_h is null then
    raise exception 'No perteneces a ningún hogar';
  end if;
  if (select count(*) from public.widget_tokens where household_id = v_h) >= 5 then
    raise exception 'Máximo 5 widgets activos. Revoca alguno primero.';
  end if;

  v_token := 'nw_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.widget_tokens (household_id, label, token_hash, created_by)
  values (v_h, trim(p_label), encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid);

  return v_token;
end;
$$;

-- Resumen solo de totales. STABLE para que también funcione con GET (Android/KWGT)
create or replace function public.widget_summary(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_h     uuid;
  v_start date;
  v_end   date;
  v_today date;
begin
  select household_id into v_h
  from public.widget_tokens
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  if v_h is null then
    raise exception 'Token inválido' using errcode = '28000';
  end if;

  v_today := (now() at time zone 'America/Santiago')::date;
  v_start := date_trunc('month', v_today)::date;
  v_end   := (v_start + interval '1 month')::date;

  return jsonb_build_object(
    'month', to_char(v_start, 'YYYY-MM'),
    'spent', coalesce((select sum(amount) from public.expenses
                       where household_id = v_h and spent_on >= v_start and spent_on < v_end), 0),
    'budget', coalesce((select sum(monthly_budget) from public.categories
                        where household_id = v_h and not archived), 0),
    'days_left', (v_end - 1) - v_today,
    'by_member', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', m.display_name, 'color', m.color, 'spent', coalesce(s.total, 0))
             order by m.joined_at)
      from public.members m
      left join (select paid_by, sum(amount) as total from public.expenses
                 where household_id = v_h and spent_on >= v_start and spent_on < v_end
                 group by paid_by) s on s.paid_by = m.user_id
      where m.household_id = v_h), '[]'::jsonb),
    'goal', (select jsonb_build_object(
               'name', g.name, 'target', g.target_amount,
               'saved', coalesce((select sum(c.amount) from public.contributions c where c.goal_id = g.id), 0))
             from public.goals g
             where g.household_id = v_h and not g.archived
             order by g.created_at limit 1)
  );
end;
$$;

revoke all on function public.create_widget_token(text) from public, anon;
revoke all on function public.widget_summary(text)      from public;
grant execute on function public.create_widget_token(text) to authenticated;
grant execute on function public.widget_summary(text)      to anon, authenticated;